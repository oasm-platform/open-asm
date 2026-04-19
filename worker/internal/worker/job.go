package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"strings"

	"github.com/go-rod/rod"
	"github.com/oasm-platform/oasm-sdk-go/oasm"
	"github.com/oasm-platform/open-asm/grpc-client/go/jobs_registry"
)

func processJob(ctx context.Context, client *oasm.Client, browser *rod.Browser, toolPath string) {
	job, err := client.JobsNext(ctx)
	if err != nil {
		log.Printf("Failed to pull job: %v", err)
		return
	}
	if job == nil || job.Id == "" {
		return
	}

	cmdStr := job.GetCommand()
	if cmdStr == "" {
		log.Printf("Job %s has no command to execute", job.Id)
		client.JobsResult(ctx, job.Id, oasm.NewErrorResult("No command provided by Core"))
		return
	}

	log.Printf("Executing Job ID: %s | Command: %s", job.Id, cmdStr)

	var payload *jobs_registry.DataPayloadResult

	if strings.HasPrefix(cmdStr, "screenshot ") {
		url := strings.TrimSpace(strings.TrimPrefix(cmdStr, "screenshot "))
		log.Printf("Taking screenshot for URL: %s", url)

		base64Image, err := TakeScreenshotBase64(ctx, browser, url)

		resultData := struct {
			Screenshot string `json:"screenshot"`
			URL        string `json:"url"`
		}{
			Screenshot: base64Image,
			URL:        formatURL(url), // Hoặc nếu muốn url đã có http/https, bạn có thể gọi hàm formatURL ở đây
		}

		// 2. Chuyển struct thành chuỗi JSON
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
		// Nếu không phải screenshot, thực thi như một shell command bình thường
		cmd := exec.CommandContext(ctx, "sh", "-c", cmdStr)

		pathSep := string(os.PathListSeparator)
		customPath := fmt.Sprintf("PATH=%s%s%s", toolPath, pathSep, os.Getenv("PATH"))
		cmd.Env = append(os.Environ(), customPath)

		output, err := cmd.CombinedOutput()
		outStr := string(output)

		if err != nil {
			log.Printf("Job %s failed: %v", job.Id, err)
			errMsg := fmt.Sprintf("Exec error: %v\nOutput: %s", err, outStr)
			payload = oasm.NewErrorResult(errMsg)
		} else {
			log.Printf("Job %s completed successfully", job.Id)
			payload = &jobs_registry.DataPayloadResult{
				Error: false,
				Raw:   &outStr,
			}
		}
	}

	// Gửi kết quả (của cả screenshot hoặc shell command) về cho Core
	err = client.JobsResult(ctx, job.Id, payload)
	if err != nil {
		log.Printf("Failed to submit result for Job %s: %v", job.Id, err)
	}
}
