package client

import (
	"context"

	jobs_registry "github.com/oasm-platform/open-asm/grpc-client/go/jobs_registry"
)

// Next pulls the next job for this worker. The worker identity is resolved by
// core-api via the token guard, so the request body carries an empty Id.
//
// NOTE: Client embeds jobs_registry.JobsRegistryServiceClient, which promotes
// Next onto *Client. This method shadows the promoted one; the embedded client
// is called explicitly to avoid infinite recursion.
func (c *Client) Next(ctx context.Context) (*jobs_registry.Job, error) {
	return c.JobsRegistryServiceClient.Next(ctx, &jobs_registry.Worker{Id: ""})
}

// SubmitResult reports a scan result for one job, dispatching to the
// category-specific RPC when the category is known and falling back to the
// deprecated generic Result RPC otherwise. Only raw output and the error flag
// are sent in this phase; structured payload fields (Assets, HttpResponse,
// Numbers, Vulnerabilities) stay nil.
func (c *Client) SubmitResult(ctx context.Context, workerID, jobID, category string, isError bool, raw string) error {
	switch category {
	case "subdomains":
		_, err := c.JobsRegistryServiceClient.ResultSubdomains(ctx, &jobs_registry.SubdomainResultRequest{
			WorkerId: workerID,
			JobId:    jobID,
			Error:    isError,
			Raw:      &raw,
		})
		return err
	case "http_probe":
		_, err := c.JobsRegistryServiceClient.ResultHttpProbe(ctx, &jobs_registry.HttpProbeResultRequest{
			WorkerId: workerID,
			JobId:    jobID,
			Error:    isError,
			Raw:      &raw,
		})
		return err
	case "ports_scanner":
		_, err := c.JobsRegistryServiceClient.ResultPorts(ctx, &jobs_registry.PortsResultRequest{
			WorkerId: workerID,
			JobId:    jobID,
			Error:    isError,
			Raw:      &raw,
		})
		return err
	case "vulnerabilities":
		_, err := c.JobsRegistryServiceClient.ResultVulnerabilities(ctx, &jobs_registry.VulnerabilitiesResultRequest{
			WorkerId: workerID,
			JobId:    jobID,
			Error:    isError,
			Raw:      &raw,
		})
		return err
	case "screenshot":
		_, err := c.JobsRegistryServiceClient.ResultScreenshot(ctx, &jobs_registry.ScreenshotResultRequest{
			WorkerId: workerID,
			JobId:    jobID,
			Error:    isError,
			Raw:      &raw,
		})
		return err
	default:
		_, err := c.JobsRegistryServiceClient.Result(ctx, &jobs_registry.JobResultRequest{
			WorkerId: workerID,
			Data: &jobs_registry.UpdateResultDto{
				JobId: jobID,
				Data: &jobs_registry.DataPayloadResult{
					Error: isError,
					Raw:   &raw,
				},
			},
		})
		return err
	}
}

// resultMethod maps a scan category to the RPC method name used to submit its
// results. known is false for unknown categories, which fall back to the
// deprecated generic Result RPC.
func resultMethod(category string) (methodName string, known bool) {
	switch category {
	case "subdomains":
		return "ResultSubdomains", true
	case "http_probe":
		return "ResultHttpProbe", true
	case "ports_scanner":
		return "ResultPorts", true
	case "vulnerabilities":
		return "ResultVulnerabilities", true
	case "screenshot":
		return "ResultScreenshot", true
	default:
		return "Result", false
	}
}
