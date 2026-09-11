package execution

import (
	"strings"
	"testing"
	"time"
)

// The timeout contract lives in one place (timeouts.go) so every consumer —
// worker connect deadline (ConnectorConnectTimeout), post-execution cleanup
// (ConnectorCleanupTimeout), per-job manifest timeout (JobTimeoutSecondsKey) —
// derives from the same named constant pair. The SDK send timeout is a
// cross-repo contract with oasm-connectors; if it ever diverges, both sides
// must change together.
func TestTimeoutConstantsDocumentedValues(t *testing.T) {
	if ConnectorConnectTimeout != 5*time.Minute {
		t.Fatalf("ConnectorConnectTimeout = %v, want 5m", ConnectorConnectTimeout)
	}
	if ConnectorCleanupTimeout != 30*time.Second {
		t.Fatalf("ConnectorCleanupTimeout = %v, want 30s", ConnectorCleanupTimeout)
	}
	if ConnectorSDKSendTimeout != 30*time.Second {
		t.Fatalf("ConnectorSDKSendTimeout = %v, want 30s (matches oasm-connectors/sdk)", ConnectorSDKSendTimeout)
	}
	if JobTimeoutSecondsKey != "timeoutSeconds" {
		t.Fatalf("JobTimeoutSecondsKey = %q, want timeoutSeconds (manifest/Job spec)", JobTimeoutSecondsKey)
	}
}

// Invariant guard: the connect deadline must never equal/exceed the per-job
// timeout — otherwise the connect timer wins and the connector job dies before
// the configured job timeout can apply.
func TestValidateConnectorTimeouts(t *testing.T) {
	tests := []struct {
		name       string
		jobSeconds int
		connect    time.Duration
		wantErr    string
	}{
		{"connect exceeds job timeout", 60, 5 * time.Minute, "must be < per-job timeout"},
		{"connect equals job timeout", 300, 5 * time.Minute, "must be < per-job timeout"},
		{"job timeout above connect", 600, 5 * time.Minute, ""},
		{"no job timeout configured", 0, 5 * time.Minute, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateConnectorTimeouts(tt.jobSeconds, tt.connect)
			if tt.wantErr == "" {
				if err != nil {
					t.Fatalf("ValidateConnectorTimeouts(%d, %v) = %v, want nil", tt.jobSeconds, tt.connect, err)
				}
				return
			}
			if err == nil {
				t.Fatalf("ValidateConnectorTimeouts(%d, %v) = nil, want error containing %q", tt.jobSeconds, tt.connect, tt.wantErr)
			}
			if !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("error %q does not contain %q", err.Error(), tt.wantErr)
			}
			if !strings.Contains(err.Error(), "raise timeoutSeconds") {
				t.Fatalf("error %q must point at the remediation knob", err.Error())
			}
		})
	}
}
