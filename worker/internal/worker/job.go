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
	"github.com/oasm-platform/open-asm/grpc-client/go/jobs_registry"
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

	if cmdStr == "" {
		completed = true
		Emit(events, TuiEvent{
			Type:     EventJobCompleted,
			JobID:    job.Id,
			Success:  false,
			ErrorMsg: "No command provided by Core",
			Duration: time.Since(startTime),
		})
		_ = client.JobsResult(ctx, job.Id, oasm.NewErrorResult("No command provided by Core"))
		return
	}

	var payload *jobs_registry.DataPayloadResult

	if after, ok := strings.CutPrefix(cmdStr, "screenshot "); ok {
		url := strings.TrimSpace(after)

		base64Image, err := TakeScreenshotBase64(ctx, browser, url)
		if err != nil {
			Emit(events, TuiEvent{
				Type:          EventActivity,
				Source:        "Jobs",
				ActivityLevel: "warning",
				Message:       fmt.Sprintf("Screenshot failed: %v", err),
			})
		}
		resultData := struct {
			Screenshot string `json:"screenshot"`
			URL        string `json:"url"`
		}{
			Screenshot: base64Image,
			URL:        formatURL(url),
		}

		if jsonBytes, err := json.Marshal(resultData); err != nil {
			payload = oasm.NewErrorResult(fmt.Sprintf("JSON error: %v", err))
		} else {
			jsonStr := string(jsonBytes)
			payload = &jobs_registry.DataPayloadResult{
				Error: false,
				Raw:   &jsonStr,
			}
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
		payload = &jobs_registry.DataPayloadResult{
			Error: false,
			Raw:   &outStr,
		}
	}

	if err := client.JobsResult(ctx, job.Id, payload); err != nil {
		Emit(events, TuiEvent{
			Type:    EventError,
			Source:  "Jobs",
			Message: fmt.Sprintf("Failed to submit result for %s: %v", job.Id, err),
		})
		return
	}
}
