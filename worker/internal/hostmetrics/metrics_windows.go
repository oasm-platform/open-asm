//go:build windows

package hostmetrics

import (
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	windowsKernel32      = windows.NewLazySystemDLL("kernel32.dll")
	globalMemoryStatusEx = windowsKernel32.NewProc("GlobalMemoryStatusEx")
	getSystemTimes       = windowsKernel32.NewProc("GetSystemTimes")
)

type windowsMemoryStatusEx struct {
	dwLength                uint32
	dwMemoryLoad            uint32
	ullTotalPhys            uint64
	ullAvailPhys            uint64
	ullTotalPageFile        uint64
	ullAvailPageFile        uint64
	ullTotalVirtual         uint64
	ullAvailVirtual         uint64
	ullAvailExtendedVirtual uint64
}

func filetimeTicks(value windows.Filetime) uint64 {
	return uint64(value.HighDateTime)<<32 | uint64(value.LowDateTime)
}

func readMemory(metrics *Metrics) {
	status := windowsMemoryStatusEx{
		dwLength: uint32(unsafe.Sizeof(windowsMemoryStatusEx{})),
	}
	result, _, _ := globalMemoryStatusEx.Call(uintptr(unsafe.Pointer(&status)))
	if result == 0 || status.ullTotalPhys == 0 {
		return
	}

	available := status.ullAvailPhys
	if available > status.ullTotalPhys {
		available = status.ullTotalPhys
	}
	metrics.MemoryTotal = status.ullTotalPhys
	metrics.MemoryUsed = status.ullTotalPhys - available
	metrics.MemoryPct = float64(metrics.MemoryUsed) / float64(metrics.MemoryTotal) * 100
}

func readCPU(metrics *Metrics) {
	var idle, kernel, user windows.Filetime
	result, _, _ := getSystemTimes.Call(
		uintptr(unsafe.Pointer(&idle)),
		uintptr(unsafe.Pointer(&kernel)),
		uintptr(unsafe.Pointer(&user)),
	)
	if result == 0 {
		return
	}

	// GetSystemTimes reports kernel time including idle time. Reuse the
	// platform-neutral delta calculation used by the Linux /proc sampler.
	current := cpuJiffies{
		idle:   filetimeTicks(idle),
		system: filetimeTicks(kernel),
		user:   filetimeTicks(user),
	}
	cpuMu.Lock()
	defer cpuMu.Unlock()
	if prevCPUSet {
		totalDelta := current.total() - prevCPU.total()
		idleDelta := current.idle - prevCPU.idle
		if totalDelta > 0 {
			busyDelta := totalDelta - idleDelta
			if busyDelta < 0 {
				busyDelta = 0
			}
			metrics.CPUUsage = float64(busyDelta) / float64(totalDelta) * 100
		}
	}
	prevCPU = current
	prevCPUSet = true
}
