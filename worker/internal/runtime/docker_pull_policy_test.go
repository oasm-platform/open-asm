package runtime

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/docker/docker/client"
)

// --- pull policy ---

// imageIsCached must call for a pull only when the image is absent or the
// engine cannot confirm a local copy — never skip a needed fetch on an
// inspect error.
func TestImageIsCached(t *testing.T) {
	if !imageIsCached(nil) {
		t.Fatal("imageIsCached(nil) = false, want true (nil inspect error = image present locally)")
	}
	if imageIsCached(errors.New("Error response from daemon: No such image: ghcr.io/open-asm/nuclei:1.0")) {
		t.Fatal("imageIsCached(missing image error) = true, want false (404 must pull)")
	}
	if imageIsCached(errors.New("Cannot connect to the Docker daemon")) {
		t.Fatal("imageIsCached(transient error) = true, want false (uncertain must pull, pull surfaces the real failure)")
	}
}

// A create against an engine that already has the image must not call
// ImagePull at all and must log the cached skip, distinct from image pull done.
func TestCreateSkipsPullWhenImageCached(t *testing.T) {
	var (
		mu      sync.Mutex
		pulls   int
		creates int
	)
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/v1.44")
		switch {
		case r.Method == http.MethodGet && strings.HasPrefix(path, "/images/") && strings.HasSuffix(path, "/json"):
			// ImageInspectWithRaw: image is already present locally.
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprint(w, `{"Id":"sha256:abc123"}`)
		case r.Method == http.MethodPost && path == "/containers/create":
			mu.Lock()
			creates++
			mu.Unlock()
			w.WriteHeader(http.StatusCreated)
			fmt.Fprintf(w, `{"Id":"c1"}`)
		case r.Method == http.MethodPost && strings.HasSuffix(path, "/start"):
			w.WriteHeader(http.StatusNoContent)
		default:
			http.NotFound(w, r)
		}
	}))
	defer ts.Close()

	cli, err := client.NewClientWithOpts(client.WithHost(ts.URL), client.WithVersion("1.44"))
	if err != nil {
		t.Fatalf("docker client: %v", err)
	}
	r := NewDockerRuntimeWithClient(cli, "172.18.0.3:50051", "tok")
	log := &captureLogger{}
	r.SetLogger(log)

	if _, err := r.Create(context.Background(), JobSpec{
		Tool:  "nuclei",
		Image: "ghcr.io/open-asm/nuclei:1.0",
		JobID: "job-1",
	}, RuntimeOpts{}); err != nil {
		t.Fatalf("Create: %v", err)
	}

	mu.Lock()
	defer mu.Unlock()
	if pulls != 0 {
		t.Fatalf("cached image must skip ImagePull, got %d pull calls", pulls)
	}
	if creates != 1 {
		t.Fatalf("expected 1 container create, got %d", creates)
	}
	if _, ok := log.find("docker: image pull skipped (cached)"); !ok {
		t.Fatalf("expected 'image pull skipped (cached)' log, got %v", log.all())
	}
	if _, ok := log.find("docker: image pull done"); ok {
		t.Fatalf("cached image must not log 'image pull done', got %v", log.all())
	}
}

// --- cache env vars ---

func TestBuildContainerEnvCacheDirs(t *testing.T) {
	env := buildContainerEnv(JobSpec{JobID: "j-1", Tool: "nuclei", TraceID: "t-1"}, "host:50051", "tok", "e-1")
	for _, want := range []string{
		"HOME=/tmp",
		"XDG_CACHE_HOME=/tmp/.cache",
	} {
		found := false
		for _, e := range env {
			if e == want {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("container env missing %s, got %v", want, env)
		}
	}
}

// --- pull-policy digest comparison ---

func TestPullPolicy_PullsWhenDigestChanged(t *testing.T) {
	// Same digest → no pull needed.
	if shouldPull("sha256:aaa", "sha256:aaa") {
		t.Fatal("shouldPull returned true for matching digests")
	}
	// Different digest → pull needed.
	if !shouldPull("sha256:aaa", "sha256:bbb") {
		t.Fatal("shouldPull returned false for different digests")
	}
	// Empty registry digest (unreachable) → keep cached, no pull.
	if shouldPull("sha256:aaa", "") {
		t.Fatal("shouldPull returned true for empty registry digest")
	}
}

// --- per-image persistence ---

func TestVolumeNameForImage(t *testing.T) {
	a := volumeNameForImage("ghcr.io/test/scanner:1.0")
	b := volumeNameForImage("ghcr.io/test/scanner:1.0")
	if a != b {
		t.Fatalf("same image must produce same volume name: %q != %q", a, b)
	}
	if !strings.HasPrefix(a, "oasm-") {
		t.Fatalf("volume name must start with oasm-, got %q", a)
	}
	c := volumeNameForImage("ghcr.io/test/other:2.0")
	if a == c {
		t.Fatalf("different images must produce different volume names")
	}
}

func TestPersistPathsFromLabels(t *testing.T) {
	// Missing label → nil.
	if paths := persistPathsFromLabels(nil); paths != nil {
		t.Fatalf("nil labels → nil, got %v", paths)
	}
	// Empty label → nil.
	if paths := persistPathsFromLabels(map[string]string{"oasm.persist": " "}); paths != nil {
		t.Fatalf("blank label → nil, got %v", paths)
	}
	// Parse comma-separated absolute paths.
	paths := persistPathsFromLabels(map[string]string{"oasm.persist": "/data, /cache"})
	if len(paths) != 2 || paths[0] != "/data" || paths[1] != "/cache" {
		t.Fatalf("unexpected paths: %v", paths)
	}
	// Relative paths and blanks are ignored.
	paths = persistPathsFromLabels(map[string]string{"oasm.persist": "/ok, bad, , /also-ok"})
	if len(paths) != 2 || paths[0] != "/ok" || paths[1] != "/also-ok" {
		t.Fatalf("unexpected filtered paths: %v", paths)
	}
}

func TestCreateMountsLabelDrivenVolume(t *testing.T) {
	engine := newFakeDockerEngine()
	engine.imageLabels = map[string]string{"oasm.persist": "/data"}
	log := &captureLogger{}
	r := newFakeDockerRuntime(t, engine, log)

	if _, err := r.Create(context.Background(), JobSpec{
		Tool:  "scanner",
		Image: "ghcr.io/test/connector-foo:1.0",
		JobID: "job-1",
	}, RuntimeOpts{}); err != nil {
		t.Fatalf("Create: %v", err)
	}

	wantVol := volumeNameForImage("ghcr.io/test/connector-foo:1.0") + ":/data"
	if !strings.Contains(engine.createBody, wantVol) {
		t.Fatalf("create body must mount label-driven volume, got: %s", engine.createBody)
	}
	if !strings.Contains(engine.createBody, `"/tmp"`) {
		t.Fatalf("create body must include /tmp Tmpfs, got: %s", engine.createBody)
	}
}

func TestCreateNoBindsWithoutPersistLabel(t *testing.T) {
	engine := newFakeDockerEngine() // no imageLabels → no oasm.persist
	log := &captureLogger{}
	r := newFakeDockerRuntime(t, engine, log)

	if _, err := r.Create(context.Background(), JobSpec{
		Tool:  "scanner",
		Image: "ghcr.io/test/plain:1.0",
		JobID: "job-1",
	}, RuntimeOpts{}); err != nil {
		t.Fatalf("Create: %v", err)
	}

	// No oasm.persist label → Binds must be empty.
	var req struct {
		HostConfig struct {
			Binds []string `json:"Binds"`
		} `json:"HostConfig"`
	}
	if err := json.Unmarshal([]byte(engine.createBody), &req); err != nil {
		t.Fatalf("parse create body: %v", err)
	}
	if len(req.HostConfig.Binds) > 0 {
		t.Fatalf("expected no binds without persist label, got %v", req.HostConfig.Binds)
	}
}

// --- periodic partial-line flush ---

// A partial line (no trailing \n) must be delivered by the 500ms flush
// ticker while the stream stays open — without it the line only surfaces at
// stream end, hence the observed multi-second log delay.
func TestLogsFlushesPartialLinePeriodically(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/v1.44")
		if r.Method != http.MethodGet || !strings.HasSuffix(path, "/logs") {
			http.NotFound(w, r)
			return
		}
		payload := "nuclei: 01:12:57 scanning target"
		hdr := make([]byte, 8)
		hdr[0] = 1 // stdout
		binary.BigEndian.PutUint32(hdr[4:], uint32(len(payload)))
		w.Header().Set("Content-Type", "application/vnd.docker.raw-stream")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(hdr)
		_, _ = w.Write([]byte(payload))
		if fl, ok := w.(http.Flusher); ok {
			fl.Flush()
		}
		// Follow:true — hold the stream open until the client goes away.
		<-r.Context().Done()
	}))
	defer ts.Close()

	cli, err := client.NewClientWithOpts(client.WithHost(ts.URL), client.WithVersion("1.44"))
	if err != nil {
		t.Fatalf("docker client: %v", err)
	}
	r := NewDockerRuntimeWithClient(cli, "172.18.0.3:50051", "tok")

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch, err := r.Logs(ctx, Handle{ID: "c1"})
	if err != nil {
		t.Fatalf("Logs: %v", err)
	}

	select {
	case line, ok := <-ch:
		if !ok {
			t.Fatal("logs channel closed before the partial line was flushed")
		}
		if string(line) != "nuclei: 01:12:57 scanning target" {
			t.Fatalf("unexpected partial line %q", string(line))
		}
	case <-time.After(3 * time.Second):
		t.Fatal("partial line not flushed within 3s (ticker not delivering)")
	}

	cancel()
	select {
	case _, ok := <-ch:
		if ok {
			t.Fatal("expected channel closed after ctx cancel")
		}
	case <-time.After(3 * time.Second):
		t.Fatal("logs channel did not close after ctx cancel")
	}
}
