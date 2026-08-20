package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/go-rod/rod"
	pb "github.com/oasm-platform/open-asm/grpc-client/go/jobs_registry"

	"oasm-worker/internal/grpcclient"
)

func processJob(ctx context.Context, grpcClient *grpcclient.Client, getBrowser func() (*rod.Browser, error), toolPath string, events chan<- TuiEvent) bool {
	job, err := grpcClient.NextJob(ctx)
	if err != nil {
		NewTuiLogger(events, "Jobs").ErrorE("Failed to pull job", err)
		return false
	}
	if job == nil || job.Id == "" {
		return false
	}

	startTime := time.Now()
	cmdStr := job.GetCommand()

	Emit(events, TuiEvent{
		Type:       EventJobStarted,
		JobID:      job.Id,
		Command:    cmdStr,
		AssetID:    job.GetAsset().GetId(),
		AssetValue: job.GetAsset().GetValue(),
	})

	activeJobsMu.Lock()
	activeJobs[job.Id] = struct{}{}
	activeJobsMu.Unlock()

	var completed bool
	defer func() {
		activeJobsMu.Lock()
		delete(activeJobs, job.Id)
		activeJobsMu.Unlock()
		if !completed {
			completed = true
			Emit(events, TuiEvent{
				Type:     EventJobCompleted,
				JobID:    job.Id,
				Success:  true,
				Duration: time.Since(startTime),
			})
		}
	}()

	category := job.GetCategory()

	if cmdStr == "" {
		completed = true
		Emit(events, TuiEvent{
			Type:     EventJobCompleted,
			JobID:    job.Id,
			Success:  false,
			ErrorMsg: "No command provided by Core",
			Duration: time.Since(startTime),
		})
		submitCategoryError(ctx, grpcClient, events, job.Id, category, "No command provided by Core")
		return true
	}

	NewTuiLogger(events, "Jobs").Info("[%s] Executing: %s (category: %s)", job.Id, cmdStr, category)

	if after, ok := strings.CutPrefix(cmdStr, "screenshot "); ok {
		url := strings.TrimSpace(after)

		browser, err := getBrowser()
		if err != nil {
			completed = true
			Emit(events, TuiEvent{
				Type:          EventActivity,
				Source:        "Jobs",
				ActivityLevel: "warning",
				Message:       fmt.Sprintf("Screenshot failed (browser init): %v", err),
			})
			Emit(events, TuiEvent{
				Type:     EventJobCompleted,
				JobID:    job.Id,
				Success:  false,
				ErrorMsg: fmt.Sprintf("Screenshot error (browser init): %v", err),
				Duration: time.Since(startTime),
			})
			submitCategoryError(ctx, grpcClient, events, job.Id, category, fmt.Sprintf("Screenshot error (browser init): %v", err))
			return true
		}
		base64Image, err := TakeScreenshotBase64(ctx, browser, url)
		if err != nil {
			completed = true
			Emit(events, TuiEvent{
				Type:          EventActivity,
				Source:        "Jobs",
				ActivityLevel: "warning",
				Message:       fmt.Sprintf("Screenshot failed: %v", err),
			})
			Emit(events, TuiEvent{
				Type:     EventJobCompleted,
				JobID:    job.Id,
				Success:  false,
				ErrorMsg: fmt.Sprintf("Screenshot error: %v", err),
				Duration: time.Since(startTime),
			})
			submitCategoryError(ctx, grpcClient, events, job.Id, category, fmt.Sprintf("Screenshot error: %v", err))
			return true
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
			completed = true
			Emit(events, TuiEvent{
				Type:          EventActivity,
				Source:        "Jobs",
				ActivityLevel: "error",
				Message:       fmt.Sprintf("JSON marshal failed: %v", err),
			})
			Emit(events, TuiEvent{
				Type:     EventJobCompleted,
				JobID:    job.Id,
				Success:  false,
				ErrorMsg: fmt.Sprintf("JSON error: %v", err),
				Duration: time.Since(startTime),
			})
			submitCategoryError(ctx, grpcClient, events, job.Id, category, fmt.Sprintf("JSON error: %v", err))
			return true
		}

		if submitErr := submitCategoryResult(ctx, grpcClient, job.Id, category, false, string(jsonBytes)); submitErr != nil {
			completed = true
			NewTuiLogger(events, "Jobs").ErrorE(fmt.Sprintf("[%s] Failed to submit screenshot result", job.Id), submitErr)
			Emit(events, TuiEvent{
				Type:     EventJobCompleted,
				JobID:    job.Id,
				Success:  false,
				ErrorMsg: submitErr.Error(),
				Duration: time.Since(startTime),
			})
			return true
		}
		return true
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
			completed = true
			Emit(events, TuiEvent{
				Type:     EventJobCompleted,
				JobID:    job.Id,
				Success:  false,
				ErrorMsg: err.Error(),
				Duration: time.Since(startTime),
			})
		}

		outStr := string(output)
		isError := err != nil

		if outStr != "" {
			for _, line := range strings.Split(outStr, "\n") {
				if line != "" {
					Emit(events, TuiEvent{
						Type:         EventJobOutput,
						JobID:        job.Id,
						OutputLine:   line,
						OutputStream: "output",
					})
				}
			}
		}

		if submitErr := submitCategoryResult(ctx, grpcClient, job.Id, category, isError, outStr); submitErr != nil {
			completed = true
			NewTuiLogger(events, "Jobs").ErrorE(fmt.Sprintf("[%s] Failed to submit result", job.Id), submitErr)
			Emit(events, TuiEvent{
				Type:     EventJobCompleted,
				JobID:    job.Id,
				Success:  false,
				ErrorMsg: submitErr.Error(),
				Duration: time.Since(startTime),
			})
			return true
		}
	}
	return true
}

// submitCategoryResult submits the command output to the appropriate category-specific endpoint.
// Falls back to the deprecated generic endpoint for unknown categories.
func submitCategoryResult(ctx context.Context, grpcClient *grpcclient.Client, jobID, category string, isError bool, raw string) error {
	switch category {
	case "subdomains":
		return grpcClient.SubmitSubdomainsResult(ctx, jobID, isError, raw, nil)
	case "http_probe":
		return grpcClient.SubmitHttpProbeResult(ctx, jobID, isError, raw, nil)
	case "ports_scanner":
		return grpcClient.SubmitPortsResult(ctx, jobID, isError, raw, nil)
	case "vulnerabilities":
		return grpcClient.SubmitVulnerabilitiesResult(ctx, jobID, isError, raw, nil)
	case "screenshot":
		return grpcClient.SubmitScreenshotResult(ctx, jobID, isError, raw)
	default:
		// Unknown category — use the deprecated generic endpoint
		payload := &pb.DataPayloadResult{
			Error: isError,
			Raw:   &raw,
		}
		return grpcClient.SubmitResult(ctx, jobID, payload)
	}
}

// submitCategoryError submits an error to the appropriate category-specific endpoint.
func submitCategoryError(ctx context.Context, grpcClient *grpcclient.Client, events chan<- TuiEvent, jobID, category, errMsg string) {
	if submitErr := submitCategoryResult(ctx, grpcClient, jobID, category, true, errMsg); submitErr != nil {
		NewTuiLogger(events, "Jobs").ErrorE(fmt.Sprintf("[%s] Failed to submit error", jobID), submitErr)
	}
}
