//go:build linux

package sysresources

// detect reads the cgroup limits when the worker is containerised, falling back
// to the host totals otherwise. cgroup v2 (unified) is preferred; the v1 paths
// are the legacy Docker/container default.
func detect() (int, uint64) {
	cpus, memory := hostFallback()

	// CPU: cgroup v2 cpu.max, then cgroup v1 cpu.cfs_quota_us/cpu.cfs_period_us.
	if value, ok := firstRead("/sys/fs/cgroup/cpu.max"); ok {
		if parsed, valid := parseCPUMax(value); valid {
			cpus = parsed
		}
	} else if quota, okQuota := firstRead(
		"/sys/fs/cgroup/cpu/cpu.cfs_quota_us",
		"/sys/fs/cgroup/cpu,cpuacct/cpu.cfs_quota_us",
	); okQuota {
		if period, okPeriod := firstRead(
			"/sys/fs/cgroup/cpu/cpu.cfs_period_us",
			"/sys/fs/cgroup/cpu,cpuacct/cpu.cfs_period_us",
		); okPeriod {
			if parsed, valid := parseCFSQuota(quota, period); valid {
				cpus = parsed
			}
		}
	}

	// Memory: cgroup v2 memory.max, then cgroup v1 memory.limit_in_bytes.
	if value, ok := firstRead("/sys/fs/cgroup/memory.max"); ok {
		if parsed, valid := parseMemoryMax(value); valid {
			memory = parsed
		}
	} else if value, ok := firstRead("/sys/fs/cgroup/memory/memory.limit_in_bytes"); ok {
		if parsed, valid := parseMemoryLimitV1(value); valid {
			memory = parsed
		}
	}

	if cpus < 1 {
		cpus = 1
	}
	return cpus, memory
}
