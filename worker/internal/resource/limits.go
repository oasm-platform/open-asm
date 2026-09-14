package resource

import (
	"fmt"
	"strconv"
	"strings"

	"oasm-worker/internal/runtime"
)

// Limits enforces CPU/mem/time via runtime opts.
type Limits struct {
	CPU            string
	Memory         string
	TimeoutSeconds int
}

// ParseMemoryToBytes converts memory strings like "512Mi", "1Gi", "256Mi" to bytes.
// Supports Mi, Gi, M, G, Ki, K suffixes; bare number is bytes.
// ponytail: YAGNI only Mi/Gi required; M/G/K/Ki added for completeness. No fractional values.
func ParseMemoryToBytes(s string) (int, error) {
	if s == "" {
		return 0, fmt.Errorf("invalid memory: empty")
	}
	var mult int64 = 1
	var numStr string
	switch {
	case strings.HasSuffix(s, "Mi"):
		mult = 1024 * 1024
		numStr = strings.TrimSuffix(s, "Mi")
	case strings.HasSuffix(s, "Gi"):
		mult = 1024 * 1024 * 1024
		numStr = strings.TrimSuffix(s, "Gi")
	case strings.HasSuffix(s, "Ki"):
		mult = 1024
		numStr = strings.TrimSuffix(s, "Ki")
	case strings.HasSuffix(s, "M"):
		mult = 1000 * 1000
		numStr = strings.TrimSuffix(s, "M")
	case strings.HasSuffix(s, "G"):
		mult = 1000 * 1000 * 1000
		numStr = strings.TrimSuffix(s, "G")
	case strings.HasSuffix(s, "K"):
		mult = 1000
		numStr = strings.TrimSuffix(s, "K")
	default:
		// no suffix: must be plain integer bytes
		n, err := strconv.Atoi(s)
		if err != nil {
			return 0, fmt.Errorf("invalid memory: %s", s)
		}
		if n < 0 {
			return 0, fmt.Errorf("invalid memory: %s", s)
		}
		return n, nil
	}
	if numStr == "" {
		return 0, fmt.Errorf("invalid memory: %s", s)
	}
	n, err := strconv.Atoi(numStr)
	if err != nil {
		return 0, fmt.Errorf("invalid memory: %s", s)
	}
	if n < 0 {
		return 0, fmt.Errorf("invalid memory: %s", s)
	}
	return int(int64(n) * mult), nil
}

// ParseCPU converts CPU strings like "500m" (millicores) to int millicores.
// Supports "500m" -> 500, "1" -> 1000, "0.5" -> 500.
// ponytail: YAGNI only "500m" required; plain cores handled via float*1000.
func ParseCPU(s string) (int, error) {
	if s == "" {
		return 0, fmt.Errorf("invalid cpu: empty")
	}
	if strings.HasSuffix(s, "m") {
		numStr := strings.TrimSuffix(s, "m")
		if numStr == "" {
			return 0, fmt.Errorf("invalid cpu: %s", s)
		}
		n, err := strconv.Atoi(numStr)
		if err != nil {
			return 0, fmt.Errorf("invalid cpu: %s", s)
		}
		if n < 0 {
			return 0, fmt.Errorf("invalid cpu: %s", s)
		}
		return n, nil
	}
	// plain cores: may be float
	f, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid cpu: %s", s)
	}
	if f < 0 {
		return 0, fmt.Errorf("invalid cpu: %s", s)
	}
	return int(f * 1000), nil
}

// ValidateLimits checks CPU, Memory, TimeoutSeconds.
// TimeoutSeconds == 0 means no job-level timeout (unlimited); only < 0 is rejected.
func ValidateLimits(l Limits) error {
	if l.TimeoutSeconds < 0 {
		return fmt.Errorf("invalid timeout: %d must be >= 0", l.TimeoutSeconds)
	}
	if l.CPU != "" {
		if _, err := ParseCPU(l.CPU); err != nil {
			return err
		}
	}
	if l.Memory != "" {
		if _, err := ParseMemoryToBytes(l.Memory); err != nil {
			return err
		}
	} else {
		return fmt.Errorf("invalid memory: empty")
	}
	return nil
}

// ToRuntimeOpts converts Limits to runtime.RuntimeOpts preserving TraceID.
func ToRuntimeOpts(l Limits, traceID string) (runtime.RuntimeOpts, error) {
	if err := ValidateLimits(l); err != nil {
		return runtime.RuntimeOpts{}, err
	}
	cpu, err := ParseCPU(l.CPU)
	if err != nil {
		return runtime.RuntimeOpts{}, err
	}
	mem, err := ParseMemoryToBytes(l.Memory)
	if err != nil {
		return runtime.RuntimeOpts{}, err
	}
	return runtime.RuntimeOpts{
		CPU:            cpu,
		Memory:         mem,
		TimeoutSeconds: l.TimeoutSeconds,
		TraceID:        traceID,
	}, nil
}
