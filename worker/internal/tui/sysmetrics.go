package tui

import (
	"bufio"
	"os"
	"runtime"
	"strconv"
	"strings"
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

type cpuSample struct {
	user, nice, system, idle, iowait, irq, softirq, steal uint64
}

func GetSystemMetrics() SystemMetrics {
	metrics := SystemMetrics{
		Timestamp:  time.Now(),
		GoRoutines: runtime.NumGoroutine(),
	}

	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	metrics.HeapAlloc = m.HeapAlloc
	metrics.HeapSys = m.HeapSys
	metrics.MemoryUsed = m.Sys
	metrics.MemoryTotal = 0

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

	var vals [8]uint64
	for i := 0; i < 8; i++ {
		vals[i], _ = strconv.ParseUint(fields[i+1], 10, 64)
	}

	// Use a simple instantaneous reading - not accurate but shows activity
	total := vals[0] + vals[1] + vals[2] + vals[3] + vals[4] + vals[5] + vals[6] + vals[7]
	idle := vals[3]
	m.CPUUsage = float64(total-idle) / float64(total) * 100
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
