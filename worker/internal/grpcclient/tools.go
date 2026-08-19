package grpcclient

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	workers "github.com/oasm-platform/open-asm/grpc-client/go/workers"
)

// DownloadTools resolves the tool directory, downloads and extracts every
// archive in the built-in tool registry via the Storage stream, persists the
// extracted file state to .tool_versions.json, removes obsolete tool files,
// and executes the manifest init commands.
func (c *Client) DownloadTools(ctx context.Context) error {
	absToolPath, err := filepath.Abs(c.toolPath)
	if err != nil {
		c.logger.ErrorE("Failed to resolve absolute tool path", err)
		return err
	}

	statePath := filepath.Join(absToolPath, ".tool_versions.json")

	if _, err := os.Stat(statePath); os.IsNotExist(err) {
		c.logger.Info("Tool cache not found, cleaning up directory contents for fresh download")

		entries, err := os.ReadDir(absToolPath)
		if err == nil {
			for _, entry := range entries {
				removePath := filepath.Join(absToolPath, entry.Name())
				if err := os.RemoveAll(removePath); err != nil {
					return fmt.Errorf("failed to remove item %s: %w", removePath, err)
				}
			}
		} else if !os.IsNotExist(err) {
			return fmt.Errorf("failed to read tool directory for cleanup: %w", err)
		}
	}

	if err := os.MkdirAll(absToolPath, 0o755); err != nil {
		return fmt.Errorf("failed to create tool directory: %w", err)
	}

	osKey := runtime.GOOS
	if osKey == "darwin" {
		osKey = "macos"
	}

	registry, err := c.workersClient().BuiltinToolRegistry(ctx, &workers.BuiltinToolRegistryRequest{Os: osKey, Arch: runtime.GOARCH})
	if err != nil {
		c.logger.ErrorE("BuiltinToolRegistry retrieval failed", err)
		return err
	}

	oldState := loadToolState(statePath)
	newState := make(map[string][]string)

	for _, toolURL := range registry.ToolPaths {
		fileName := filepath.Base(toolURL)

		if extractedFiles, exists := oldState[fileName]; exists {
			c.logger.Success("Tools cache hit: %s", fileName)
			newState[fileName] = extractedFiles
			continue
		}

		c.logger.Info("Downloading tool: %s", fileName)
		extractedFiles, err := c.downloadAndExtractSingleTool(ctx, toolURL, absToolPath, fileName)
		if err != nil {
			c.logger.ErrorE("Failed to download/extract tool: "+fileName, err)
			return err
		}

		newState[fileName] = extractedFiles
	}

	activeFiles := make(map[string]bool)
	for _, files := range newState {
		for _, f := range files {
			activeFiles[f] = true
		}
	}

	for oldFileName, oldExtractedFiles := range oldState {
		if _, stillExists := newState[oldFileName]; !stillExists {
			c.logger.Info("Cleaning up obsolete tool: %s", oldFileName)
			for _, file := range oldExtractedFiles {
				if !activeFiles[file] {
					fullPath := filepath.Join(absToolPath, file)
					_ = os.Remove(fullPath)
					c.logger.Verbose("Deleted unused file: %s", file)
				}
			}
		}
	}

	if err := saveToolState(statePath, newState); err != nil {
		c.logger.ErrorE("Failed to save tool state", err)
	}

	manifest, err := c.workersClient().GetManifest(ctx, &workers.GetManifestRequest{})
	if err != nil {
		c.logger.ErrorE("Failed to retrieve GetManifest for init commands", err)
	} else if len(manifest.InitCommands) > 0 {
		c.logger.Info("Executing %d initialization commands", len(manifest.InitCommands))
		for _, cmdStr := range manifest.InitCommands {
			if err := c.runInitCommand(ctx, cmdStr, absToolPath); err != nil {
				c.logger.ErrorE("Init command failed: "+cmdStr, err)
				return err
			}
		}
		c.logger.Success("All init commands executed successfully")
	} else {
		c.logger.Debug("GetManifest success, but no init commands to execute")
	}

	return nil
}

// downloadAndExtractSingleTool streams a tool archive from Storage into a
// temp file, extracts it into destDir, and returns the extracted file paths.
func (c *Client) downloadAndExtractSingleTool(ctx context.Context, url, destDir, fileName string) ([]string, error) {
	var extractedFiles []string

	stream, err := c.workersClient().Storage(ctx, &workers.StorageRequest{Path: url})
	if err != nil {
		return nil, fmt.Errorf("failed to start download stream: %w", err)
	}

	tempFile := filepath.Join(destDir, fileName)
	file, err := os.Create(tempFile)
	if err != nil {
		return nil, fmt.Errorf("failed to create temporary file: %w", err)
	}

	for {
		resp, err := stream.Recv()
		if err == io.EOF {
			break
		}
		if err != nil {
			file.Close()
			os.Remove(tempFile)
			return nil, fmt.Errorf("error receiving stream: %w", err)
		}
		if _, err := file.WriteAt(resp.Chunk, int64(resp.Offset)); err != nil {
			file.Close()
			os.Remove(tempFile)
			return nil, fmt.Errorf("failed to write chunk: %w", err)
		}
		if resp.Eof {
			break
		}
	}
	file.Close()
	c.logger.Success("Download completed: %s", tempFile)

	c.logger.Info("Extracting %s...", fileName)

	if strings.HasSuffix(fileName, ".zip") {
		extractedFiles, err = c.extractZip(tempFile, destDir)
	} else if strings.HasSuffix(fileName, ".tar.gz") || strings.HasSuffix(fileName, ".tgz") {
		extractedFiles, err = c.extractTarGz(tempFile, destDir)
	} else {
		return nil, fmt.Errorf("unsupported archive format: %s", fileName)
	}

	if err != nil {
		return nil, fmt.Errorf("failed to extract and set permissions: %w", err)
	}

	_ = os.Remove(tempFile)
	return extractedFiles, nil
}

// extractZip extracts a zip archive into destDir with path traversal guards.
func (c *Client) extractZip(srcZip, destDir string) ([]string, error) {
	var extractedFiles []string
	r, err := zip.OpenReader(srcZip)
	if err != nil {
		return nil, err
	}
	defer r.Close()

	for _, f := range r.File {
		if isIgnoredFile(f.Name) {
			continue
		}

		target := filepath.Join(destDir, f.Name)
		if !strings.HasPrefix(filepath.Clean(target), filepath.Clean(destDir)) {
			return nil, fmt.Errorf("illegal file path: %s", f.Name)
		}

		if f.FileInfo().IsDir() {
			os.MkdirAll(target, 0o755)
			continue
		}

		os.MkdirAll(filepath.Dir(target), 0o755)

		outFile, err := os.OpenFile(target, os.O_CREATE|os.O_RDWR|os.O_TRUNC, f.Mode())
		if err != nil {
			return nil, err
		}

		rc, err := f.Open()
		if err != nil {
			outFile.Close()
			return nil, err
		}

		_, err = io.Copy(outFile, rc)
		outFile.Close()
		rc.Close()
		if err != nil {
			return nil, err
		}

		if runtime.GOOS != "windows" {
			_ = os.Chmod(target, f.Mode()|0o755)
		}

		extractedFiles = append(extractedFiles, f.Name)
		c.logger.Verbose("Extracted: %s", f.Name)
	}
	return extractedFiles, nil
}

// extractTarGz extracts a tar.gz archive into destDir with path traversal guards.
func (c *Client) extractTarGz(srcGzip, destDir string) ([]string, error) {
	var extractedFiles []string
	file, err := os.Open(srcGzip)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	gzr, err := gzip.NewReader(file)
	if err != nil {
		return nil, err
	}
	defer gzr.Close()

	tr := tar.NewReader(gzr)

	for {
		header, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}

		if isIgnoredFile(header.Name) {
			continue
		}

		target := filepath.Join(destDir, header.Name)
		if !strings.HasPrefix(filepath.Clean(target), filepath.Clean(destDir)) {
			return nil, fmt.Errorf("illegal file path: %s", header.Name)
		}

		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, 0o755); err != nil {
				return nil, err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				return nil, err
			}

			f, err := os.OpenFile(target, os.O_CREATE|os.O_RDWR|os.O_TRUNC, os.FileMode(header.Mode))
			if err != nil {
				return nil, err
			}

			if _, err := io.Copy(f, tr); err != nil {
				f.Close()
				return nil, err
			}
			f.Close()

			if runtime.GOOS != "windows" {
				_ = os.Chmod(target, os.FileMode(header.Mode)|0o755)
			}

			extractedFiles = append(extractedFiles, header.Name)
			c.logger.Verbose("Extracted: %s", header.Name)
		}
	}
	return extractedFiles, nil
}

// isIgnoredFile reports whether the file name ends in a doc suffix that is
// skipped during extraction.
func isIgnoredFile(fileName string) bool {
	lowerName := strings.ToLower(fileName)
	return strings.HasSuffix(lowerName, ".txt") || strings.HasSuffix(lowerName, ".md") || strings.HasSuffix(lowerName, ".pdf")
}

// runInitCommand executes an init command string in workDir, preferring the
// binary resolved inside the tool directory and prepending workDir to PATH.
func (c *Client) runInitCommand(ctx context.Context, cmdStr, workDir string) error {
	parts := strings.Fields(cmdStr)
	if len(parts) == 0 {
		return nil
	}

	binaryName := parts[0]
	args := parts[1:]
	fullPath := filepath.Join(workDir, binaryName)

	if runtime.GOOS == "windows" && !strings.HasSuffix(strings.ToLower(fullPath), ".exe") {
		if _, err := os.Stat(fullPath + ".exe"); err == nil {
			fullPath += ".exe"
		}
	}

	if _, err := os.Stat(fullPath); err == nil {
		binaryName = fullPath
	}

	c.logger.Debug("Running: %s", cmdStr)
	cmd := exec.CommandContext(ctx, binaryName, args...)
	cmd.Dir = workDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	pathEnv := os.Getenv("PATH")
	cmd.Env = append(os.Environ(), fmt.Sprintf("PATH=%s%c%s", workDir, os.PathListSeparator, pathEnv))

	return cmd.Run()
}

// loadToolState reads the .tool_versions.json state file, tolerating absence.
func loadToolState(path string) map[string][]string {
	state := make(map[string][]string)
	data, err := os.ReadFile(path)
	if err == nil {
		_ = json.Unmarshal(data, &state)
	}
	return state
}

// saveToolState writes the tool state file as indented JSON.
func saveToolState(path string, state map[string][]string) error {
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}
