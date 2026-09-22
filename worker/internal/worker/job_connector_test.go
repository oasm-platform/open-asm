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
		{Name: "CVE-2024-0001", Severity: "high", Tags: []string{"cve"}, References: []string{"https://nvd.nist.gov/vuln/detail/CVE-2024-0001"}, CveId: []string{"CVE-2024-0001"}, Host: "a.example.com", Ip: "10.0.0.1", CvssScore: 9.1, EpssScore: 0.5, Description: "long detail", Synopsis: "short summary", MatchedAt: "https://a.example.com/x", Ports: []string{"443"}, Authors: []string{"alice"}, VprScore: 7.2, BidId: []string{"12345"}, CeaId: []string{"CAE-1"}, Iava: []string{"2024-A-0001"}},
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
	if f0.GetDescription() != "long detail" || f0.GetSynopsis() != "short summary" {
		t.Fatalf("description/synopsis mapping: %q/%q", f0.GetDescription(), f0.GetSynopsis())
	}
	if f0.GetAffectedUrl() != "https://a.example.com/x" {
		t.Fatalf("affected_url must come from matched_at: %q", f0.GetAffectedUrl())
	}
	if f0.GetVprScore() != 7.2 || len(f0.GetPorts()) != 1 || f0.GetPorts()[0] != "443" ||
		len(f0.GetAuthors()) != 1 || f0.GetAuthors()[0] != "alice" ||
		len(f0.GetBidId()) != 1 || f0.GetBidId()[0] != "12345" ||
		len(f0.GetCeaId()) != 1 || f0.GetCeaId()[0] != "CAE-1" ||
		len(f0.GetIava()) != 1 || f0.GetIava()[0] != "2024-A-0001" {
		t.Fatalf("enrichment mapping: vpr=%v ports=%v authors=%v bid=%v cea=%v iava=%v",
			f0.GetVprScore(), f0.GetPorts(), f0.GetAuthors(), f0.GetBidId(), f0.GetCeaId(), f0.GetIava())
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
// TestHandleConnectorResultAggregatesUrlDiscoveryChunks: a url_discovery
// category job with N result chunks carrying URL findings must produce EXACTLY
// ONE SubmitUrlDiscoveryResult (at drain end, on a clean Done) with all N URLs
// accumulated — never a per-chunk submission — mirroring the vulnerabilities
// aggregation path with raw "".
func TestHandleConnectorResultAggregatesUrlDiscoveryChunks(t *testing.T) {
	resetWorkerGlobals()

	client, jobsSrv, _ := newWorkerTestSetup(t)
	proxy := connector.NewProxy()
	events := make(chan TuiEvent, 64)

	execID := "exec-url-1"
	bridgeMu.Lock()
	bridge[execID] = &bridgeEntry{jobID: "job-url-1", category: "url_discovery", release: func() {}}
	bridgeMu.Unlock()
	resultCh := make(chan connector.ResultMsg, 8)
	proxy.Register(execID, resultCh)

	done := make(chan struct{})
	go func() {
		handleConnectorResult(context.Background(), execID, client, events, proxy, resultCh, time.Now(), time.Minute, nil, nil)
		close(done)
	}()

	// Three chunks: 2 + 1 + 1 URL findings = 4 accumulated.
	proxy.ForwardResult(execID, []byte(`{"url":"a"}`), []*connectorpb.Finding{
		{Name: "https://example.com/a", Severity: "info", MatchedAt: "https://example.com/a", Host: "example.com"},
		{Name: "https://example.com/b", Severity: "info", MatchedAt: "https://example.com/b", Host: "example.com"},
	})
	proxy.ForwardResult(execID, []byte(`{"url":"c"}`), []*connectorpb.Finding{
		{Name: "https://example.com/c", Severity: "info", MatchedAt: "https://example.com/c", Host: "example.com"},
	})
	proxy.ForwardResult(execID, []byte(`{"url":"d"}`), []*connectorpb.Finding{
		{Name: "https://example.com/d", Severity: "info", MatchedAt: "https://example.com/d", Host: "example.com"},
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
		t.Fatalf("expected exactly 1 url_discovery submission, got %d", len(results))
	}
	got := results[0]
	if got.jobID != "job-url-1" {
		t.Fatalf("jobID: got %q, want job-url-1", got.jobID)
	}
	if got.isError {
		t.Fatal("expected isError=false for a clean done")
	}
	if got.raw != "" {
		t.Fatalf("expected raw \"\" for the aggregated submission, got %q", got.raw)
	}
	if len(got.urls) != 4 {
		t.Fatalf("expected 4 accumulated urls, got %d: %+v", len(got.urls), got.urls)
	}

	// Order preserved: chunk order then finding order.
	want := []string{"https://example.com/a", "https://example.com/b", "https://example.com/c", "https://example.com/d"}
	for i, w := range want {
		if got.urls[i].GetUrl() != w {
			t.Fatalf("url[%d]: got %q, want %q (all: %+v)", i, got.urls[i].GetUrl(), w, got.urls)
		}
	}
}

// TestHandleConnectorResultEmptyUrlDiscoverySubmitsEmptyOnce: a clean Done with
// zero chunks must still produce exactly one url_discovery submission carrying
// raw "" and an empty URL list (the "empty" contract), not zero submissions.
func TestHandleConnectorResultEmptyUrlDiscoverySubmitsEmptyOnce(t *testing.T) {
	resetWorkerGlobals()

	client, jobsSrv, _ := newWorkerTestSetup(t)
	proxy := connector.NewProxy()
	events := make(chan TuiEvent, 64)

	execID := "exec-url-empty"
	bridgeMu.Lock()
	bridge[execID] = &bridgeEntry{jobID: "job-url-empty", category: "url_discovery", release: func() {}}
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
	if results[0].isError || results[0].raw != "" || len(results[0].urls) != 0 {
		t.Fatalf("expected clean empty submission, got %+v", results[0])
	}
}

// TestHandleConnectorResultErrorWithFindingsDeliversPartialSuccess: the
// platform stopping a scan AFTER findings arrived (worker timeout cancel,
// container kill, stream death with a Done error) must submit those findings
// as a SUCCESS. An error result carries no payload to Core, so the old
// behavior silently discarded every streamed finding and failed the job —
// a long scan the platform ended is not a tool failure.
func TestHandleConnectorResultErrorWithFindingsDeliversPartialSuccess(t *testing.T) {
	resetWorkerGlobals()

	client, jobsSrv, _ := newWorkerTestSetup(t)
	proxy := connector.NewProxy()
	events := make(chan TuiEvent, 64)

	execID := "exec-partial-1"
	bridgeMu.Lock()
	bridge[execID] = &bridgeEntry{jobID: "job-partial-1", category: "vulnerabilities", release: func() {}}
	bridgeMu.Unlock()
	resultCh := make(chan connector.ResultMsg, 4)
	proxy.Register(execID, resultCh)

	done := make(chan struct{})
	go func() {
		handleConnectorResult(context.Background(), execID, client, events, proxy, resultCh, time.Now(), time.Minute, nil, nil)
		close(done)
	}()

	// Findings streamed, THEN the platform stops the execution with an error.
	proxy.ForwardResult(execID, []byte(`{}`), []*connectorpb.Finding{
		{Name: "Partial finding 1", Severity: "high", Host: "slow.example.com"},
		{Name: "Partial finding 2", Severity: "low", Host: "slow.example.com"},
	})
	proxy.SetError(execID, "context canceled")
	proxy.OnConnectorDown(execID)

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("timeout waiting for handleConnectorResult")
	}

	results := jobsSrv.getResults()
	if len(results) != 1 {
		t.Fatalf("expected exactly 1 submission, got %d", len(results))
	}
	got := results[0]
	if got.isError {
		t.Fatal("isError must be false: results already in hand must be delivered as success")
	}
	if got.raw != "" {
		t.Fatalf("expected raw \"\" for the partial submission, got %q", got.raw)
	}
	if len(got.vulns) != 2 {
		t.Fatalf("expected both streamed findings preserved, got %d: %+v", len(got.vulns), got.vulns)
	}

	// The lifecycle event must agree with the submission: not a failure.
	deadline := time.After(2 * time.Second)
	for {
		select {
		case ev := <-events:
			if ev.Type != EventJobCompleted {
				continue
			}
			if !ev.Success {
				t.Fatalf("EventJobCompleted Success=false with %d findings delivered; error=%q", len(got.vulns), ev.ErrorMsg)
			}
			return
		case <-deadline:
			t.Fatal("expected an EventJobCompleted event")
		}
	}
}

// TestHandleConnectorResultDisconnectWithFindingsDeliversPartialSuccess: a
// clean disconnect (no Done, no error) after findings arrived — worker
// restart mid-scan — keeps the findings instead of failing the job with
// "connector disconnected before Done".
func TestHandleConnectorResultDisconnectWithFindingsDeliversPartialSuccess(t *testing.T) {
	resetWorkerGlobals()

	client, jobsSrv, _ := newWorkerTestSetup(t)
	proxy := connector.NewProxy()
	events := make(chan TuiEvent, 64)

	execID := "exec-partial-2"
	bridgeMu.Lock()
	bridge[execID] = &bridgeEntry{jobID: "job-partial-2", category: "vulnerabilities", release: func() {}}
	bridgeMu.Unlock()
	resultCh := make(chan connector.ResultMsg, 4)
	proxy.Register(execID, resultCh)

	done := make(chan struct{})
	go func() {
		handleConnectorResult(context.Background(), execID, client, events, proxy, resultCh, time.Now(), time.Minute, nil, nil)
		close(done)
	}()

	proxy.ForwardResult(execID, []byte(`{}`), []*connectorpb.Finding{
		{Name: "Before restart", Severity: "medium", Host: "x.example.com"},
	})
	proxy.OnConnectorDown(execID)

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("timeout waiting for handleConnectorResult")
	}

	results := jobsSrv.getResults()
	if len(results) != 1 {
		t.Fatalf("expected exactly 1 submission, got %d", len(results))
	}
	if results[0].isError {
		t.Fatal("disconnect with findings must deliver them as success, not error")
	}
	if len(results[0].vulns) != 1 {
		t.Fatalf("expected the streamed finding preserved, got %d", len(results[0].vulns))
	}
}

// TestHandleConnectorResultUrlDiscoveryDisconnectKeepsUrls: same contract for
// url_discovery — accumulated URLs survive a platform-side stop.
func TestHandleConnectorResultUrlDiscoveryDisconnectKeepsUrls(t *testing.T) {
	resetWorkerGlobals()

	client, jobsSrv, _ := newWorkerTestSetup(t)
	proxy := connector.NewProxy()
	events := make(chan TuiEvent, 64)

	execID := "exec-partial-3"
	bridgeMu.Lock()
	bridge[execID] = &bridgeEntry{jobID: "job-partial-3", category: "url_discovery", release: func() {}}
	bridgeMu.Unlock()
	resultCh := make(chan connector.ResultMsg, 4)
	proxy.Register(execID, resultCh)

	done := make(chan struct{})
	go func() {
		handleConnectorResult(context.Background(), execID, client, events, proxy, resultCh, time.Now(), time.Minute, nil, nil)
		close(done)
	}()

	proxy.ForwardResult(execID, []byte(`{}`), []*connectorpb.Finding{
		{Name: "https://example.com/kept", Severity: "info", MatchedAt: "https://example.com/kept", Host: "example.com"},
	})
	proxy.SetError(execID, "connector stopped")
	proxy.OnConnectorDown(execID)

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("timeout waiting for handleConnectorResult")
	}

	results := jobsSrv.getResults()
	if len(results) != 1 {
		t.Fatalf("expected exactly 1 submission, got %d", len(results))
	}
	if results[0].isError {
		t.Fatal("url_discovery partial results must be delivered as success")
	}
	if len(results[0].urls) != 1 {
		t.Fatalf("expected the streamed URL preserved, got %d", len(results[0].urls))
	}
}

// TestFindingToDiscoveredUrl_Nil: a nil finding maps to nil (skipped by the
// caller), matching findingToVulnerability's nil-safety.
func TestFindingToDiscoveredUrl_Nil(t *testing.T) {
	if got := findingToDiscoveredUrl(nil); got != nil {
		t.Fatalf("expected nil for nil finding, got %+v", got)
	}
}

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
