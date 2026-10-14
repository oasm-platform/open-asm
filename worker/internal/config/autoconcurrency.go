package config

import "oasm-worker/internal/sysresources"

const (
	// AutoConcurrencyMemoryPerJobBytes is the memory budget assumed for one
	// concurrent job when auto-sizing concurrency. 512 MiB matches the lightest
	// connector manifests while leaving headroom for the worker and Docker.
	AutoConcurrencyMemoryPerJobBytes = 512 << 20
	// AutoConcurrencyMax caps auto-detected concurrency so a large host cannot
	// open a job explosion. Pin a higher value explicitly with
	// --max-concurrency / WORKER_MAX_CONCURRENCY.
	AutoConcurrencyMax = 16
)

// ResolveMaxConcurrency returns the effective job concurrency. A positive
// configured value is an explicit operator override and is honoured verbatim;
// 0 or negative asks the worker to size it from the resources available to it
// (cgroup-aware when containerised).
func ResolveMaxConcurrency(configured int) int {
	if configured > 0 {
		return configured
	}
	return autoConcurrency(sysresources.Detect())
}

// autoConcurrency sizes concurrency as min(cpus, memory/perJob), clamped to
// [1, AutoConcurrencyMax]. Pure so the policy stays unit-testable.
func autoConcurrency(cpus int, memoryBytes uint64) int {
	if cpus < 1 {
		cpus = 1
	}
	byMemory := 1
	if AutoConcurrencyMemoryPerJobBytes > 0 {
		byMemory = int(memoryBytes / AutoConcurrencyMemoryPerJobBytes)
	}
	limit := cpus
	if byMemory < limit {
		limit = byMemory
	}
	if limit < 1 {
		limit = 1
	}
	if limit > AutoConcurrencyMax {
		limit = AutoConcurrencyMax
	}
	return limit
}
