package tui

import (
	"bufio"
	"os"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

type SystemMetrics struct {
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

func GetSystemMetrics() SystemMetrics {
	metrics := SystemMetrics{
		Timestamp:  time.Now(),
		GoRoutines: runtime.NumGoroutine(),
	}

	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	metrics.HeapAlloc = m.HeapAlloc
	metrics.HeapSys = m.HeapSys

	readCPUMetrics(&metrics)
	readMemoryMetrics(&metrics)

	return metrics
}

func readCPUMetrics(m *SystemMetrics) {
	f, err := os.Open("/proc/stat")
	if err != nil {
		return
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	if !scanner.Scan() {
		return
	}

	fields := strings.Fields(scanner.Text())
	if len(fields) < 9 || fields[0] != "cpu" {
		return
	}

	var cur cpuJiffies
	vals := [8]*uint64{&cur.user, &cur.nice, &cur.system, &cur.idle, &cur.iowait, &cur.irq, &cur.softirq, &cur.steal}
	for i := 0; i < 8; i++ {
		*vals[i], _ = strconv.ParseUint(fields[i+1], 10, 64)
	}

	cpuMu.Lock()
	defer cpuMu.Unlock()

	if prevCPUSet {
		dTotal := cur.total() - prevCPU.total()
		dIdle := cur.idle - prevCPU.idle
		if dTotal > 0 {
			m.CPUUsage = float64(dTotal-dIdle) / float64(dTotal) * 100
		}
	}
	prevCPU = cur
	prevCPUSet = true
}

func readMemoryMetrics(m *SystemMetrics) {
	f, err := os.Open("/proc/meminfo")
	if err != nil {
		return
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}

		key := strings.TrimSpace(parts[0])
		valStr := strings.TrimSpace(parts[1])
		valStr = strings.TrimSuffix(valStr, " kB")
		val, _ := strconv.ParseUint(valStr, 10, 64)

		switch key {
		case "MemTotal":
			m.MemoryTotal = val * 1024
		case "MemAvailable":
			if m.MemoryTotal > 0 {
				m.MemoryUsed = m.MemoryTotal - val*1024
				m.MemoryPct = float64(m.MemoryUsed) / float64(m.MemoryTotal) * 100
			}
		}
	}
}
