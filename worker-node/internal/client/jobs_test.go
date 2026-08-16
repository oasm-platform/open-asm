package client

import "testing"

func TestResultMethod(t *testing.T) {
	tests := []struct {
		name       string
		category   string
		wantMethod string
		wantKnown  bool
	}{
		{name: "subdomains", category: "subdomains", wantMethod: "ResultSubdomains", wantKnown: true},
		{name: "http_probe", category: "http_probe", wantMethod: "ResultHttpProbe", wantKnown: true},
		{name: "ports_scanner", category: "ports_scanner", wantMethod: "ResultPorts", wantKnown: true},
		{name: "vulnerabilities", category: "vulnerabilities", wantMethod: "ResultVulnerabilities", wantKnown: true},
		{name: "screenshot", category: "screenshot", wantMethod: "ResultScreenshot", wantKnown: true},
		{name: "unknown category falls back to generic Result", category: "foo", wantMethod: "Result", wantKnown: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotMethod, gotKnown := resultMethod(tt.category)
			if gotMethod != tt.wantMethod {
				t.Errorf("resultMethod(%q) method = %q, want %q", tt.category, gotMethod, tt.wantMethod)
			}
			if gotKnown != tt.wantKnown {
				t.Errorf("resultMethod(%q) known = %v, want %v", tt.category, gotKnown, tt.wantKnown)
			}
		})
	}
}
