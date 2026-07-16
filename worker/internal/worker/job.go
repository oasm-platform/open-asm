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
	"github.com/oasm-platform/open-asm/grpc-client/go/jobs_registry"
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
	if cmdStr == "" {
		jobLogGlobal.Warning("[%s] Empty command", job.Id)
		_ = client.JobsScreenshotResult(ctx, job.Id, true, "No command provided by Core")
		return
	}

	jobLogGlobal.Info("[%s] Executing: %s", job.Id, cmdStr)

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
		// TODO: The Job proto doesn't include a category field, so we can't route to
		// category-specific result endpoints (JobsSubdomainsResult, JobsPortsResult, etc.).
		// Once the proto adds a category field, update this to use the appropriate method.
		// For now, use the deprecated generic Result endpoint which accepts raw output.
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
		payload := &jobs_registry.DataPayloadResult{
			Error: false,
			Raw:   &outStr,
		}

		if err := client.JobsResult(ctx, job.Id, payload); err != nil {
			jobLogGlobal.ErrorE(fmt.Sprintf("[%s] Failed to submit result", job.Id), err)
			return
		}
	}

	jobLogGlobal.Success("[%s] Completed", job.Id)
}
