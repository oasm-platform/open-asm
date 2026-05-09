package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"sync"

	"github.com/go-rod/rod"
	"github.com/oasm-platform/oasm-sdk-go/oasm"
	"github.com/oasm-platform/open-asm/grpc-client/go/jobs_registry"
)

func processJob(ctx context.Context, client *oasm.Client, browser *rod.Browser, toolPath string, activeJobsMu *sync.Mutex, activeJobs *map[string]struct{}) {
	l := oasm.NewLogger("Worker.Job")

	job, err := client.JobsNext(ctx)
	if err != nil {
		l.ErrorE("Failed to pull job", err)
		return
	}
	if job == nil || job.Id == "" {
		return
	}

	activeJobsMu.Lock()
	(*activeJobs)[job.Id] = struct{}{}
	activeJobsMu.Unlock()

	defer func() {
		activeJobsMu.Lock()
		delete(*activeJobs, job.Id)
		activeJobsMu.Unlock()
	}()

	cmdStr := job.GetCommand()
	if cmdStr == "" {
		l.Warning("[%s] Empty command", job.Id)
		client.JobsResult(ctx, job.Id, oasm.NewErrorResult("No command provided by Core"))
		return
	}

	l.Info("[%s] Executing: %s", job.Id, cmdStr)

	var payload *jobs_registry.DataPayloadResult

	if after, ok := strings.CutPrefix(cmdStr, "screenshot "); ok {
		url := strings.TrimSpace(after)
		l.Debug("[%s] Capturing screenshot: %s", job.Id, url)

		base64Image, err := TakeScreenshotBase64(ctx, browser, url)
		if err != nil {
			l.ErrorE(fmt.Sprintf("[%s] Screenshot failed for %s", job.Id, url), err)
			payload = oasm.NewErrorResult(fmt.Sprintf("Screenshot error: %v", err))
		} else {
			resultData := struct {
				Screenshot string `json:"screenshot"`
				URL        string `json:"url"`
			}{
				Screenshot: base64Image,
				URL:        formatURL(url),
			}

			if jsonBytes, err := json.Marshal(resultData); err != nil {
				l.ErrorE(fmt.Sprintf("[%s] JSON marshal failed", job.Id), err)
				payload = oasm.NewErrorResult(fmt.Sprintf("JSON error: %v", err))
			} else {
				jsonStr := string(jsonBytes)
				payload = &jobs_registry.DataPayloadResult{
					Error: false,
					Raw:   &jsonStr,
				}
			}
		}
	} else {
		cmd := exec.CommandContext(ctx, "sh", "-c", cmdStr)
		cmd.SysProcAttr = newSysProcAttr()
		cmd.Env = append(os.Environ(), fmt.Sprintf("PATH=%s%c%s", toolPath, os.PathListSeparator, os.Getenv("PATH")))

		output, err := cmd.CombinedOutput()
		if err != nil {
			l.Verbose("[%s] Process exited with error: %v", job.Id, err)
		}

		outStr := string(output)
		payload = &jobs_registry.DataPayloadResult{
			Error: false,
			Raw:   &outStr,
		}
	}

	if err := client.JobsResult(ctx, job.Id, payload); err != nil {
		l.ErrorE(fmt.Sprintf("[%s] Failed to submit result", job.Id), err)
		return
	}

	l.Success("[%s] Completed", job.Id)
}
