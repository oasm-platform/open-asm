package execution

import (
	"context"
	"time"

	"oasm-worker/internal/runtime"
)

// ContainerDescriptor is an immutable view of one OASM-managed container.
// Docker inspection deliberately happens after this snapshot is copied so no
// manager or pool lock is held across network I/O.
type ContainerDescriptor struct {
	Handle         runtime.Handle
	Image          string
	ImageVersion   string
	Tool           string
	PoolKey        string
	Pooled         bool
	PoolState      PoolState
	ExecutionID    string
	ExecutionState State
	JobID          string
	TraceID        string
	CPU            string
	Memory         string
	CreatedAt      time.Time
	StartedAt      time.Time
	StateChangedAt time.Time
	LastUsedAt     time.Time
}

func (m *Manager) ContainerSnapshots() []ContainerDescriptor {
	m.mu.Lock()
	descriptors := make([]ContainerDescriptor, 0, len(m.execs))
	seen := make(map[string]struct{}, len(m.execs))
	for _, execution := range m.execs {
		if execution == nil || execution.Handle.ID == "" {
			continue
		}
		cpu, memory := limitsCPUandMemory(execution.Spec.Limits)
		descriptors = append(descriptors, ContainerDescriptor{
			Handle:         execution.Handle,
			Image:          execution.Spec.Image,
			ImageVersion:   execution.Spec.Version,
			Tool:           execution.Spec.Tool,
			PoolKey:        normalizePoolKey(execution.Spec.Image),
			Pooled:         m.pool != nil,
			PoolState:      PoolStateBusy,
			ExecutionID:    execution.ID,
			ExecutionState: execution.State,
			JobID:          execution.Spec.JobID,
			TraceID:        execution.Spec.TraceID,
			CPU:            cpu,
			Memory:         memory,
			CreatedAt:      execution.CreatedAt,
			StartedAt:      execution.StartedAt,
			StateChangedAt: execution.StateChangedAt,
			LastUsedAt:     execution.StateChangedAt,
		})
		seen[execution.Handle.ID] = struct{}{}
	}
	m.mu.Unlock()

	if m.pool == nil {
		return descriptors
	}

	pool := m.pool
	pool.mu.Lock()
	for _, entry := range pool.byID {
		if entry == nil {
			continue
		}
		if _, exists := seen[entry.ID]; exists {
			continue
		}
		descriptors = append(descriptors, ContainerDescriptor{
			Handle: runtime.Handle{
				ID:        entry.ID,
				Name:      entry.Name,
				CreatedAt: entry.CreatedAt,
			},
			Image:          entry.Image,
			ImageVersion:   entry.ImageVersion,
			Tool:           entry.Tool,
			PoolKey:        entry.PoolKey,
			Pooled:         true,
			PoolState:      entry.State,
			ExecutionID:    entry.ExecID,
			ExecutionState: StateDone,
			JobID:          entry.LastJobID,
			TraceID:        entry.LastTraceID,
			CPU:            entry.CPU,
			Memory:         entry.Memory,
			CreatedAt:      entry.CreatedAt,
			StateChangedAt: entry.StateChangedAt,
			LastUsedAt:     entry.LastUsedAt,
		})
	}
	pool.mu.Unlock()
	return descriptors
}

func (m *Manager) InspectContainer(ctx context.Context, handle runtime.Handle) (runtime.InspectResult, error) {
	return m.rt.Inspect(ctx, handle)
}

func (m *Manager) MaxConcurrency() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.maxConcurrency
}
