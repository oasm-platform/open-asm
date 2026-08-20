package grpcclient

import (
	"context"
	"fmt"

	jobsRegistry "oasm-worker/internal/gen/jobs_registry"
)

// NextJob pulls the next job from the registry.
// Returns (nil, nil) when no job is available.
func (c *Client) NextJob(ctx context.Context) (*jobsRegistry.Job, error) {
	job, err := c.jobs.Next(ctx, &jobsRegistry.Worker{Id: c.WorkerID()})
	if err != nil {
		return nil, fmt.Errorf("failed to fetch next job: %w", err)
	}
	if job == nil || job.Id == "" {
		return nil, nil
	}
	return job, nil
}

// SubmitSubdomainsResult submits subdomain discovery results for a job.
func (c *Client) SubmitSubdomainsResult(ctx context.Context, jobID string, isError bool, raw string, assets []*jobsRegistry.Asset) error {
	req := &jobsRegistry.SubdomainResultRequest{
		WorkerId: c.WorkerID(),
		JobId:    jobID,
		Error:    isError,
		Assets:   &jobsRegistry.AssetList{Values: assets},
	}
	if raw != "" {
		req.Raw = &raw
	}

	resp, err := c.jobs.ResultSubdomains(ctx, req)
	if err != nil {
		return fmt.Errorf("failed to submit subdomains result: %w", err)
	}
	if !resp.Success {
		return fmt.Errorf("server rejected the subdomains result submission")
	}
	return nil
}

// SubmitHttpProbeResult submits HTTP probe scan results for a job.
func (c *Client) SubmitHttpProbeResult(ctx context.Context, jobID string, isError bool, raw string, httpResponse *jobsRegistry.HttpResponse) error {
	req := &jobsRegistry.HttpProbeResultRequest{
		WorkerId:     c.WorkerID(),
		JobId:        jobID,
		Error:        isError,
		HttpResponse: httpResponse,
	}
	if raw != "" {
		req.Raw = &raw
	}

	resp, err := c.jobs.ResultHttpProbe(ctx, req)
	if err != nil {
		return fmt.Errorf("failed to submit http-probe result: %w", err)
	}
	if !resp.Success {
		return fmt.Errorf("server rejected the http-probe result submission")
	}
	return nil
}

// SubmitPortsResult submits port scanner results for a job.
func (c *Client) SubmitPortsResult(ctx context.Context, jobID string, isError bool, raw string, ports []int32) error {
	req := &jobsRegistry.PortsResultRequest{
		WorkerId: c.WorkerID(),
		JobId:    jobID,
		Error:    isError,
		Numbers:  &jobsRegistry.NumberList{Values: ports},
	}
	if raw != "" {
		req.Raw = &raw
	}

	resp, err := c.jobs.ResultPorts(ctx, req)
	if err != nil {
		return fmt.Errorf("failed to submit ports result: %w", err)
	}
	if !resp.Success {
		return fmt.Errorf("server rejected the ports result submission")
	}
	return nil
}

// SubmitVulnerabilitiesResult submits vulnerability scan results for a job.
func (c *Client) SubmitVulnerabilitiesResult(ctx context.Context, jobID string, isError bool, raw string, vulns []*jobsRegistry.Vulnerability) error {
	req := &jobsRegistry.VulnerabilitiesResultRequest{
		WorkerId:        c.WorkerID(),
		JobId:           jobID,
		Error:           isError,
		Vulnerabilities: &jobsRegistry.VulnerabilityList{Values: vulns},
	}
	if raw != "" {
		req.Raw = &raw
	}

	resp, err := c.jobs.ResultVulnerabilities(ctx, req)
	if err != nil {
		return fmt.Errorf("failed to submit vulnerabilities result: %w", err)
	}
	if !resp.Success {
		return fmt.Errorf("server rejected the vulnerabilities result submission")
	}
	return nil
}

// SubmitScreenshotResult submits screenshot capture results for a job.
func (c *Client) SubmitScreenshotResult(ctx context.Context, jobID string, isError bool, raw string) error {
	req := &jobsRegistry.ScreenshotResultRequest{
		WorkerId: c.WorkerID(),
		JobId:    jobID,
		Error:    isError,
	}
	if raw != "" {
		req.Raw = &raw
	}

	resp, err := c.jobs.ResultScreenshot(ctx, req)
	if err != nil {
		return fmt.Errorf("failed to submit screenshot result: %w", err)
	}
	if !resp.Success {
		return fmt.Errorf("server rejected the screenshot result submission")
	}
	return nil
}

// SubmitResult submits a job result using the legacy generic endpoint.
//
// Deprecated: Use the category-specific methods instead (SubmitSubdomainsResult,
// SubmitHttpProbeResult, SubmitPortsResult, etc.). The category-specific
// endpoints provide type-safe payloads and are the recommended path forward.
// This method is kept for backward compatibility during worker migration.
func (c *Client) SubmitResult(ctx context.Context, jobID string, payload *jobsRegistry.DataPayloadResult) error {
	req := &jobsRegistry.JobResultRequest{
		WorkerId: c.WorkerID(),
		Data: &jobsRegistry.UpdateResultDto{
			JobId: jobID,
			Data:  payload,
		},
	}

	resp, err := c.jobs.Result(ctx, req)
	if err != nil {
		return fmt.Errorf("failed to submit job result: %w", err)
	}
	if !resp.Success {
		return fmt.Errorf("server rejected the result submission")
	}
	return nil
}
