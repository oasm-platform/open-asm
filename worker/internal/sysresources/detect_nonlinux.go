//go:build !linux

package sysresources

// detect has no cgroup source off Linux (Windows/macOS hosts are not
// container-scheduled the same way); the host totals are already correct.
func detect() (int, uint64) {
	return hostFallback()
}
