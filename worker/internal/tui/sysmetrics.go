package tui

import "oasm-worker/internal/hostmetrics"

// SystemMetrics preserves the TUI's existing metrics surface while the sampler
// lives in a package that can also be used by worker telemetry.
type SystemMetrics = hostmetrics.Metrics

func GetSystemMetrics() SystemMetrics {
	return hostmetrics.Get()
}
