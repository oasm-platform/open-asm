package grpcclient

import (
	"context"
	"errors"
	"strings"
	"testing"

	jobsRegistry "github.com/oasm-platform/open-asm/grpc-client/go/jobs_registry"
)

func TestNextJob_ReturnsJob(t *testing.T) {
	srv := newTestServer(t)
	srv.jobsSrv.nextFn = func(ctx context.Context, req *jobsRegistry.Worker) (*jobsRegistry.Job, error) {
		if req.Id != "" {
			t.Errorf("expected empty worker id (not joined), got %q", req.Id)
		}
		command := "nuclei -u target.com"
		return &jobsRegistry.Job{Id: "job-1", Command: &command}, nil
	}

	job, err := srv.client.NextJob(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if job == nil || job.Id != "job-1" {
		t.Errorf("expected job-1, got %v", job)
	}
}

func TestNextJob_EmptyJob(t *testing.T) {
	srv := newTestServer(t)
	srv.jobsSrv.nextFn = func(ctx context.Context, req *jobsRegistry.Worker) (*jobsRegistry.Job, error) {
		return nil, nil
	}

	job, err := srv.client.NextJob(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if job != nil {
		t.Errorf("expected nil job, got %v", job)
	}
}

func TestNextJob_EmptyJobID(t *testing.T) {
	// A job with an empty ID counts as "no job available".
	srv := newTestServer(t)
	srv.jobsSrv.nextFn = func(ctx context.Context, req *jobsRegistry.Worker) (*jobsRegistry.Job, error) {
		return &jobsRegistry.Job{}, nil
	}

	job, err := srv.client.NextJob(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if job != nil {
		t.Errorf("expected nil job, got %v", job)
	}
}

func TestNextJob_ServerError(t *testing.T) {
	srv := newTestServer(t)
	srv.jobsSrv.nextFn = func(ctx context.Context, req *jobsRegistry.Worker) (*jobsRegistry.Job, error) {
		return nil, errors.New("boom")
	}

	job, err := srv.client.NextJob(context.Background())
	if err == nil {
		t.Fatal("expected error")
	}
	if job != nil {
		t.Errorf("expected nil job on error, got %v", job)
	}
	if !strings.Contains(err.Error(), "failed to fetch next job") {
		t.Errorf("expected wrapped error, got %v", err)
	}
}

func TestSubmitSubdomainsResult(t *testing.T) {
	srv := newTestServer(t)
	srv.jobsSrv.resultSubdomainsFn = func(ctx context.Context, req *jobsRegistry.SubdomainResultRequest) (*jobsRegistry.JobResponse, error) {
		if req.WorkerId != "" {
			t.Errorf("expected empty worker id (not joined), got %q", req.WorkerId)
		}
		if req.JobId != "job-1" {
			t.Errorf("expected job-1, got %q", req.JobId)
		}
		if !req.Error {
			t.Error("expected error=true")
		}
		if req.Raw != nil {
			t.Errorf("expected nil raw for empty raw string, got %q", *req.Raw)
		}
		if req.Assets == nil || len(req.Assets.Values) != 0 {
			t.Errorf("expected empty assets list, got %v", req.Assets)
		}
		return &jobsRegistry.JobResponse{Success: true}, nil
	}

	err := srv.client.SubmitSubdomainsResult(context.Background(), "job-1", true, "", nil)
	if err != nil {
		t.Fatal(err)
	}
}

func TestSubmitSubdomainsResult_WithRawAndAssets(t *testing.T) {
	srv := newTestServer(t)
	srv.jobsSrv.resultSubdomainsFn = func(ctx context.Context, req *jobsRegistry.SubdomainResultRequest) (*jobsRegistry.JobResponse, error) {
		if req.Raw == nil || *req.Raw != "subdomains.json" {
			t.Errorf("expected raw=subdomains.json, got %v", req.Raw)
		}
		if req.Assets == nil || len(req.Assets.Values) != 1 || req.Assets.Values[0].Value != "sub.example.com" {
			t.Errorf("expected one asset sub.example.com, got %v", req.Assets)
		}
		return &jobsRegistry.JobResponse{Success: true}, nil
	}

	assets := []*jobsRegistry.Asset{{Value: "sub.example.com"}}
	err := srv.client.SubmitSubdomainsResult(context.Background(), "job-1", false, "subdomains.json", assets)
	if err != nil {
		t.Fatal(err)
	}
}

func TestSubmitHttpProbeResult(t *testing.T) {
	srv := newTestServer(t)
	srv.jobsSrv.resultHttpProbeFn = func(ctx context.Context, req *jobsRegistry.HttpProbeResultRequest) (*jobsRegistry.JobResponse, error) {
		if req.WorkerId != "" {
			t.Errorf("expected empty worker id (not joined), got %q", req.WorkerId)
		}
		if req.JobId != "job-1" {
			t.Errorf("expected job-1, got %q", req.JobId)
		}
		if req.Error {
			t.Error("expected error=false")
		}
		if req.Raw == nil || *req.Raw != "httpx.json" {
			t.Errorf("expected raw=httpx.json, got %v", req.Raw)
		}
		if req.HttpResponse == nil || req.HttpResponse.Url != "https://example.com" {
			t.Errorf("expected http response url, got %v", req.HttpResponse)
		}
		return &jobsRegistry.JobResponse{Success: true}, nil
	}

	resp := &jobsRegistry.HttpResponse{Url: "https://example.com"}
	err := srv.client.SubmitHttpProbeResult(context.Background(), "job-1", false, "httpx.json", resp)
	if err != nil {
		t.Fatal(err)
	}
}

func TestSubmitPortsResult(t *testing.T) {
	srv := newTestServer(t)
	srv.jobsSrv.resultPortsFn = func(ctx context.Context, req *jobsRegistry.PortsResultRequest) (*jobsRegistry.JobResponse, error) {
		if req.WorkerId != "" {
			t.Errorf("expected empty worker id (not joined), got %q", req.WorkerId)
		}
		if req.JobId != "job-1" {
			t.Errorf("expected job-1, got %q", req.JobId)
		}
		if !req.Error {
			t.Error("expected error=true")
		}
		if req.Raw != nil {
			t.Errorf("expected nil raw for empty raw string, got %q", *req.Raw)
		}
		if req.Numbers == nil || len(req.Numbers.Values) != 2 || req.Numbers.Values[0] != 80 || req.Numbers.Values[1] != 443 {
			t.Errorf("expected ports [80 443], got %v", req.Numbers)
		}
		return &jobsRegistry.JobResponse{Success: true}, nil
	}

	err := srv.client.SubmitPortsResult(context.Background(), "job-1", true, "", []int32{80, 443})
	if err != nil {
		t.Fatal(err)
	}
}

func TestSubmitVulnerabilitiesResult(t *testing.T) {
	srv := newTestServer(t)
	srv.jobsSrv.resultVulnsFn = func(ctx context.Context, req *jobsRegistry.VulnerabilitiesResultRequest) (*jobsRegistry.JobResponse, error) {
		if req.WorkerId != "" {
			t.Errorf("expected empty worker id (not joined), got %q", req.WorkerId)
		}
		if req.JobId != "job-1" {
			t.Errorf("expected job-1, got %q", req.JobId)
		}
		if req.Error {
			t.Error("expected error=false")
		}
		if req.Raw == nil || *req.Raw != "nuclei.json" {
			t.Errorf("expected raw=nuclei.json, got %v", req.Raw)
		}
		if req.Vulnerabilities == nil || len(req.Vulnerabilities.Values) != 1 || req.Vulnerabilities.Values[0].Name != "CVE-2024-0001" {
			t.Errorf("expected one vuln CVE-2024-0001, got %v", req.Vulnerabilities)
		}
		return &jobsRegistry.JobResponse{Success: true}, nil
	}

	vulns := []*jobsRegistry.Vulnerability{{Name: "CVE-2024-0001"}}
	err := srv.client.SubmitVulnerabilitiesResult(context.Background(), "job-1", false, "nuclei.json", vulns)
	if err != nil {
		t.Fatal(err)
	}
}

func TestSubmitScreenshotResult(t *testing.T) {
	srv := newTestServer(t)
	srv.jobsSrv.resultScreenshotFn = func(ctx context.Context, req *jobsRegistry.ScreenshotResultRequest) (*jobsRegistry.JobResponse, error) {
		if req.WorkerId != "" {
			t.Errorf("expected empty worker id (not joined), got %q", req.WorkerId)
		}
		if req.JobId != "job-1" {
			t.Errorf("expected job-1, got %q", req.JobId)
		}
		if !req.Error {
			t.Error("expected error=true")
		}
		if req.Raw != nil {
			t.Errorf("expected nil raw for empty raw string, got %q", *req.Raw)
		}
		return &jobsRegistry.JobResponse{Success: true}, nil
	}

	err := srv.client.SubmitScreenshotResult(context.Background(), "job-1", true, "")
	if err != nil {
		t.Fatal(err)
	}
}

func TestSubmitResult(t *testing.T) {
	srv := newTestServer(t)
	srv.jobsSrv.resultFn = func(ctx context.Context, req *jobsRegistry.JobResultRequest) (*jobsRegistry.JobResponse, error) {
		if req.WorkerId != "" {
			t.Errorf("expected empty worker id (not joined), got %q", req.WorkerId)
		}
		if req.Data == nil || req.Data.JobId != "job-1" {
			t.Errorf("expected data.job_id=job-1, got %v", req.Data)
		}
		if req.Data.Data == nil || !req.Data.Data.Error {
			t.Errorf("expected data.error=true, got %v", req.Data.Data)
		}
		return &jobsRegistry.JobResponse{Success: true}, nil
	}

	payload := &jobsRegistry.DataPayloadResult{Error: true}
	err := srv.client.SubmitResult(context.Background(), "job-1", payload)
	if err != nil {
		t.Fatal(err)
	}
}

func TestSubmitResult_ServerRejects(t *testing.T) {
	srv := newTestServer(t)
	srv.jobsSrv.resultFn = func(ctx context.Context, req *jobsRegistry.JobResultRequest) (*jobsRegistry.JobResponse, error) {
		return &jobsRegistry.JobResponse{Success: false}, nil
	}

	err := srv.client.SubmitResult(context.Background(), "job-1", &jobsRegistry.DataPayloadResult{Error: true})
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "rejected") {
		t.Errorf("expected rejected error, got %v", err)
	}
}

func TestSubmitPortsResult_ServerRejects(t *testing.T) {
	srv := newTestServer(t)
	srv.jobsSrv.resultPortsFn = func(ctx context.Context, req *jobsRegistry.PortsResultRequest) (*jobsRegistry.JobResponse, error) {
		return &jobsRegistry.JobResponse{Success: false}, nil
	}

	err := srv.client.SubmitPortsResult(context.Background(), "job-1", false, "", []int32{80})
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "rejected") {
		t.Errorf("expected rejected error, got %v", err)
	}
}
