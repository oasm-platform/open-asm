//go:build !windows

package hostmetrics

import (
	"bufio"
	"os"
	"strconv"
	"strings"
)

func readCPU(metrics *Metrics) {
	file, err := os.Open("/proc/stat")
	if err != nil {
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	if !scanner.Scan() {
		return
	}
	fields := strings.Fields(scanner.Text())
	if len(fields) < 9 || fields[0] != "cpu" {
		return
	}

	current := cpuJiffies{}
	values := []*uint64{&current.user, &current.nice, &current.system, &current.idle, &current.iowait, &current.irq, &current.softirq, &current.steal}
	for i := 0; i < len(values); i++ {
		*values[i], _ = strconv.ParseUint(fields[i+1], 10, 64)
	}

	cpuMu.Lock()
	defer cpuMu.Unlock()
	if prevCPUSet {
		totalDelta := current.total() - prevCPU.total()
		idleDelta := current.idle - prevCPU.idle
		if totalDelta > 0 {
			metrics.CPUUsage = float64(totalDelta-idleDelta) / float64(totalDelta) * 100
		}
	}
	prevCPU = current
	prevCPUSet = true
}

func readMemory(metrics *Metrics) {
	file, err := os.Open("/proc/meminfo")
	if err != nil {
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		parts := strings.SplitN(scanner.Text(), ":", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		valueText := strings.TrimSuffix(strings.TrimSpace(parts[1]), " kB")
		value, _ := strconv.ParseUint(valueText, 10, 64)
		switch key {
		case "MemTotal":
			metrics.MemoryTotal = value * 1024
		case "MemAvailable":
			if metrics.MemoryTotal > 0 {
				metrics.MemoryUsed = metrics.MemoryTotal - value*1024
				metrics.MemoryPct = float64(metrics.MemoryUsed) / float64(metrics.MemoryTotal) * 100
			}
		}
	}
}
