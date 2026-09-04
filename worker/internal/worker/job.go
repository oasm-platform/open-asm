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
	connectorpb "oasm-worker/internal/gen/connector"
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
	image    string // image the execution ran (backoff bookkeeping)
}

var (
	bridgeMu sync.Mutex
	bridge   = make(map[string]*bridgeEntry) // executionID → entry
)

// imageBackoff gates container starts per image. Failures (submit error,
// early exit, connect timeout) push the next allowed start out exponentially
// (min(30s*2^fails, 10m)); success resets the counter. In-memory only — a
// worker restart resets all counters (documented trade-off).
var imageBackoff = execution.NewImageBackoff()

// Timeout constants live in internal/execution/timeouts.go (single source of
// truth): ConnectorConnectTimeout bounds how long a connector job may stay up
// before its container connects back. If the connector never connects (bad
// image, wrong WORKER_GRPC_ADDR/WORKER_TOKEN), the execution is cancelled and
// the job is failed so Core can finalize it.
// ponytail: make this configurable when tuning is needed.
//
// ConnectorCleanupTimeout bounds best-effort post-execution container cleanup.
// The cleanup context MUST be detached from the session context: a worker
// reconnect cancelling the session would abort the docker Stop/Cleanup calls
// immediately and orphan the container.

// newDetachedCleanupContext returns a context rooted at context.Background
// with a bounded deadline for best-effort container cleanup. Never pass the
// session ctx here — see connectorCleanupTimeout.
func newDetachedCleanupContext() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), execution.ConnectorCleanupTimeout)
}

// healthPollInterval is how often the connector-job drain polls container
// health. A var (not const) so tests can shrink it.
var healthPollInterval = 5 * time.Second

// Container log tail budget attached to failure payloads sent to Core.
const (
	tailMaxLines = 100
	tailMaxBytes = 32 * 1024
)

// tailBuffer is a bounded ring buffer of container log lines. append drops the
// oldest lines once the budget (100 lines / 32KB) is exceeded.
type tailBuffer struct {
	lines []string
	bytes int
}

func (t *tailBuffer) append(line string) {
	if line == "" {
		return
	}
	if len(line) > tailMaxBytes {
		line = line[:tailMaxBytes]
	}
	t.lines = append(t.lines, line)
	t.bytes += len(line)
	for (t.bytes > tailMaxBytes || len(t.lines) > tailMaxLines) && len(t.lines) > 1 {
		t.bytes -= len(t.lines[0])
		t.lines = t.lines[1:]
	}
}

func (t *tailBuffer) String() string {
	if len(t.lines) == 0 {
		return ""
	}
	return strings.Join(t.lines, "\n")
}

// splitLogChunk splits a log chunk into non-empty lines, trimming \r.
func splitLogChunk(chunk []byte) []string {
	var out []string
	for _, line := range strings.Split(string(chunk), "\n") {
		line = strings.TrimSuffix(line, "\r")
		if line == "" {
			continue
		}
		out = append(out, line)
	}
	return out
}

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

// findingToVulnerability maps one connector Finding onto the jobs_registry
// Vulnerability model consumed by Core. Fields with no counterpart in
// Vulnerability (matched_at, timestamp) are intentionally dropped. A nil
// finding yields nil (skipped by the caller).
func findingToVulnerability(f *connectorpb.Finding) *pb.Vulnerability {
	if f == nil {
		return nil
	}
	return &pb.Vulnerability{
		Name:       f.GetName(),
		Severity:   severityFromString(f.GetSeverity()),
		Tags:       f.GetTags(),
		References: f.GetReferences(),
		CveId:      f.GetCveId(),
		CweId:      f.GetCweId(),
		CvssScore:  float32(f.GetCvssScore()),
		CvssMetric: f.GetCvssMetrics(),
		EpssScore:  float32(f.GetEpssScore()),
		Solution:   f.GetSolution(),
		Host:       f.GetHost(),
		IpAddress:  f.GetIp(),
	}
}

// severityFromString maps the connector's lowercase severity string onto the
// jobs_registry.Severity enum. Unknown values keep the zero value (Core's
// default) — the connector's closed set is info/low/medium/high/critical, and
// the worker must never invent enum values for severities it does not know.
func severityFromString(s string) pb.Severity {
	switch strings.ToLower(s) {
	case "info":
		return pb.Severity_INFO
	case "low":
		return pb.Severity_LOW
	case "medium":
		return pb.Severity_MEDIUM
	case "high":
		return pb.Severity_HIGH
	case "critical":
		return pb.Severity_CRITICAL
	default:
		return pb.Severity_INFO
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

	// Per-image backoff gate: while the image is backing off, fail fast
	// WITHOUT creating a container (no exec-N waste, no pending ExecuteJob).
	if ok, retryIn := imageBackoff.Allow(spec.Image); !ok {
		failMsg := fmt.Sprintf("image backing off, retry in %s (image=%s)", retryIn.Round(time.Second), spec.Image)
		log.Warning("[%s] %s", job.Id, failMsg)
		Emit(events, TuiEvent{
			Type:     EventJobCompleted,
			JobID:    job.Id,
			Success:  false,
			ErrorMsg: failMsg,
			Duration: time.Since(startTime),
		})
		submitCategoryError(ctx, grpcClient, events, job.Id, category, failMsg)
		return true, false // hadJob=true (job was pulled), caller releases semaphore
	}

	execID, err := mgr.Submit(ctx, spec)
	if err != nil {
		imageBackoff.RecordFailure(spec.Image)
		log.ErrorE(fmt.Sprintf("[%s] Failed to submit connector job", job.Id), err)
		Emit(events, TuiEvent{
			Type:     EventJobCompleted,
			JobID:    job.Id,
			Success:  false,
			ErrorMsg: fmt.Sprintf("Submit failed: %v", err),
			Duration: time.Since(startTime),
		})
		// Report the failure to Core so the job is finalized instead of stuck IN_PROGRESS.
		submitCategoryError(ctx, grpcClient, events, job.Id, category, fmt.Sprintf("Submit failed: %v", err))
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
		image:    spec.Image,
	}
	bridgeMu.Unlock()

	// Register proxy channel for streaming results from connector.
	resultCh := make(chan connector.ResultMsg, 16)
	proxy.Register(execID, resultCh)

	// Queue the ExecuteJob for the connector container. If the connector has
	// not registered its stream yet (container boot race), the proxy holds it
	// as pending and flushes it on connect. Send errors are logged only — the
	// pending/timeout machinery covers late or broken connects.
	inputs := make(map[string]string, len(spec.Inputs))
	for k, v := range spec.Inputs {
		inputs[k] = fmt.Sprintf("%v", v)
	}
	if err := proxy.SendExecute(execID, &connectorpb.ExecuteJob{
		ExecutionId: execID,
		JobId:       spec.JobID,
		Tool:        spec.Tool,
		Image:       spec.Image,
		TraceId:     spec.TraceID,
		Inputs:      inputs,
	}); err != nil {
		log.ErrorE(fmt.Sprintf("[%s] Failed to send ExecuteJob for exec %s", job.Id, execID), err)
	}

	log.Info("[%s] Connector job submitted: execID=%s image=%s", job.Id, execID, job.GetImage())

	// Start completion handler goroutine — fire-and-forget. It owns the health
	// monitor (Inspect poll), the log tailer (Logs stream), result draining,
	// container cleanup and Core finalization.
	tail := &tailBuffer{}
	go handleConnectorResult(ctx, execID, grpcClient, events, proxy, resultCh, startTime, execution.ConnectorConnectTimeout, mgr, tail)

	return true, true // hadJob, usedAsync — completion handler releases semaphore
}

// handleConnectorResult drains results from the connector proxy channel,
// submits them to the appropriate category endpoint, and performs cleanup
// when the channel closes (Done message or connector disconnect). If the
// connector never connects within connectTimeout, the execution is cancelled
// (best-effort) and the job is failed so Core can finalize it.
//
// Health monitor + log tailer live INSIDE the drain loop (ticker and Logs
// select cases, not separate goroutines): Done/timeout/crash all break the
// same drain, so there is no monitor/tailer lifecycle to coordinate and no
// orphan goroutine after the job ends.
func handleConnectorResult(ctx context.Context, execID string, grpcClient *grpcclient.Client, events chan<- TuiEvent, proxy *connector.Proxy, resultCh <-chan connector.ResultMsg, startTime time.Time, connectTimeout time.Duration, mgr *execution.Manager, tail *tailBuffer) {
	bridgeMu.Lock()
	entry, ok := bridge[execID]
	bridgeMu.Unlock()
	if !ok {
		return
	}
	defer entry.release()

	log := NewTuiLogger(events, "Jobs")

	// Open the container log stream; the logsCtx is cancelled when the drain
	// exits so the docker read goroutine stops promptly. A nil channel
	// disables the logs select case.
	var logsCh <-chan []byte
	if mgr != nil {
		logsCtx, logsCancel := context.WithCancel(ctx)
		defer logsCancel()
		ch, err := mgr.Logs(logsCtx, execID)
		if err != nil {
			log.ErrorE(fmt.Sprintf("[%s] Failed to open container logs for %s", entry.jobID, execID), err)
		} else {
			logsCh = ch
		}
	}

	// Health poll: nil channel disables the case when no manager (unit tests).
	var healthC <-chan time.Time
	if mgr != nil {
		h := time.NewTicker(healthPollInterval)
		defer h.Stop()
		healthC = h.C
	}

	// Connect timeout: applies ONLY while the connector has not connected. The
	// registration signal disables it — a long legitimate scan that connected
	// fine must never be failed mid-run because it outlived the timeout.
	regCh := proxy.WaitRegistered(execID)
	timer := time.NewTimer(connectTimeout)
	defer timer.Stop()
	// timerC is nil once the connector registers; a nil channel disables the
	// timeout case for the rest of the drain.
	var timerC <-chan time.Time = timer.C
	submittedAny := false

	// Accumulated structured findings for the vulnerabilities category: chunks
	// are aggregated and submitted ONCE at drain end (see finalization below).
	// Other categories keep the per-chunk raw submission path.
	var vulns []*pb.Vulnerability

	// Drain results from connector until channel closes (Done or disconnect)
	// or the connector fails to connect within connectTimeout.
drain:
	for {
		select {
		case msg, ok := <-resultCh:
			if !ok {
				break drain
			}
			submittedAny = true
			if entry.category == "vulnerabilities" {
				for _, f := range msg.Findings {
					if v := findingToVulnerability(f); v != nil {
						vulns = append(vulns, v)
					}
				}
				// Per-chunk log kept (bytes + findings count) even though the
				// submission itself is deferred to the single drain-end call.
				log.Info("[%s] connector result chunk: exec=%s bytes=%d findings=%d", entry.jobID, execID, len(msg.Data), len(msg.Findings))
			} else if err := submitCategoryResult(ctx, grpcClient, entry.jobID, entry.category, false, string(msg.Data)); err != nil {
				log.ErrorE(fmt.Sprintf("[%s] Failed to submit connector result", entry.jobID), err)
			} else {
				log.Info("[%s] connector result submitted: exec=%s bytes=%d", entry.jobID, execID, len(msg.Data))
			}
		case chunk, ok := <-logsCh:
			if !ok {
				logsCh = nil
				continue
			}
			if tail != nil {
				// Log line budget: also keep the raw line in the per-exec tail.
				for _, line := range splitLogChunk(chunk) {
					tail.append(line)
					log.Info("[%s] container: %s", entry.jobID, line)
				}
			}
		case <-healthC:
			// Health monitor: a container that crashed (exit != 0), turned
			// unhealthy, or exited before the connector delivered Done is a
			// startup failure — cancel the container on a detached context,
			// fail the job with the log tail attached, and drop the pending
			// ExecuteJob. Exit-0 after Done is not a failure (connector
			// finished; the drain will break on channel close).
			if mgr == nil {
				continue
			}
			res, err := mgr.Inspect(ctx, execID)
			if err != nil {
				continue // transient inspect error — try next tick
			}
			var reason string
			switch {
			case res.Health == "unhealthy":
				reason = fmt.Sprintf("container unhealthy (health=%s)", res.Health)
			case !res.Running && res.ExitCode != 0:
				reason = fmt.Sprintf("container exited early with code %d", res.ExitCode)
			case !res.Running && res.ExitCode == 0 && !proxy.HasDone(execID):
				reason = "container exited before connector completed"
			default:
				continue
			}
			if tail != nil && tail.String() != "" {
				reason += "\n--- container logs (last " + fmt.Sprintf("%d lines) ---", tailMaxLines) + "\n" + tail.String()
			}
			log.Warning("[%s] connector startup failure: %s exec=%s", entry.jobID, reason, execID)
			proxy.SetError(execID, reason)
			cleanupCtx, cancel := newDetachedCleanupContext()
			if err := mgr.Cancel(cleanupCtx, execID); err != nil {
				log.ErrorE(fmt.Sprintf("[%s] Failed to cancel connector execution %s", entry.jobID, execID), err)
			}
			cancel()
			proxy.OnConnectorDown(execID)
			break drain
		case <-regCh:
			// Connector connected: the connect timeout no longer applies. The
			// stopped timer's channel (nil) disables this case permanently.
			timer.Stop()
			timerC = nil
		case <-timerC:
			// Connector never connected: cancel the container (best-effort,
			// still terminal on failure) and fail the job. OnConnectorDown
			// deletes the result channel before closing it, which breaks the
			// drain. Cleanup runs on a detached context: the session ctx may
			// already be cancelled (worker reconnect) and would abort
			// Stop/Cleanup, orphaning the container.
			timeoutMsg := fmt.Sprintf("connector did not connect within %s (check image, WORKER_GRPC_ADDR, WORKER_TOKEN)", connectTimeout)
			if tail != nil && tail.String() != "" {
				timeoutMsg += "\n--- container logs (last " + fmt.Sprintf("%d lines) ---", tailMaxLines) + "\n" + tail.String()
			}
			if mgr != nil {
				cleanupCtx, cancel := newDetachedCleanupContext()
				if err := mgr.Cancel(cleanupCtx, execID); err != nil {
					log.ErrorE(fmt.Sprintf("[%s] Failed to cancel connector execution %s", entry.jobID, execID), err)
				}
				cancel()
			}
			proxy.SetError(execID, timeoutMsg)
			proxy.OnConnectorDown(execID)
			break drain
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

	// Best-effort container cleanup on a detached context (see
	// newDetachedCleanupContext): the connector already finished or dropped,
	// so the container (exited, or force-removed if still up) must be removed
	// even when the session ctx was cancelled by a reconnect. The bridge /
	// activeJobs / proxy cleanup above and the finalization below must not
	// depend on this succeeding.
	if mgr != nil {
		cleanupCtx, cancel := newDetachedCleanupContext()
		// Release cleans up the 1:1 container (1 stream = 1 execution; the
		// container is never shared, so a blind remove is safe here).
		if err := mgr.Release(cleanupCtx, execID); err != nil {
			log.ErrorE(fmt.Sprintf("[%s] Failed to clean up connector execution %s", entry.jobID, execID), err)
		}
		cancel()
	}
	// Drop any ExecuteJob still queued for this execution (connector never
	// registered before finishing/dropping). Idempotent when the server-side
	// OnConnectorDown already ran.
	proxy.OnConnectorDown(execID)

	// Check if connector reported an error via Done message.
	errMsg, hasError := proxy.PopError(execID)
	hadDone := proxy.PopDone(execID)

	// Terminal lifecycle line: execution identity + outcome + duration.
	errDetail := errMsg
	if errDetail == "" {
		errDetail = "-"
	}
	finishedMsg := fmt.Sprintf("[%s] connector job finished: exec=%s success=%t error=%s duration=%s",
		entry.jobID, execID, !hasError, errDetail, time.Since(startTime))
	if hasError {
		log.Warning("%s", finishedMsg)
	} else {
		log.Success("%s", finishedMsg)
	}

	Emit(events, TuiEvent{
		Type:     EventJobCompleted,
		JobID:    entry.jobID,
		Success:  !hasError,
		ErrorMsg: errMsg,
		Duration: time.Since(startTime),
	})

	switch {
	case hasError && errMsg != "":
		_ = submitCategoryResult(ctx, grpcClient, entry.jobID, entry.category, true, errMsg)
		log.Warning("[%s] Connector job failed: execID=%s error=%s", entry.jobID, execID, errMsg)
	case !hadDone:
		_ = submitCategoryResult(ctx, grpcClient, entry.jobID, entry.category, true, "connector disconnected before Done")
		log.Warning("[%s] Connector disconnected without Done: execID=%s", entry.jobID, execID)
	case entry.category == "vulnerabilities":
		// Clean Done: submit the aggregated findings exactly once (raw is ""
		// per contract — findings travel in the structured payload).
		if err := grpcClient.SubmitVulnerabilitiesResult(ctx, entry.jobID, false, "", vulns); err != nil {
			log.ErrorE(fmt.Sprintf("[%s] Failed to submit connector vulnerabilities", entry.jobID), err)
		} else {
			log.Info("[%s] connector vulnerabilities result submitted: exec=%s findings=%d", entry.jobID, execID, len(vulns))
		}
	case !submittedAny:
		_ = submitCategoryResult(ctx, grpcClient, entry.jobID, entry.category, false, "")
		log.Info("[%s] Connector job completed with no results: execID=%s", entry.jobID, execID)
	default:
		log.Info("[%s] Connector job completed: execID=%s", entry.jobID, execID)
	}

	// Per-image backoff bookkeeping: any failed outcome (crash, timeout,
	// disconnect, connector error) backs the image off; a clean Done with
	// success resets it. Fail-fast jobs never reach this point (no exec).
	if entry.image != "" {
		if hasError || !hadDone {
			imageBackoff.RecordFailure(entry.image)
		} else {
			imageBackoff.RecordSuccess(entry.image)
		}
	}
}
