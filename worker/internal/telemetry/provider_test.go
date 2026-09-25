package telemetry

import (
	"context"
	"fmt"
	"testing"
	"time"

	"oasm-worker/internal/execution"
	workers "oasm-worker/internal/gen/workers"
	"oasm-worker/internal/runtime"
)

type fakeManager struct {
	descriptors []execution.ContainerDescriptor
	inspects    map[string]runtime.InspectResult
}

func (f *fakeManager) ContainerSnapshots() []execution.ContainerDescriptor { return f.descriptors }
func (f *fakeManager) InspectContainer(_ context.Context, handle runtime.Handle) (runtime.InspectResult, error) {
	result, ok := f.inspects[handle.ID]
	if !ok {
		return runtime.InspectResult{}, fmt.Errorf("not found")
	}
	return result, nil
}
func (f *fakeManager) MaxConcurrency() int { return 10 }

type fakeConnector struct{ connected map[string]bool }

func (f fakeConnector) HasContainerStream(containerID string) bool {
	return f.connected[containerID]
}

func TestSnapshotMapsNodeAndManagedContainerState(t *testing.T) {
	now := time.Now().UTC()
	manager := &fakeManager{
		descriptors: []execution.ContainerDescriptor{
			{
				Handle:         runtime.Handle{ID: "active", Name: "oasm-nmap", CreatedAt: now},
				Image:          "example/nmap:latest",
				ImageVersion:   "1.0.0",
				Tool:           "nmap",
				PoolKey:        "example/nmap:latest",
				Pooled:         true,
				ExecutionID:    "exec-1",
				ExecutionState: execution.StateRunning,
				JobID:          "job-1",
				TraceID:        "trace-1",
				CPU:            "1",
				Memory:         "1Gi",
				StateChangedAt: now,
				LastUsedAt:     now,
			},
			{
				Handle:     runtime.Handle{ID: "idle", Name: "oasm-naabu", CreatedAt: now},
				Image:      "example/naabu:latest",
				Tool:       "naabu",
				Pooled:     true,
				PoolState:  execution.PoolStateIdle,
				CPU:        "500m",
				Memory:     "512Mi",
				LastUsedAt: now,
			},
		},
		inspects: map[string]runtime.InspectResult{
			"active": {Running: true, Status: "running", Health: "healthy"},
			"idle":   {Running: true, Status: "running"},
		},
	}
	provider, err := NewProvider(
		manager,
		fakeConnector{connected: map[string]bool{"active": true}},
		func() int { return 1 },
		10,
		"node",
		"1.2.3",
	)
	if err != nil {
		t.Fatal(err)
	}

	request, err := provider.Snapshot(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if request.GetSchemaVersion() != 1 || request.GetState() != workers.WorkerRuntimeState_WORKER_RUNTIME_STATE_READY {
		t.Fatalf("unexpected worker envelope: %#v", request)
	}
	if request.GetContainers().GetTotal() != 2 || request.GetContainers().GetActive() != 1 || request.GetContainers().GetIdle() != 1 {
		t.Fatalf("unexpected aggregate: %#v", request.GetContainers())
	}
	active := request.GetContainers().GetItems()[0]
	if active.GetContainerId() != "active" || active.GetExecutionState() != workers.ContainerExecutionState_CONTAINER_EXECUTION_STATE_ACTIVE {
		t.Fatalf("unexpected active container: %#v", active)
	}
	if !active.GetConnectorConnected() || active.GetHealthState() != workers.ContainerHealthState_CONTAINER_HEALTH_STATE_HEALTHY {
		t.Fatalf("active connectivity/health incorrect: %#v", active)
	}
	if active.GetCpuLimitMillicores() != 1000 || active.GetMemoryLimitBytes() != 1024*1024*1024 {
		t.Fatalf("resource limits incorrect: %#v", active)
	}
}

func TestSnapshotMarksInspectFailureUnknown(t *testing.T) {
	manager := &fakeManager{
		descriptors: []execution.ContainerDescriptor{{Handle: runtime.Handle{ID: "missing"}}},
	}
	provider, err := NewProvider(manager, nil, nil, 0, "cli", "")
	if err != nil {
		t.Fatal(err)
	}

	request, err := provider.Snapshot(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	item := request.GetContainers().GetItems()[0]
	if item.GetRuntimeState() != workers.ContainerRuntimeState_CONTAINER_RUNTIME_STATE_UNKNOWN || item.GetInspectionSucceeded() {
		t.Fatalf("expected unknown inspection result: %#v", item)
	}
	if request.GetContainers().GetSupported() != true {
		t.Fatal("expected node manager to mark containers supported")
	}
}

func TestSnapshotBoundsContainerItemsAndReportsTotal(t *testing.T) {
	descriptors := make([]execution.ContainerDescriptor, maxReportedContainers+1)
	inspects := make(map[string]runtime.InspectResult, len(descriptors))
	for index := range descriptors {
		id := fmt.Sprintf("container-%d", index)
		descriptors[index] = execution.ContainerDescriptor{Handle: runtime.Handle{ID: id}}
		inspects[id] = runtime.InspectResult{Running: true, Status: "running"}
	}
	provider, err := NewProvider(&fakeManager{descriptors: descriptors, inspects: inspects}, nil, nil, 1, "node", "dev")
	if err != nil {
		t.Fatal(err)
	}

	request, err := provider.Snapshot(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if got := len(request.GetContainers().GetItems()); got != maxReportedContainers {
		t.Fatalf("expected %d items, got %d", maxReportedContainers, got)
	}
	if request.GetContainers().GetTotal() != uint32(len(descriptors)) || !request.GetContainers().GetTruncated() {
		t.Fatalf("expected truthful total and truncation: %#v", request.GetContainers())
	}
}
