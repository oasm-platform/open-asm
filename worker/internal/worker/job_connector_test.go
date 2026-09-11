package worker

import (
	"context"
	"testing"
	"time"

	"oasm-worker/internal/connector"
	connectorpb "oasm-worker/internal/gen/connector"
	pb "oasm-worker/internal/gen/jobs_registry"
)

// TestHandleConnectorResultAggregatesVulnerabilityChunks: N result chunks
// carrying findings must produce EXACTLY ONE SubmitVulnerabilitiesResult (at
// drain end, on a clean Done) with all N findings accumulated — never a
// per-chunk submission.
func TestHandleConnectorResultAggregatesVulnerabilityChunks(t *testing.T) {
	resetWorkerGlobals()

	client, jobsSrv, _ := newWorkerTestSetup(t)
	proxy := connector.NewProxy()
	events := make(chan TuiEvent, 64)

	execID := "exec-vuln-1"
	bridgeMu.Lock()
	bridge[execID] = &bridgeEntry{jobID: "job-vuln-1", category: "vulnerabilities", release: func() {}}
	bridgeMu.Unlock()
	resultCh := make(chan connector.ResultMsg, 8)
	proxy.Register(execID, resultCh)

	done := make(chan struct{})
	go func() {
		handleConnectorResult(context.Background(), execID, client, events, proxy, resultCh, time.Now(), time.Minute, nil, nil)
		close(done)
	}()

	// Three chunks: 2 + 1 + 1 findings = 4 accumulated.
	proxy.ForwardResult(execID, []byte(`{"template":"a"}`), []*connectorpb.Finding{
		{Name: "CVE-2024-0001", Severity: "high", Tags: []string{"cve"}, References: []string{"https://nvd.nist.gov/vuln/detail/CVE-2024-0001"}, CveId: []string{"CVE-2024-0001"}, Host: "a.example.com", Ip: "10.0.0.1", CvssScore: 9.1, EpssScore: 0.5},
		{Name: "CVE-2024-0002", Severity: "low", Host: "a.example.com", Ip: "10.0.0.1"},
	})
	proxy.ForwardResult(execID, []byte(`{"template":"b"}`), []*connectorpb.Finding{
		{Name: "CVE-2024-0003", Severity: "critical", CweId: []string{"CWE-79"}, Solution: "upgrade", Host: "b.example.com"},
	})
	// Unknown severity must NOT invent an enum — Core default (INFO) applies.
	proxy.ForwardResult(execID, []byte(`{"template":"c"}`), []*connectorpb.Finding{
		{Name: "odd-severity-finding", Severity: "extreme", Host: "c.example.com"},
	})

	proxy.MarkDone(execID)
	proxy.OnConnectorDown(execID)

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("timeout waiting for handleConnectorResult")
	}

	results := jobsSrv.getResults()
	if len(results) != 1 {
		t.Fatalf("expected exactly 1 vulnerabilities submission, got %d", len(results))
	}
	got := results[0]
	if got.jobID != "job-vuln-1" {
		t.Fatalf("jobID: got %q, want job-vuln-1", got.jobID)
	}
	if got.isError {
		t.Fatal("expected isError=false for a clean done")
	}
	if got.raw != "" {
		t.Fatalf("expected raw \"\" for the aggregated submission, got %q", got.raw)
	}
	if len(got.vulns) != 4 {
		t.Fatalf("expected 4 accumulated findings, got %d: %+v", len(got.vulns), got.vulns)
	}

	// Order preserved: chunk order then finding order.
	if got.vulns[0].GetName() != "CVE-2024-0001" ||
		got.vulns[1].GetName() != "CVE-2024-0002" ||
		got.vulns[2].GetName() != "CVE-2024-0003" ||
		got.vulns[3].GetName() != "odd-severity-finding" {
		t.Fatalf("unexpected finding order: %+v", got.vulns)
	}

	// Severity string → enum mapping (unknown → Core default INFO).
	if got.vulns[0].GetSeverity() != pb.Severity_HIGH {
		t.Fatalf("finding 0 severity: got %v, want HIGH", got.vulns[0].GetSeverity())
	}
	if got.vulns[1].GetSeverity() != pb.Severity_LOW {
		t.Fatalf("finding 1 severity: got %v, want LOW", got.vulns[1].GetSeverity())
	}
	if got.vulns[2].GetSeverity() != pb.Severity_CRITICAL {
		t.Fatalf("finding 2 severity: got %v, want CRITICAL", got.vulns[2].GetSeverity())
	}
	if got.vulns[3].GetSeverity() != pb.Severity_INFO {
		t.Fatalf("finding 3 (unknown severity) must map to Core default INFO, got %v", got.vulns[3].GetSeverity())
	}

	// Field mapping on the richest finding.
	f0 := got.vulns[0]
	if len(f0.GetTags()) != 1 || f0.GetTags()[0] != "cve" {
		t.Fatalf("tags mapping: %v", f0.GetTags())
	}
	if len(f0.GetReferences()) != 1 || f0.GetReferences()[0] != "https://nvd.nist.gov/vuln/detail/CVE-2024-0001" {
		t.Fatalf("references mapping: %v", f0.GetReferences())
	}
	if len(f0.GetCveId()) != 1 || f0.GetCveId()[0] != "CVE-2024-0001" {
		t.Fatalf("cve_id mapping: %v", f0.GetCveId())
	}
	if f0.GetCvssScore() != 9.1 || f0.GetEpssScore() != 0.5 {
		t.Fatalf("score mapping: cvss=%v epss=%v", f0.GetCvssScore(), f0.GetEpssScore())
	}
	if f0.GetHost() != "a.example.com" || f0.GetIpAddress() != "10.0.0.1" {
		t.Fatalf("host/ip mapping: host=%q ip=%q", f0.GetHost(), f0.GetIpAddress())
	}
	if got.vulns[2].GetSolution() != "upgrade" {
		t.Fatalf("solution mapping: %q", got.vulns[2].GetSolution())
	}
}

// TestHandleConnectorResultEmptyVulnerabilitiesSubmitsEmptyOnce: a clean Done
// with zero findings must still produce exactly one submission carrying raw ""
// and no vulnerabilities (the "empty" contract), not zero submissions.
func TestHandleConnectorResultEmptyVulnerabilitiesSubmitsEmptyOnce(t *testing.T) {
	resetWorkerGlobals()

	client, jobsSrv, _ := newWorkerTestSetup(t)
	proxy := connector.NewProxy()
	events := make(chan TuiEvent, 64)

	execID := "exec-vuln-empty"
	bridgeMu.Lock()
	bridge[execID] = &bridgeEntry{jobID: "job-vuln-empty", category: "vulnerabilities", release: func() {}}
	bridgeMu.Unlock()
	resultCh := make(chan connector.ResultMsg, 4)
	proxy.Register(execID, resultCh)

	done := make(chan struct{})
	go func() {
		handleConnectorResult(context.Background(), execID, client, events, proxy, resultCh, time.Now(), time.Minute, nil, nil)
		close(done)
	}()

	proxy.MarkDone(execID)
	proxy.OnConnectorDown(execID)

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("timeout waiting for handleConnectorResult")
	}

	results := jobsSrv.getResults()
	if len(results) != 1 {
		t.Fatalf("expected exactly 1 submission for an empty clean done, got %d", len(results))
	}
	if results[0].isError || results[0].raw != "" || len(results[0].vulns) != 0 {
		t.Fatalf("expected clean empty submission, got %+v", results[0])
	}
}

// TestHandleConnectorResultNonVulnCategoryKeepsPerChunkRawPath: categories
// other than vulnerabilities must keep the original per-chunk raw submission
// behavior unchanged (one submit per chunk, raw payloads, isError=false).
func TestHandleConnectorResultNonVulnCategoryKeepsPerChunkRawPath(t *testing.T) {
	resetWorkerGlobals()

	client, jobsSrv, _ := newWorkerTestSetup(t)
	proxy := connector.NewProxy()
	events := make(chan TuiEvent, 64)

	execID := "exec-sub-1"
	bridgeMu.Lock()
	bridge[execID] = &bridgeEntry{jobID: "job-sub-1", category: "subdomains", release: func() {}}
	bridgeMu.Unlock()
	resultCh := make(chan connector.ResultMsg, 4)
	proxy.Register(execID, resultCh)

	done := make(chan struct{})
	go func() {
		handleConnectorResult(context.Background(), execID, client, events, proxy, resultCh, time.Now(), time.Minute, nil, nil)
		close(done)
	}()

	proxy.ForwardResult(execID, []byte(`{"subdomains":["a.example.com"]}`), nil)
	proxy.ForwardResult(execID, []byte(`{"subdomains":["b.example.com"]}`), nil)
	proxy.MarkDone(execID)
	proxy.OnConnectorDown(execID)

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("timeout waiting for handleConnectorResult")
	}

	results := jobsSrv.getResults()
	if len(results) != 2 {
		t.Fatalf("expected 2 per-chunk submissions (raw path intact), got %d", len(results))
	}
	for _, r := range results {
		if r.isError {
			t.Fatal("expected isError=false for chunk submissions")
		}
	}
	if results[0].raw != `{"subdomains":["a.example.com"]}` || results[1].raw != `{"subdomains":["b.example.com"]}` {
		t.Fatalf("chunk raw payloads not preserved: %+v", results)
	}
}

// TestSeverityFromString: the enum mapping is case-insensitive over the
// connector's closed set; anything else falls back to Core's default (INFO) —
// the worker never invents enum values.
func TestSeverityFromString(t *testing.T) {
	cases := []struct {
		in   string
		want pb.Severity
	}{
		{"info", pb.Severity_INFO},
		{"low", pb.Severity_LOW},
		{"medium", pb.Severity_MEDIUM},
		{"high", pb.Severity_HIGH},
		{"critical", pb.Severity_CRITICAL},
		{"HIGH", pb.Severity_HIGH}, // case-insensitive
		{"", pb.Severity_INFO},     // unknown → Core default
		{"extreme", pb.Severity_INFO},
		{"0", pb.Severity_INFO},
	}
	for _, c := range cases {
		if got := severityFromString(c.in); got != c.want {
			t.Errorf("severityFromString(%q) = %v, want %v", c.in, got, c.want)
		}
	}
}
