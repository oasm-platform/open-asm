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
		_ = client.JobsResult(ctx, job.Id, oasm.NewErrorResult("No command provided by Core"))
		return
	}

	jobLogGlobal.Info("[%s] Executing: %s", job.Id, cmdStr)
	var payload *jobs_registry.DataPayloadResult

	if after, ok := strings.CutPrefix(cmdStr, "screenshot "); ok {
		url := strings.TrimSpace(after)
		jobLogGlobal.Debug("[%s] Capturing screenshot: %s", job.Id, url)

		base64Image, err := TakeScreenshotBase64(ctx, browser, url)
		if err != nil {
			jobLogGlobal.Warning("[%s] Screenshot capture failed: %v", job.Id, err)
		}
		resultData := struct {
			Screenshot string `json:"screenshot"`
			URL        string `json:"url"`
		}{
			Screenshot: base64Image,
			URL:        formatURL(url),
		}

		if jsonBytes, err := json.Marshal(resultData); err != nil {
			jobLogGlobal.ErrorE(fmt.Sprintf("[%s] JSON marshal failed", job.Id), err)
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
			jobLogGlobal.Verbose("[%s] Process exited with error: %v", job.Id, err)
		}

		outStr := string(output)
		payload = &jobs_registry.DataPayloadResult{
			Error: false,
			Raw:   &outStr,
		}
	}

	if err := client.JobsResult(ctx, job.Id, payload); err != nil {
		jobLogGlobal.ErrorE(fmt.Sprintf("[%s] Failed to submit result", job.Id), err)
		return
	}

	jobLogGlobal.Success("[%s] Completed", job.Id)
}
