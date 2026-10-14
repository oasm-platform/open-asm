package hostmetrics

import (
	"runtime"
	"sync"
	"time"
)

type Metrics struct {
	CPUUsage    float64
	MemoryUsed  uint64
	MemoryTotal uint64
	MemoryPct   float64
	GoRoutines  int
	HeapAlloc   uint64
	HeapSys     uint64
	Timestamp   time.Time
}

type cpuJiffies struct {
	user, nice, system, idle, iowait, irq, softirq, steal uint64
}

func (j cpuJiffies) total() uint64 {
	return j.user + j.nice + j.system + j.idle + j.iowait + j.irq + j.softirq + j.steal
}

var (
	prevCPU    cpuJiffies
	prevCPUSet bool
	cpuMu      sync.Mutex
)

func Get() Metrics {
	metrics := Metrics{
		Timestamp:  time.Now(),
		GoRoutines: runtime.NumGoroutine(),
	}

	var memory runtime.MemStats
	runtime.ReadMemStats(&memory)
	metrics.HeapAlloc = memory.HeapAlloc
	metrics.HeapSys = memory.HeapSys

	readCPU(&metrics)
	readMemory(&metrics)
	return metrics
}
