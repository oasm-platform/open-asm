package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/go-rod/rod"
	pb "oasm-worker/internal/gen/jobs_registry"

	"oasm-worker/internal/connector"
	"oasm-worker/internal/execution"
	"oasm-worker/internal/grpcclient"
)

// bridgeEntry links a Docker execution back to the originating job.
// Stored in bridge map; accessed by processConnectorJob (Submit time) and
// handleConnectorResult (completion time).
type bridgeEntry struct {
	jobID    string
	category string
	release  func() // semaphore release callback — called only by completion handler
}

var (
	bridgeMu sync.Mutex
	bridge   = make(map[string]*bridgeEntry) // executionID → entry
)

func processJob(ctx context.Context, grpcClient *grpcclient.Client, getBrowser func() (*rod.Browser, error), toolPath string, events chan<- TuiEvent, mgr *execution.Manager, proxy *connector.Proxy, releaseSem func()) (bool, bool) {
	job, err := grpcClient.NextJob(ctx)
	if err != nil {
		NewTuiLogger(events, "Jobs").ErrorE("Failed to pull job", err)
		return false, false
	}
	if job == nil || job.Id == "" {
		return false, false
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

	category := job.GetCategory()

	// Connector path: image-based execution via Docker runtime.
	// processJob returns immediately after Submit; cleanup runs asynchronously
	// in handleConnectorResult when the container exits or connector signals Done.
	if img := job.GetImage(); img != "" && mgr != nil {
		return processConnectorJob(ctx, job, grpcClient, events, mgr, proxy, releaseSem, startTime, category)
	}

	// Legacy path: command-based execution (screenshot or shell).
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
		submitCategoryError(ctx, grpcClient, events, job.Id, category, "No command provided by Core")
		return true, false
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
			return true, false
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
			return true, false
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
			return true, false
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
			return true, false
		}
		return true, false
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
			return true, false
		}
	}
	return true, false
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

// processConnectorJob submits an image-based job to the Docker runtime via Manager.
// Returns immediately after Submit (fire-and-forget); cleanup runs asynchronously
// in handleConnectorResult when the container exits or connector signals Done.
func processConnectorJob(ctx context.Context, job *pb.Job, grpcClient *grpcclient.Client, events chan<- TuiEvent, mgr *execution.Manager, proxy *connector.Proxy, releaseSem func(), startTime time.Time, category string) (bool, bool) {
	log := NewTuiLogger(events, "Jobs")

	// Map proto Struct → Go map for inputs and config.
	var inputsMap map[string]any
	if in := job.GetInputs(); in != nil {
		inputsMap = in.AsMap()
	}
	var configMap map[string]any
	if c := job.GetConfig(); c != nil {
		configMap = c.AsMap()
	}

	spec := execution.JobSpec{
		Tool:   job.GetTool(),
		Image:  job.GetImage(),
		Inputs: inputsMap,
		Config: configMap,
		JobID:  job.Id,
	}

	execID, err := mgr.Submit(ctx, spec)
	if err != nil {
		log.ErrorE(fmt.Sprintf("[%s] Failed to submit connector job", job.Id), err)
		Emit(events, TuiEvent{
			Type:     EventJobCompleted,
			JobID:    job.Id,
			Success:  false,
			ErrorMsg: fmt.Sprintf("Submit failed: %v", err),
			Duration: time.Since(startTime),
		})
		return true, false // hadJob=true (job was pulled), caller releases semaphore
	}

	// Add to activeJobs for metrics tracking.
	activeJobsMu.Lock()
	activeJobs[job.Id] = struct{}{}
	activeJobsMu.Unlock()

	// Register bridge entry: links executionID → job for result routing.
	bridgeMu.Lock()
	bridge[execID] = &bridgeEntry{
		jobID:    job.Id,
		category: category,
		release:  releaseSem,
	}
	bridgeMu.Unlock()

	// Register proxy channel for streaming results from connector.
	resultCh := make(chan []byte, 16)
	proxy.Register(execID, resultCh)

	log.Info("[%s] Connector job submitted: execID=%s image=%s", job.Id, execID, job.GetImage())

	// Start completion handler goroutine — fire-and-forget.
	go handleConnectorResult(ctx, execID, grpcClient, events, proxy, resultCh, startTime)

	return true, true // hadJob, usedAsync — completion handler releases semaphore
}

// handleConnectorResult drains results from the connector proxy channel,
// submits them to the appropriate category endpoint, and performs cleanup
// when the channel closes (Done message or connector disconnect).
func handleConnectorResult(ctx context.Context, execID string, grpcClient *grpcclient.Client, events chan<- TuiEvent, proxy *connector.Proxy, resultCh <-chan []byte, startTime time.Time) {
	bridgeMu.Lock()
	entry, ok := bridge[execID]
	bridgeMu.Unlock()
	if !ok {
		return
	}
	defer entry.release()

	log := NewTuiLogger(events, "Jobs")

	// Drain results from connector until channel closes (Done or disconnect).
	for data := range resultCh {
		if err := submitCategoryResult(ctx, grpcClient, entry.jobID, entry.category, false, string(data)); err != nil {
			log.ErrorE(fmt.Sprintf("[%s] Failed to submit connector result", entry.jobID), err)
		}
	}

	// Channel closed: connector finished (Done) or disconnected.
	// Cleanup and release resources.
	activeJobsMu.Lock()
	delete(activeJobs, entry.jobID)
	activeJobsMu.Unlock()

	bridgeMu.Lock()
	delete(bridge, execID)
	bridgeMu.Unlock()

	proxy.Unregister(execID)

	// Check if connector reported an error via Done message.
	errMsg, hasError := proxy.PopError(execID)

	Emit(events, TuiEvent{
		Type:     EventJobCompleted,
		JobID:    entry.jobID,
		Success:  !hasError,
		ErrorMsg: errMsg,
		Duration: time.Since(startTime),
	})

	if hasError && errMsg != "" {
		_ = submitCategoryResult(ctx, grpcClient, entry.jobID, entry.category, true, errMsg)
		log.Warning("[%s] Connector job failed: execID=%s error=%s", entry.jobID, execID, errMsg)
	} else {
		log.Info("[%s] Connector job completed: execID=%s", entry.jobID, execID)
	}

}
