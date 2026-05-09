package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"strings"
	"sync"

	"github.com/go-rod/rod"
	"github.com/oasm-platform/oasm-sdk-go/oasm"
	"github.com/oasm-platform/open-asm/grpc-client/go/jobs_registry"
)

func processJob(ctx context.Context, client *oasm.Client, browser *rod.Browser, toolPath string, activeJobsMu *sync.Mutex, activeJobs *map[string]struct{}) {
	job, err := client.JobsNext(ctx)
	if err != nil {
		log.Printf("Failed to pull job: %v", err)
		return
	}
	if job == nil || job.Id == "" {
		return
	}
	// Track this job as active
	(*activeJobsMu).Lock()
	(*activeJobs)[job.Id] = struct{}{}
	(*activeJobsMu).Unlock()

	// Ensure we remove the job from tracking when done
	defer func() {
		(*activeJobsMu).Lock()
		delete(*activeJobs, job.Id)
		(*activeJobsMu).Unlock()
	}()

	cmdStr := job.GetCommand()
	log.Printf("[JOB %s] Started: %s", job.Id, cmdStr)

	if cmdStr == "" {
		log.Printf("Job %s has no command to execute", job.Id)
		client.JobsResult(ctx, job.Id, oasm.NewErrorResult("No command provided by Core"))
		return
	}

	log.Printf("Executing Job ID: %s | Command: %s", job.Id, cmdStr)

	var payload *jobs_registry.DataPayloadResult

	if after, ok := strings.CutPrefix(cmdStr, "screenshot "); ok {
		url := strings.TrimSpace(after)
		log.Printf("Taking screenshot for URL: %s", url)

		base64Image, screenshotErr := TakeScreenshotBase64(ctx, browser, url)
		if screenshotErr != nil {
			log.Printf("[JOB %s] Screenshot error for %s: %v", job.Id, url, screenshotErr)
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
			log.Printf("Screenshot job %s failed: %v", job.Id, err)
			errMsg := fmt.Sprintf("Screenshot error: %v", err)
			payload = oasm.NewErrorResult(errMsg)
		} else {
			log.Printf("Screenshot job %s completed successfully", job.Id)
			jsonStr := string(jsonBytes)
			payload = &jobs_registry.DataPayloadResult{
				Error: false,
				Raw:   &jsonStr,
			}
		}
	} else {
		cmd := exec.Command("sh", "-c", cmdStr)
		cmd.SysProcAttr = newSysProcAttr()

		pathSep := string(os.PathListSeparator)
		customPath := fmt.Sprintf("PATH=%s%s%s", toolPath, pathSep, os.Getenv("PATH"))
		cmd.Env = append(os.Environ(), customPath)

		output, _ := cmd.CombinedOutput()
		outStr := string(output)

		payload = &jobs_registry.DataPayloadResult{
			Error: false,
			Raw:   &outStr,
		}
	}

	err = client.JobsResult(ctx, job.Id, payload)
	if err != nil {
		log.Printf("Failed to submit result for Job %s: %v", job.Id, err)
	}
	log.Printf("[JOB %s] Completed", job.Id)
}
