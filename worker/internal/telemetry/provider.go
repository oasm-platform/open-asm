package telemetry

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"os"
	goruntime "runtime"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"google.golang.org/protobuf/types/known/timestamppb"
	"oasm-worker/internal/execution"
	workers "oasm-worker/internal/gen/workers"
	"oasm-worker/internal/hostmetrics"
	"oasm-worker/internal/resource"
	"oasm-worker/internal/runtime"
)

const maxReportedContainers = 500

type Manager interface {
	ContainerSnapshots() []execution.ContainerDescriptor
	InspectContainer(context.Context, runtime.Handle) (runtime.InspectResult, error)
	MaxConcurrency() int
}

type ConnectorState interface {
	HasContainerStream(containerID string) bool
}

type Provider struct {
	manager        Manager
	connector      ConnectorState
	activeJobs     func() int
	maxConcurrency int
	runMode        string
	version        string
	instanceID     string
	startedAt      time.Time
	state          atomic.Int32
	now            func() time.Time
}

func NewProvider(
	manager Manager,
	connector ConnectorState,
	activeJobs func() int,
	maxConcurrency int,
	runMode string,
	version string,
) (*Provider, error) {
	instanceID, err := randomInstanceID()
	if err != nil {
		return nil, err
	}
	if activeJobs == nil {
		activeJobs = func() int { return 0 }
	}
	if version == "" {
		version = "dev"
	}
	provider := &Provider{
		manager:        manager,
		connector:      connector,
		activeJobs:     activeJobs,
		maxConcurrency: maxConcurrency,
		runMode:        runMode,
		version:        version,
		instanceID:     instanceID,
		startedAt:      time.Now().UTC(),
		now:            time.Now,
	}
	// Prime the host sampler before the first report. CPU utilization is a
	// delta between samples, so the initial baseline should not be emitted as
	// a misleading 0% reading.
	hostmetrics.Get()
	provider.state.Store(int32(workers.WorkerRuntimeState_WORKER_RUNTIME_STATE_READY))
	return provider, nil
}

func randomInstanceID() (string, error) {
	buffer := make([]byte, 16)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return hex.EncodeToString(buffer), nil
}

func (p *Provider) InstanceID() string { return p.instanceID }

func (p *Provider) SetState(state workers.WorkerRuntimeState) {
	p.state.Store(int32(state))
}

func (p *Provider) Snapshot(ctx context.Context) (*workers.WorkerTelemetryRequest, error) {
	now := p.now().UTC()
	metrics := hostmetrics.Get()
	hostname, _ := os.Hostname()

	maxConcurrency := p.maxConcurrency
	supported := p.manager != nil
	descriptors := make([]execution.ContainerDescriptor, 0)
	if supported {
		descriptors = p.manager.ContainerSnapshots()
		if managed := p.manager.MaxConcurrency(); managed > 0 {
			maxConcurrency = managed
		}
	}

	activeCount, idleCount := descriptorCounts(descriptors)
	candidates := selectContainerDescriptors(descriptors)
	items, _, _, unhealthyCount := p.collectContainers(ctx, candidates)
	truncated := len(candidates) < len(descriptors)

	return &workers.WorkerTelemetryRequest{
		SchemaVersion: 1,
		InstanceId:    p.instanceID,
		ObservedAt:    timestamppb.New(now),
		StartedAt:     timestamppb.New(p.startedAt),
		UptimeSeconds: uint64(max(0, now.Sub(p.startedAt).Seconds())),
		State:         workers.WorkerRuntimeState(p.state.Load()),
		Version:       p.version,
		Node: &workers.WorkerNodeTelemetry{
			Hostname:         hostname,
			Os:               goruntime.GOOS,
			Arch:             goruntime.GOARCH,
			RunMode:          p.runMode,
			CpuCount:         uint32(goruntime.NumCPU()),
			CpuUsagePercent:  metrics.CPUUsage,
			MemoryUsedBytes:  metrics.MemoryUsed,
			MemoryTotalBytes: metrics.MemoryTotal,
		},
		Jobs: &workers.WorkerJobTelemetry{
			Active:         uint32(max(0, p.activeJobs())),
			MaxConcurrency: uint32(max(0, maxConcurrency)),
		},
		Containers: &workers.WorkerContainersTelemetry{
			Supported: supported,
			Total:     uint32(len(descriptors)),
			Active:    uint32(activeCount),
			Idle:      uint32(idleCount),
			Unhealthy: uint32(unhealthyCount),
			Truncated: truncated,
			Items:     items,
		},
	}, nil
}

func descriptorCounts(descriptors []execution.ContainerDescriptor) (active, idle int) {
	for _, descriptor := range descriptors {
		if descriptor.ExecutionID != "" {
			active++
		} else if descriptor.Pooled {
			idle++
		}
	}
	return active, idle
}

func selectContainerDescriptors(descriptors []execution.ContainerDescriptor) []execution.ContainerDescriptor {
	candidates := append([]execution.ContainerDescriptor(nil), descriptors...)
	sort.SliceStable(candidates, func(i, j int) bool {
		left, right := candidates[i], candidates[j]
		leftActive := left.ExecutionID != ""
		rightActive := right.ExecutionID != ""
		if leftActive != rightActive {
			return leftActive
		}
		return left.LastUsedAt.After(right.LastUsedAt)
	})
	if len(candidates) > maxReportedContainers {
		candidates = candidates[:maxReportedContainers]
	}
	return candidates
}

type inspectedContainer struct {
	item      *workers.ManagedContainerTelemetry
	active    bool
	idle      bool
	unhealthy bool
}

func (p *Provider) collectContainers(
	ctx context.Context,
	descriptors []execution.ContainerDescriptor,
) ([]*workers.ManagedContainerTelemetry, int, int, int) {
	results := make([]inspectedContainer, len(descriptors))
	semaphore := make(chan struct{}, 8)
	var wait sync.WaitGroup

	for index, descriptor := range descriptors {
		wait.Add(1)
		go func(index int, descriptor execution.ContainerDescriptor) {
			defer wait.Done()
			select {
			case semaphore <- struct{}{}:
				defer func() { <-semaphore }()
			case <-ctx.Done():
				results[index] = inspectedContainer{item: p.unknownContainer(descriptor)}
				return
			}

			inspectCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
			inspected, err := p.manager.InspectContainer(inspectCtx, descriptor.Handle)
			cancel()
			if err != nil {
				results[index] = inspectedContainer{item: p.unknownContainer(descriptor)}
				return
			}
			item := p.mapContainer(descriptor, inspected)
			results[index] = inspectedContainer{
				item:      item,
				active:    descriptor.ExecutionID != "",
				idle:      descriptor.Pooled && descriptor.ExecutionID == "",
				unhealthy: item.HealthState == workers.ContainerHealthState_CONTAINER_HEALTH_STATE_UNHEALTHY,
			}
		}(index, descriptor)
	}
	wait.Wait()

	active, idle, unhealthy := 0, 0, 0
	for _, result := range results {
		if result.active {
			active++
		}
		if result.idle {
			idle++
		}
		if result.unhealthy {
			unhealthy++
		}
	}
	sort.SliceStable(results, func(i, j int) bool {
		left, right := results[i], results[j]
		if left.unhealthy != right.unhealthy {
			return left.unhealthy
		}
		if left.active != right.active {
			return left.active
		}
		return timestampTime(left.item.GetLastUsedAt()).After(timestampTime(right.item.GetLastUsedAt()))
	})

	items := make([]*workers.ManagedContainerTelemetry, 0, len(results))
	for _, result := range results {
		items = append(items, result.item)
	}
	return items, active, idle, unhealthy
}

func (p *Provider) unknownContainer(descriptor execution.ContainerDescriptor) *workers.ManagedContainerTelemetry {
	return p.mapContainer(descriptor, runtime.InspectResult{})
}

func (p *Provider) mapContainer(
	descriptor execution.ContainerDescriptor,
	inspected runtime.InspectResult,
) *workers.ManagedContainerTelemetry {
	runtimeState := workers.ContainerRuntimeState_CONTAINER_RUNTIME_STATE_UNKNOWN
	healthState := workers.ContainerHealthState_CONTAINER_HEALTH_STATE_UNKNOWN
	if inspected.Status != "" || inspected.Running {
		runtimeState = mapRuntimeState(inspected)
		healthState = mapHealthState(inspected.Health)
	}

	executionState := workers.ContainerExecutionState_CONTAINER_EXECUTION_STATE_NONE
	if descriptor.ExecutionID != "" {
		switch descriptor.ExecutionState {
		case execution.StateRunning:
			executionState = workers.ContainerExecutionState_CONTAINER_EXECUTION_STATE_ACTIVE
		case execution.StateCancelled:
			executionState = workers.ContainerExecutionState_CONTAINER_EXECUTION_STATE_CANCELLED
		case execution.StateDone:
			executionState = workers.ContainerExecutionState_CONTAINER_EXECUTION_STATE_COMPLETED
		default:
			executionState = workers.ContainerExecutionState_CONTAINER_EXECUTION_STATE_ACTIVE
		}
	}

	item := &workers.ManagedContainerTelemetry{
		ContainerId:         descriptor.Handle.ID,
		ContainerName:       descriptor.Handle.Name,
		Image:               descriptor.Image,
		ImageVersion:        descriptor.ImageVersion,
		Tool:                descriptor.Tool,
		PoolKey:             descriptor.PoolKey,
		Pooled:              descriptor.Pooled,
		RuntimeState:        runtimeState,
		HealthState:         healthState,
		ExecutionState:      executionState,
		ConnectorConnected:  p.connector != nil && p.connector.HasContainerStream(descriptor.Handle.ID),
		OomKilled:           inspected.OOMKilled,
		InspectionSucceeded: inspected.Status != "" || inspected.Running,
		MemoryLimitBytes:    parseMemory(descriptor.Memory),
		CpuLimitMillicores:  float64(parseCPU(descriptor.CPU)),
	}
	if !descriptor.Handle.CreatedAt.IsZero() {
		item.CreatedAt = timestamppb.New(descriptor.Handle.CreatedAt)
	} else if !descriptor.CreatedAt.IsZero() {
		item.CreatedAt = timestamppb.New(descriptor.CreatedAt)
	}
	startedAt := inspected.StartedAt
	if startedAt.IsZero() {
		startedAt = descriptor.StartedAt
	}
	if !startedAt.IsZero() {
		item.StartedAt = timestamppb.New(startedAt)
	}
	if !inspected.FinishedAt.IsZero() {
		item.FinishedAt = timestamppb.New(inspected.FinishedAt)
	}
	if !descriptor.StateChangedAt.IsZero() {
		item.StateChangedAt = timestamppb.New(descriptor.StateChangedAt)
	}
	if !descriptor.LastUsedAt.IsZero() {
		item.LastUsedAt = timestamppb.New(descriptor.LastUsedAt)
	}
	if descriptor.ExecutionID != "" {
		value := descriptor.ExecutionID
		item.ExecutionId = &value
	}
	if descriptor.JobID != "" {
		value := descriptor.JobID
		item.JobId = &value
	}
	if descriptor.TraceID != "" {
		value := descriptor.TraceID
		item.TraceId = &value
	}
	if !inspected.Running && (inspected.Status != "" || inspected.ExitCode != 0) {
		exitCode := int32(inspected.ExitCode)
		item.ExitCode = &exitCode
	}
	return item
}

func timestampTime(value *timestamppb.Timestamp) time.Time {
	if value == nil {
		return time.Time{}
	}
	return value.AsTime()
}

func mapRuntimeState(inspected runtime.InspectResult) workers.ContainerRuntimeState {
	if inspected.Running {
		return workers.ContainerRuntimeState_CONTAINER_RUNTIME_STATE_RUNNING
	}
	switch inspected.Status {
	case "created", "restarting":
		return workers.ContainerRuntimeState_CONTAINER_RUNTIME_STATE_PROVISIONING
	case "removing":
		return workers.ContainerRuntimeState_CONTAINER_RUNTIME_STATE_REMOVING
	case "exited", "dead":
		return workers.ContainerRuntimeState_CONTAINER_RUNTIME_STATE_EXITED
	default:
		return workers.ContainerRuntimeState_CONTAINER_RUNTIME_STATE_UNKNOWN
	}
}

func mapHealthState(health string) workers.ContainerHealthState {
	switch health {
	case "starting":
		return workers.ContainerHealthState_CONTAINER_HEALTH_STATE_STARTING
	case "healthy":
		return workers.ContainerHealthState_CONTAINER_HEALTH_STATE_HEALTHY
	case "unhealthy":
		return workers.ContainerHealthState_CONTAINER_HEALTH_STATE_UNHEALTHY
	default:
		return workers.ContainerHealthState_CONTAINER_HEALTH_STATE_NONE
	}
}

func parseCPU(value string) int {
	parsed, err := resource.ParseCPU(value)
	if err != nil {
		return 0
	}
	return parsed
}

func parseMemory(value string) uint64 {
	parsed, err := resource.ParseMemoryToBytes(value)
	if err != nil || parsed < 0 {
		return 0
	}
	return uint64(parsed)
}
