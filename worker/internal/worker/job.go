package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"runtime"
	"strings"

	"github.com/go-rod/rod"
	"github.com/oasm-platform/oasm-sdk-go/oasm"
	pb "github.com/oasm-platform/open-asm/grpc-client/go/jobs_registry"
)

var jobLogGlobal = oasm.NewLogger("Worker.Job")

func processJob(ctx context.Context, client *oasm.Client, browser *rod.Browser, toolPath string) {
	job, err := client.JobsNext(ctx)
	if err != nil {
		jobLogGlobal.ErrorE("Failed to pull job", err)
		return
	}
	if job == nil || job.Id == "" {
		return
	}

	activeJobsMu.Lock()
	activeJobs[job.Id] = struct{}{}
	activeJobsMu.Unlock()

	defer func() {
		activeJobsMu.Lock()
		delete(activeJobs, job.Id)
		activeJobsMu.Unlock()
	}()

	cmdStr := job.GetCommand()
	category := job.GetCategory()

	if cmdStr == "" {
		jobLogGlobal.Warning("[%s] Empty command", job.Id)
		submitCategoryError(ctx, client, job.Id, category, "No command provided by Core")
		return
	}

	jobLogGlobal.Info("[%s] Executing: %s (category: %s)", job.Id, cmdStr, category)

	if after, ok := strings.CutPrefix(cmdStr, "screenshot "); ok {
		url := strings.TrimSpace(after)
		jobLogGlobal.Debug("[%s] Capturing screenshot: %s", job.Id, url)

		base64Image, err := TakeScreenshotBase64(ctx, browser, url)
		if err != nil {
			jobLogGlobal.Warning("[%s] Screenshot capture failed: %v", job.Id, err)
			if submitErr := client.JobsScreenshotResult(ctx, job.Id, true, fmt.Sprintf("Screenshot error: %v", err)); submitErr != nil {
				jobLogGlobal.ErrorE(fmt.Sprintf("[%s] Failed to submit screenshot error", job.Id), submitErr)
			}
			return
		}

		resultData := struct {
			Screenshot string `json:"screenshot"`
			URL        string `json:"url"`
		}{
			Screenshot: base64Image,
			URL:        formatURL(url),
		}

		jsonBytes, err := json.Marshal(resultData)
		if err != nil {
			jobLogGlobal.ErrorE(fmt.Sprintf("[%s] JSON marshal failed", job.Id), err)
			if submitErr := client.JobsScreenshotResult(ctx, job.Id, true, fmt.Sprintf("JSON error: %v", err)); submitErr != nil {
				jobLogGlobal.ErrorE(fmt.Sprintf("[%s] Failed to submit screenshot error", job.Id), submitErr)
			}
			return
		}

		if err := client.JobsScreenshotResult(ctx, job.Id, false, string(jsonBytes)); err != nil {
			jobLogGlobal.ErrorE(fmt.Sprintf("[%s] Failed to submit screenshot result", job.Id), err)
			return
		}
	} else {
		var cmd *exec.Cmd
		if runtime.GOOS == "windows" {
			cmd = exec.CommandContext(ctx, "cmd", "/C", cmdStr)
		} else {
			cmd = exec.CommandContext(ctx, "sh", "-c", cmdStr)
		}
		cmd.SysProcAttr = newSysProcAttr()
		cmd.Env = setupCmdEnv(toolPath)

		output, err := cmd.CombinedOutput()
		if err != nil {
			jobLogGlobal.Verbose("[%s] Process exited with error: %v", job.Id, err)
		}

		outStr := string(output)
		isError := err != nil

		if submitErr := submitCategoryResult(ctx, client, job.Id, category, isError, outStr); submitErr != nil {
			jobLogGlobal.ErrorE(fmt.Sprintf("[%s] Failed to submit result", job.Id), submitErr)
			return
		}
	}

	jobLogGlobal.Success("[%s] Completed", job.Id)
}

// submitCategoryResult submits the command output to the appropriate category-specific endpoint.
// Falls back to the deprecated generic endpoint for unknown categories.
func submitCategoryResult(ctx context.Context, client *oasm.Client, jobID, category string, isError bool, raw string) error {
	switch category {
	case "subdomains":
		return client.JobsSubdomainsResult(ctx, jobID, isError, raw, nil)
	case "http_probe":
		return client.JobsHttpProbeResult(ctx, jobID, isError, raw, nil)
	case "ports_scanner":
		return client.JobsPortsResult(ctx, jobID, isError, raw, nil)
	case "vulnerabilities":
		return client.JobsVulnerabilitiesResult(ctx, jobID, isError, raw, nil)
	case "screenshot":
		return client.JobsScreenshotResult(ctx, jobID, isError, raw)
	case "classifier":
		return client.JobsClassifierResult(ctx, jobID, isError, raw, nil)
	case "assistant":
		return client.JobsAssistantResult(ctx, jobID, isError, raw)
	default:
		// Unknown category — use the deprecated generic endpoint
		payload := &pb.DataPayloadResult{
			Error: isError,
			Raw:   &raw,
		}
		return client.JobsResult(ctx, jobID, payload)
	}
}

// submitCategoryError submits an error to the appropriate category-specific endpoint.
func submitCategoryError(ctx context.Context, client *oasm.Client, jobID, category, errMsg string) {
	if submitErr := submitCategoryResult(ctx, client, jobID, category, true, errMsg); submitErr != nil {
		jobLogGlobal.ErrorE(fmt.Sprintf("[%s] Failed to submit error", jobID), submitErr)
	}
}
