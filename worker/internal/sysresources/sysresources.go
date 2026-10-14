// Package sysresources reports the CPU and memory actually available to this
// worker process. When the worker runs inside a container it honours the cgroup
// limits, so auto-sizing concurrency never over-estimates the slice it was given.
package sysresources

import (
	"os"
	"runtime"
	"strconv"
	"strings"

	"oasm-worker/internal/hostmetrics"
)

// Detect returns the CPU count and memory (bytes) available to this process.
// The CPU count is always >= 1. Memory is 0 only when no source could be read.
func Detect() (int, uint64) { return detect() }

// hostFallback is the limit-free baseline: the process-visible CPU count and
// host memory. It is correct on bare metal and the safe starting point inside a
// container, where the OS-specific detect() may tighten it with cgroup limits.
func hostFallback() (int, uint64) {
	cpus := runtime.NumCPU()
	if cpus < 1 {
		cpus = 1
	}
	return cpus, hostmetrics.Get().MemoryTotal
}

// readFileTrimmed reads a small sysfs/procfs file and trims surrounding space.
func readFileTrimmed(path string) (string, bool) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", false
	}
	return strings.TrimSpace(string(data)), true
}

// firstRead returns the first readable path's trimmed content.
func firstRead(paths ...string) (string, bool) {
	for _, path := range paths {
		if value, ok := readFileTrimmed(path); ok {
			return value, true
		}
	}
	return "", false
}

// parseCPUMax parses a cgroup v2 cpu.max value ("<quota> <period>" or
// "max <period>") into a whole number of CPUs, rounding up. ok is false when the
// value is absent, malformed, or unlimited.
func parseCPUMax(content string) (int, bool) {
	fields := strings.Fields(strings.TrimSpace(content))
	if len(fields) < 2 || fields[0] == "max" {
		return 0, false
	}
	quota, errQuota := strconv.ParseInt(fields[0], 10, 64)
	period, errPeriod := strconv.ParseInt(fields[1], 10, 64)
	if errQuota != nil || errPeriod != nil || quota <= 0 || period <= 0 {
		return 0, false
	}
	return int((quota + period - 1) / period), true
}

// parseMemoryMax parses a cgroup v2 memory.max value (bytes or "max").
func parseMemoryMax(content string) (uint64, bool) {
	value := strings.TrimSpace(content)
	if value == "" || value == "max" {
		return 0, false
	}
	bytes, err := strconv.ParseUint(value, 10, 64)
	if err != nil || bytes == 0 {
		return 0, false
	}
	return bytes, true
}

// parseCFSQuota parses cgroup v1 cpu.cfs_quota_us / cpu.cfs_period_us into a
// whole number of CPUs, rounding up. quota <= 0 means "no limit".
func parseCFSQuota(quota, period string) (int, bool) {
	q, errQuota := strconv.ParseInt(strings.TrimSpace(quota), 10, 64)
	p, errPeriod := strconv.ParseInt(strings.TrimSpace(period), 10, 64)
	if errQuota != nil || errPeriod != nil || q <= 0 || p <= 0 {
		return 0, false
	}
	return int((q + p - 1) / p), true
}

// parseMemoryLimitV1 parses cgroup v1 memory.limit_in_bytes. Values at or above
// the "unlimited" sentinel (>= 1<<62) are treated as no limit.
func parseMemoryLimitV1(content string) (uint64, bool) {
	value := strings.TrimSpace(content)
	if value == "" {
		return 0, false
	}
	bytes, err := strconv.ParseUint(value, 10, 64)
	if err != nil || bytes == 0 || bytes >= 1<<62 {
		return 0, false
	}
	return bytes, true
}
