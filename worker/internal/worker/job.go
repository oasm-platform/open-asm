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
	"github.com/oasm-platform/oasm-sdk-go/oasm"
	pb "github.com/oasm-platform/open-asm/grpc-client/go/jobs_registry"
)

func processJob(ctx context.Context, client *oasm.Client, browser *rod.Browser, toolPath string, events chan<- TuiEvent) {
	job, err := client.JobsNext(ctx)
	if err != nil {
		NewTuiLogger(events, "Jobs").ErrorE("Failed to pull job", err)
		return
	}
	if job == nil || job.Id == "" {
		return
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
		submitCategoryError(ctx, client, events, job.Id, category, "No command provided by Core")
		return
	}

	NewTuiLogger(events, "Jobs").Info("[%s] Executing: %s (category: %s)", job.Id, cmdStr, category)

	if after, ok := strings.CutPrefix(cmdStr, "screenshot "); ok {
		url := strings.TrimSpace(after)

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
			submitCategoryError(ctx, client, events, job.Id, category, fmt.Sprintf("Screenshot error: %v", err))
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
			submitCategoryError(ctx, client, events, job.Id, category, fmt.Sprintf("JSON error: %v", err))
			return
		}

		if submitErr := submitCategoryResult(ctx, client, job.Id, category, false, string(jsonBytes)); submitErr != nil {
			completed = true
			NewTuiLogger(events, "Jobs").ErrorE(fmt.Sprintf("[%s] Failed to submit screenshot result", job.Id), submitErr)
			Emit(events, TuiEvent{
				Type:     EventJobCompleted,
				JobID:    job.Id,
				Success:  false,
				ErrorMsg: submitErr.Error(),
				Duration: time.Since(startTime),
			})
			return
		}
		return
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

		if submitErr := submitCategoryResult(ctx, client, job.Id, category, isError, outStr); submitErr != nil {
			completed = true
			NewTuiLogger(events, "Jobs").ErrorE(fmt.Sprintf("[%s] Failed to submit result", job.Id), submitErr)
			Emit(events, TuiEvent{
				Type:     EventJobCompleted,
				JobID:    job.Id,
				Success:  false,
				ErrorMsg: submitErr.Error(),
				Duration: time.Since(startTime),
			})
			return
		}
	}
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
func submitCategoryError(ctx context.Context, client *oasm.Client, events chan<- TuiEvent, jobID, category, errMsg string) {
	if submitErr := submitCategoryResult(ctx, client, jobID, category, true, errMsg); submitErr != nil {
		NewTuiLogger(events, "Jobs").ErrorE(fmt.Sprintf("[%s] Failed to submit error", jobID), submitErr)
	}
}
