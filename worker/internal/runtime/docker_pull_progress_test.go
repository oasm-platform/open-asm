package runtime

import (
	"context"
	"strings"
	"testing"
	"time"
)

// newPullFrame builds one Docker pull-stream JSON frame.
func newPullFrame(id, status string, current, total int64) string {
	detail := ""
	if total > 0 {
		detail = `,"progressDetail":{"current":` + itoa(current) + `,"total":` + itoa(total) + `}`
	}
	return `{"status":"` + status + `","id":"` + id + `"` + detail + `}` + "\n"
}

func itoa(v int64) string {
	if v == 0 {
		return "0"
	}
	var b [20]byte
	i := len(b)
	for v > 0 {
		i--
		b[i] = byte('0' + v%10)
		v /= 10
	}
	return string(b[i:])
}

// recordingProgress captures pull progress ticks for assertions.
type recordingProgress struct {
	ticks []struct {
		jobID  string
		image  string
		pulled float64
		done   bool
	}
}

func (r *recordingProgress) ImagePullProgress(jobID, image string, pulled float64, done bool) {
	r.ticks = append(r.ticks, struct {
		jobID  string
		image  string
		pulled float64
		done   bool
	}{jobID, image, pulled, done})
}

func (r *recordingProgress) Info(string, ...any)    {}
func (r *recordingProgress) Warning(string, ...any) {}

func (r *recordingProgress) last() (pulled float64, done bool) {
	if len(r.ticks) == 0 {
		return 0, false
	}
	t := r.ticks[len(r.ticks)-1]
	return t.pulled, t.done
}

// TestPullAccumulatorTracksParallelLayersMonotonically: layers download in
// parallel and each frame carries only its own bytes, so naive summing
// double-counts. The accumulator must keep one high-water mark per layer and
// never report a fraction that goes backwards.
func TestPullAccumulatorTracksParallelLayersMonotonically(t *testing.T) {
	acc := newPullAccumulator()

	if _, ok := acc.fraction(); ok {
		t.Fatal("fraction must be indeterminate before any byte progress")
	}

	// Two layers, interleaved, each arriving out of order (a stale frame from
	// layer a reports fewer bytes than already seen).
	frames := []pullFrame{
		frame("a", 25, 100),
		frame("b", 50, 100),
		frame("a", 10, 100), // stale: must not move the high-water mark back
		frame("b", 75, 100),
		frame("a", 100, 100),
	}

	var prev float64
	for i, f := range frames {
		acc.add(f)
		got, ok := acc.fraction()
		if !ok {
			t.Fatalf("frame %d: fraction not reported", i)
		}
		if got < prev {
			t.Fatalf("frame %d: fraction went backwards: %.2f -> %.2f", i, prev, got)
		}
		prev = got
	}

	// 100 + 75 bytes of 200 total.
	if prev != 0.875 {
		t.Fatalf("final fraction = %.3f, want 0.875", prev)
	}
}

// TestPullAccumulatorIgnoresCachedLayers: every layer of an already-present
// image reports "Download complete" with no progressDetail, which must not be
// mistaken for a download in progress.
func TestPullAccumulatorIgnoresCachedLayers(t *testing.T) {
	acc := newPullAccumulator()
	acc.add(pullFrame{ID: "a", Status: "Download complete"})
	acc.add(pullFrame{ID: "b", Status: "Already exists"})

	if acc.started {
		t.Fatal("cached layers must not start progress reporting")
	}
	if _, ok := acc.fraction(); ok {
		t.Fatal("cached pull must stay indeterminate")
	}
}

func frame(id string, current, total int64) pullFrame {
	var f pullFrame
	f.ID = id
	f.ProgressDetail.Current = current
	f.ProgressDetail.Total = total
	return f
}

// TestConsumePullReportsThrottledProgressAndCompletion: a live stream yields
// ticks that end with exactly one done tick at the final fraction.
func TestConsumePullReportsThrottledProgressAndCompletion(t *testing.T) {
	rec := &recordingProgress{}
	r := &DockerRuntime{pullProgress: rec.ImagePullProgress}

	var stream strings.Builder
	stream.WriteString(newPullFrame("a", "Downloading", 50, 100))
	stream.WriteString(newPullFrame("b", "Downloading", 50, 100))
	stream.WriteString(newPullFrame("a", "Downloading", 100, 100))
	stream.WriteString(newPullFrame("a", "Download complete", 0, 0))
	stream.WriteString(`{"status":"Pulling fs layer"}` + "\n")

	err := r.consumePull(context.Background(), strings.NewReader(stream.String()), JobSpec{
		JobID: "job-1",
		Image: "ghcr.io/oasm-platform/connector-nmap:7.97",
	})
	if err != nil {
		t.Fatalf("consumePull: %v", err)
	}

	if len(rec.ticks) == 0 {
		t.Fatal("no progress ticks reported")
	}
	if done := rec.ticks[len(rec.ticks)-1].done; !done {
		t.Fatal("last tick must be the terminal (done) tick")
	}
	// The first tick is emitted on the first byte-progress frame; the second
	// frame (b) arrives within the throttle step, so the count stays small.
	if len(rec.ticks) > 3 {
		t.Fatalf("expected throttled reporting, got %d ticks: %+v", len(rec.ticks), rec.ticks)
	}
	for _, tk := range rec.ticks {
		if tk.jobID != "job-1" || tk.image != "ghcr.io/oasm-platform/connector-nmap:7.97" {
			t.Fatalf("tick identity = %+v", tk)
		}
	}
	pulled, _ := rec.last()
	// 100 of 200 bytes downloaded (layer a complete, b at 50).
	if pulled != 0.75 {
		t.Fatalf("final pulled = %.3f, want 0.75", pulled)
	}
}

// TestConsumePullReportsFrameError: a frame-level error is surfaced to the
// caller and to the log, while progress reporting still terminates cleanly.
func TestConsumePullReportsFrameError(t *testing.T) {
	rec := &recordingProgress{}
	log := &captureLogger{}
	r := &DockerRuntime{pullProgress: rec.ImagePullProgress, logger: log}

	stream := newPullFrame("a", "Downloading", 10, 100) +
		`{"error":"manifest unknown"}` + "\n"

	err := r.consumePull(context.Background(), strings.NewReader(stream), JobSpec{
		JobID: "job-2",
		Image: "ghcr.io/oasm-platform/connector-missing:1",
	})
	if err == nil || !strings.Contains(err.Error(), "manifest unknown") {
		t.Fatalf("err = %v, want manifest unknown", err)
	}
	if _, done := rec.last(); !done {
		t.Fatal("progress must be terminated with a done tick even on a failed pull")
	}
	if _, ok := log.find("image pull reported an error"); !ok {
		t.Fatalf("pull error not logged: %v", log.all())
	}
}

// TestConsumePullWithoutProgressLogger: a plain Logger (no ProgressLogger
// extension) must leave the pull path working and silent.
func TestConsumePullWithoutProgressLogger(t *testing.T) {
	log := &captureLogger{}
	r := &DockerRuntime{logger: log}

	err := r.consumePull(context.Background(), strings.NewReader(newPullFrame("a", "Downloading", 1, 2)), JobSpec{
		JobID: "job-3",
		Image: "img:1",
	})
	if err != nil {
		t.Fatalf("consumePull: %v", err)
	}
	if len(log.all()) != 0 {
		t.Fatalf("unexpected log lines: %v", log.all())
	}
}

// TestSetLoggerWiresProgressOnlyForCapableLoggers: SetLogger must detect the
// optional ProgressLogger extension instead of requiring every logger to
// implement it.
func TestSetLoggerWiresProgressOnlyForCapableLoggers(t *testing.T) {
	plain := &captureLogger{}
	r := &DockerRuntime{}
	r.SetLogger(plain)
	if r.pullProgress != nil {
		t.Fatal("plain logger must not be wired for progress reporting")
	}

	capable := &recordingProgress{}
	r.SetLogger(capable)
	if r.pullProgress == nil {
		t.Fatal("ProgressLogger must be wired for progress reporting")
	}
}

// TestConsumePullStopsOnCancelledContext guards the pull from outliving the
// job context (worker shutdown / job cancel): the loop must drain nothing
// further even if bytes remain in the stream.
func TestConsumePullStopsOnCancelledContext(t *testing.T) {
	rec := &recordingProgress{}
	r := &DockerRuntime{pullProgress: rec.ImagePullProgress}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	var stream strings.Builder
	for i := 0; i < 1000; i++ {
		stream.WriteString(newPullFrame("a", "Downloading", int64(i*10+10), 100000))
	}

	start := time.Now()
	if err := r.consumePull(ctx, strings.NewReader(stream.String()), JobSpec{JobID: "j", Image: "i"}); err != nil {
		t.Fatalf("consumePull: %v", err)
	}
	if elapsed := time.Since(start); elapsed > time.Second {
		t.Fatalf("cancelled pull took %s", elapsed)
	}
}
