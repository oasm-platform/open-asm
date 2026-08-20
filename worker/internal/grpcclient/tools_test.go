package grpcclient

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync/atomic"
	"testing"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	workers "oasm-worker/internal/gen/workers"
)

// newToolClient returns a test server whose client points at a fresh tool dir.
func newToolClient(t *testing.T) (*testServer, string) {
	t.Helper()
	srv := newTestServer(t)
	toolDir := filepath.Join(t.TempDir(), "tools")
	srv.client.toolPath = toolDir
	return srv, toolDir
}

// streamBytes returns a storageFn that streams data in fixed-size chunks.
func streamBytes(data []byte) func(req *workers.StorageRequest, stream workers.WorkersService_StorageServer) error {
	return func(req *workers.StorageRequest, stream workers.WorkersService_StorageServer) error {
		const chunkSize = 128
		for off := 0; off < len(data); off += chunkSize {
			end := off + chunkSize
			if end > len(data) {
				end = len(data)
			}
			resp := &workers.StorageResponse{Chunk: data[off:end], Offset: int32(off)}
			if end == len(data) {
				resp.Eof = true
			}
			if err := stream.Send(resp); err != nil {
				return err
			}
		}
		return nil
	}
}

// makeZip builds an in-memory zip archive with the given files (mode 0o755).
func makeZip(t *testing.T, files map[string]string) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for name, content := range files {
		hdr := &zip.FileHeader{Name: name}
		hdr.SetMode(0o755)
		w, err := zw.CreateHeader(hdr)
		if err != nil {
			t.Fatalf("create zip header %s: %v", name, err)
		}
		if _, err := w.Write([]byte(content)); err != nil {
			t.Fatalf("write zip entry %s: %v", name, err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("close zip: %v", err)
	}
	return buf.Bytes()
}

// makeTarGz builds an in-memory tar.gz archive with the given files (mode 0o755).
func makeTarGz(t *testing.T, files map[string]string) []byte {
	t.Helper()
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	for name, content := range files {
		hdr := &tar.Header{Name: name, Typeflag: tar.TypeReg, Mode: 0o755, Size: int64(len(content))}
		if err := tw.WriteHeader(hdr); err != nil {
			t.Fatalf("write tar header %s: %v", name, err)
		}
		if _, err := tw.Write([]byte(content)); err != nil {
			t.Fatalf("write tar entry %s: %v", name, err)
		}
	}
	if err := tw.Close(); err != nil {
		t.Fatalf("close tar: %v", err)
	}
	if err := gz.Close(); err != nil {
		t.Fatalf("close gzip: %v", err)
	}
	return buf.Bytes()
}

// writeState writes a .tool_versions.json state file into the tool dir.
func writeState(t *testing.T, toolDir string, state map[string][]string) {
	t.Helper()
	if err := os.MkdirAll(toolDir, 0o755); err != nil {
		t.Fatalf("create tool dir: %v", err)
	}
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		t.Fatalf("marshal state: %v", err)
	}
	if err := os.WriteFile(filepath.Join(toolDir, ".tool_versions.json"), data, 0o644); err != nil {
		t.Fatalf("write state: %v", err)
	}
}

func stateForBase(state map[string][]string, base string) ([]string, bool) {
	for k, v := range state {
		if k == base || strings.HasSuffix(k, "_"+base) {
			return v, true
		}
	}
	return nil, false
}

// emptyManifest returns a GetManifest hook that yields no init commands.
func emptyManifest(ctx context.Context, req *workers.GetManifestRequest) (*workers.GetManifestResponse, error) {
	return &workers.GetManifestResponse{}, nil
}

func TestDownloadTools_CacheHitSkipsStorage(t *testing.T) {
	// Given: a cached state with an extracted file, and a registry listing the same tool
	srv, toolDir := newToolClient(t)
	extracted := filepath.Join("nuclei", "bin", "nuclei")
	writeState(t, toolDir, map[string][]string{"nuclei.zip": {extracted}})
	if err := os.MkdirAll(filepath.Join(toolDir, filepath.Dir(extracted)), 0o755); err != nil {
		t.Fatalf("create cached dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(toolDir, extracted), []byte("cached-binary"), 0o755); err != nil {
		t.Fatalf("create cached file: %v", err)
	}
	var storageCalls atomic.Int32
	srv.workersSrv.registryFn = func(ctx context.Context, req *workers.BuiltinToolRegistryRequest) (*workers.BuiltinToolRegistryResponse, error) {
		return &workers.BuiltinToolRegistryResponse{ToolPaths: []string{"https://storage.example.com/nuclei.zip"}}, nil
	}
	srv.workersSrv.storageFn = func(req *workers.StorageRequest, stream workers.WorkersService_StorageServer) error {
		storageCalls.Add(1)
		return nil
	}
	srv.workersSrv.manifestFn = emptyManifest

	// When: DownloadTools runs
	err := srv.client.DownloadTools(context.Background())

	// Then: Storage is never called and the cached file is untouched
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if storageCalls.Load() != 0 {
		t.Errorf("expected Storage to be skipped on cache hit, got %d calls", storageCalls.Load())
	}
	if _, err := os.Stat(filepath.Join(toolDir, extracted)); err != nil {
		t.Errorf("cached file should still exist: %v", err)
	}
}

func TestDownloadTools_ZipExtraction(t *testing.T) {
	// Given: a registry serving a zip archive with a binary entry
	srv, toolDir := newToolClient(t)
	zipData := makeZip(t, map[string]string{"bin/nuclei": "#!/bin/sh\necho nuclei\n"})
	srv.workersSrv.registryFn = func(ctx context.Context, req *workers.BuiltinToolRegistryRequest) (*workers.BuiltinToolRegistryResponse, error) {
		return &workers.BuiltinToolRegistryResponse{ToolPaths: []string{"https://storage.example.com/nuclei.zip"}}, nil
	}
	srv.workersSrv.storageFn = streamBytes(zipData)
	srv.workersSrv.manifestFn = emptyManifest

	// When: DownloadTools runs
	err := srv.client.DownloadTools(context.Background())

	// Then: the binary is extracted with executable permissions and state records it
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	binPath := filepath.Join(toolDir, "bin", "nuclei")
	info, err := os.Stat(binPath)
	if err != nil {
		t.Fatalf("expected extracted binary: %v", err)
	}
	if runtime.GOOS != "windows" && info.Mode().Perm()&0o111 == 0 {
		t.Errorf("expected executable permissions, got %v", info.Mode().Perm())
	}
	data, err := os.ReadFile(binPath)
	if err != nil {
		t.Fatalf("read extracted binary: %v", err)
	}
	if string(data) != "#!/bin/sh\necho nuclei\n" {
		t.Errorf("unexpected content: %q", data)
	}
	state := loadToolState(filepath.Join(toolDir, ".tool_versions.json"))
	files, ok := stateForBase(state, "nuclei.zip")
	if !ok {
		t.Fatal("expected state entry for nuclei.zip")
	}
	if len(files) != 1 || files[0] != "bin/nuclei" {
		t.Errorf("expected state [bin/nuclei], got %v", files)
	}
}

func TestDownloadTools_TarGzExtraction(t *testing.T) {
	// Given: a registry serving a tar.gz archive with a binary entry
	srv, toolDir := newToolClient(t)
	tarData := makeTarGz(t, map[string]string{"bin/subfinder": "#!/bin/sh\necho subfinder\n"})
	srv.workersSrv.registryFn = func(ctx context.Context, req *workers.BuiltinToolRegistryRequest) (*workers.BuiltinToolRegistryResponse, error) {
		return &workers.BuiltinToolRegistryResponse{ToolPaths: []string{"https://storage.example.com/subfinder.tar.gz"}}, nil
	}
	srv.workersSrv.storageFn = streamBytes(tarData)
	srv.workersSrv.manifestFn = emptyManifest

	// When: DownloadTools runs
	err := srv.client.DownloadTools(context.Background())

	// Then: the binary is extracted with executable permissions and state records it
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	binPath := filepath.Join(toolDir, "bin", "subfinder")
	info, err := os.Stat(binPath)
	if err != nil {
		t.Fatalf("expected extracted binary: %v", err)
	}
	if runtime.GOOS != "windows" && info.Mode().Perm()&0o111 == 0 {
		t.Errorf("expected executable permissions, got %v", info.Mode().Perm())
	}
	data, err := os.ReadFile(binPath)
	if err != nil {
		t.Fatalf("read extracted binary: %v", err)
	}
	if string(data) != "#!/bin/sh\necho subfinder\n" {
		t.Errorf("unexpected content: %q", data)
	}
	state := loadToolState(filepath.Join(toolDir, ".tool_versions.json"))
	files, ok := stateForBase(state, "subfinder.tar.gz")
	if !ok {
		t.Fatal("expected state entry for subfinder.tar.gz")
	}
	if len(files) != 1 || files[0] != "bin/subfinder" {
		t.Errorf("expected state [bin/subfinder], got %v", files)
	}
}

func TestDownloadTools_PathTraversalRejected(t *testing.T) {
	// Given: a zip archive containing a path traversal entry (non-ignored suffix)
	srv, toolDir := newToolClient(t)
	zipData := makeZip(t, map[string]string{"../evil.sh": "pwned"})
	srv.workersSrv.registryFn = func(ctx context.Context, req *workers.BuiltinToolRegistryRequest) (*workers.BuiltinToolRegistryResponse, error) {
		return &workers.BuiltinToolRegistryResponse{ToolPaths: []string{"https://storage.example.com/evil.zip"}}, nil
	}
	srv.workersSrv.storageFn = streamBytes(zipData)
	srv.workersSrv.manifestFn = emptyManifest

	// When: DownloadTools runs
	err := srv.client.DownloadTools(context.Background())

	// Then: extraction fails and no file is written outside the destination
	if err == nil {
		t.Fatal("expected error for malicious archive entry")
	}
	if _, statErr := os.Stat(filepath.Join(filepath.Dir(toolDir), "evil.sh")); !os.IsNotExist(statErr) {
		t.Error("traversal file must not exist outside the tool directory")
	}
}

func TestDownloadTools_IgnoredFilesSkipped(t *testing.T) {
	// Given: a zip archive mixing a binary with docs that must be ignored
	srv, toolDir := newToolClient(t)
	zipData := makeZip(t, map[string]string{
		"bin/tool":   "#!/bin/sh\necho tool\n",
		"README.md":  "docs",
		"notes.txt":  "notes",
		"manual.pdf": "pdf",
	})
	srv.workersSrv.registryFn = func(ctx context.Context, req *workers.BuiltinToolRegistryRequest) (*workers.BuiltinToolRegistryResponse, error) {
		return &workers.BuiltinToolRegistryResponse{ToolPaths: []string{"https://storage.example.com/tool.zip"}}, nil
	}
	srv.workersSrv.storageFn = streamBytes(zipData)
	srv.workersSrv.manifestFn = emptyManifest

	// When: DownloadTools runs
	err := srv.client.DownloadTools(context.Background())

	// Then: only the binary is extracted; docs are skipped and not in state
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, ignored := range []string{"README.md", "notes.txt", "manual.pdf"} {
		if _, statErr := os.Stat(filepath.Join(toolDir, ignored)); !os.IsNotExist(statErr) {
			t.Errorf("ignored file %s must not be extracted", ignored)
		}
	}
	if _, statErr := os.Stat(filepath.Join(toolDir, "bin", "tool")); statErr != nil {
		t.Errorf("binary should be extracted: %v", statErr)
	}
	state := loadToolState(filepath.Join(toolDir, ".tool_versions.json"))
	if files, _ := stateForBase(state, "tool.zip"); len(files) != 1 || files[0] != "bin/tool" {
		t.Errorf("expected state [bin/tool], got %v", files)
	}
}

func TestDownloadTools_CleanupObsolete(t *testing.T) {
	// Given: cached state with an obsolete tool whose file exists on disk
	srv, toolDir := newToolClient(t)
	obsoleteFile := filepath.Join("obsolete-tool", "bin", "oldtool")
	currentFile := filepath.Join("current-tool", "bin", "newtool")
	writeState(t, toolDir, map[string][]string{
		"obsolete.zip": {obsoleteFile},
		"current.zip":  {currentFile},
	})
	for _, f := range []string{obsoleteFile, currentFile} {
		if err := os.MkdirAll(filepath.Join(toolDir, filepath.Dir(f)), 0o755); err != nil {
			t.Fatalf("create dir for %s: %v", f, err)
		}
		if err := os.WriteFile(filepath.Join(toolDir, f), []byte("binary"), 0o755); err != nil {
			t.Fatalf("create file %s: %v", f, err)
		}
	}
	srv.workersSrv.registryFn = func(ctx context.Context, req *workers.BuiltinToolRegistryRequest) (*workers.BuiltinToolRegistryResponse, error) {
		return &workers.BuiltinToolRegistryResponse{ToolPaths: []string{"https://storage.example.com/current.zip"}}, nil
	}
	srv.workersSrv.manifestFn = emptyManifest

	// When: DownloadTools runs
	err := srv.client.DownloadTools(context.Background())

	// Then: the obsolete file is removed, the current one kept, state pruned
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, statErr := os.Stat(filepath.Join(toolDir, obsoleteFile)); !os.IsNotExist(statErr) {
		t.Error("obsolete tool file must be removed")
	}
	if _, statErr := os.Stat(filepath.Join(toolDir, currentFile)); statErr != nil {
		t.Errorf("current tool file must be kept: %v", statErr)
	}
	state := loadToolState(filepath.Join(toolDir, ".tool_versions.json"))
	if _, ok := stateForBase(state, "obsolete.zip"); ok {
		t.Error("obsolete.zip must be pruned from state")
	}
	if files, _ := stateForBase(state, "current.zip"); len(files) != 1 || files[0] != currentFile {
		t.Errorf("expected state %v for current.zip, got %v", []string{currentFile}, files)
	}
}

func TestDownloadTools_InitCommands(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("init script exec not supported on windows")
	}
	// Given: a cached tool plus an executable init script in the tool dir
	srv, toolDir := newToolClient(t)
	extracted := filepath.Join("nuclei", "bin", "nuclei")
	writeState(t, toolDir, map[string][]string{"nuclei.zip": {extracted}})
	if err := os.MkdirAll(filepath.Join(toolDir, filepath.Dir(extracted)), 0o755); err != nil {
		t.Fatalf("create cached dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(toolDir, extracted), []byte("binary"), 0o755); err != nil {
		t.Fatalf("create cached file: %v", err)
	}
	helper := "#!/bin/sh\nprintf 'done' > init-marker.txt\n"
	if err := os.WriteFile(filepath.Join(toolDir, "helper.sh"), []byte(helper), 0o755); err != nil {
		t.Fatalf("create helper script: %v", err)
	}
	srv.workersSrv.registryFn = func(ctx context.Context, req *workers.BuiltinToolRegistryRequest) (*workers.BuiltinToolRegistryResponse, error) {
		return &workers.BuiltinToolRegistryResponse{ToolPaths: []string{"https://storage.example.com/nuclei.zip"}}, nil
	}
	srv.workersSrv.manifestFn = func(ctx context.Context, req *workers.GetManifestRequest) (*workers.GetManifestResponse, error) {
		return &workers.GetManifestResponse{InitCommands: []string{"helper.sh"}}, nil
	}

	// When: DownloadTools runs
	err := srv.client.DownloadTools(context.Background())

	// Then: the init command ran with the tool dir as its working directory
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	data, err := os.ReadFile(filepath.Join(toolDir, "init-marker.txt"))
	if err != nil {
		t.Fatalf("init command should have created marker file: %v", err)
	}
	if string(data) != "done" {
		t.Errorf("unexpected marker content: %q", data)
	}
}

func TestDownloadTools_StorageErrorRemovesTempFile(t *testing.T) {
	// Given: a storage stream that fails mid-transfer
	srv, toolDir := newToolClient(t)
	srv.workersSrv.registryFn = func(ctx context.Context, req *workers.BuiltinToolRegistryRequest) (*workers.BuiltinToolRegistryResponse, error) {
		return &workers.BuiltinToolRegistryResponse{ToolPaths: []string{"https://storage.example.com/broken.zip"}}, nil
	}
	srv.workersSrv.storageFn = func(req *workers.StorageRequest, stream workers.WorkersService_StorageServer) error {
		if err := stream.Send(&workers.StorageResponse{Chunk: []byte("partial"), Offset: 0}); err != nil {
			return err
		}
		return status.Error(codes.Internal, "storage exploded")
	}

	// When: DownloadTools runs
	err := srv.client.DownloadTools(context.Background())

	// Then: it fails and the partial temp file is removed
	if err == nil {
		t.Fatal("expected error when Storage fails")
	}
	if _, statErr := os.Stat(filepath.Join(toolDir, "broken.zip")); !os.IsNotExist(statErr) {
		t.Error("partial temp file must be removed after storage error")
	}
}
