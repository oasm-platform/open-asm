package grpcclient

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
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
		h := sha256.Sum256([]byte(toolURL))
		stateKey := hex.EncodeToString(h[:4]) + "_" + fileName

		var hitFiles []string
		var hit bool
		if v, ok := oldState[stateKey]; ok {
			hitFiles = v
			hit = true
		} else if v, ok := oldState[fileName]; ok {
			hitFiles = v
			hit = true
		}
		if hit {
			allExist := true
			for _, f := range hitFiles {
				if _, err := os.Stat(filepath.Join(absToolPath, f)); err != nil {
					allExist = false
					break
				}
			}
			if allExist {
				c.logger.Success("Tools cache hit: %s", fileName)
				newState[stateKey] = hitFiles
				continue
			}
		}

		c.logger.Info("Downloading tool: %s", fileName)
		extractedFiles, err := c.downloadAndExtractSingleTool(ctx, toolURL, absToolPath, fileName)
		if err != nil {
			c.logger.ErrorE("Failed to download/extract tool: "+fileName, err)
			return err
		}

		newState[stateKey] = extractedFiles
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
		return fmt.Errorf("failed to save tool state: %w", err)
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

	var totalWritten int64
	var maxEnd int64
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
		totalWritten += int64(len(resp.Chunk))
		endOffset := int64(resp.Offset) + int64(len(resp.Chunk))
		if endOffset > maxEnd {
			maxEnd = endOffset
		}
		if resp.Eof {
			break
		}
	}
	if totalWritten != maxEnd {
		file.Close()
		os.Remove(tempFile)
		return nil, fmt.Errorf("incomplete download: expected %d bytes but got sparse file up to %d", totalWritten, maxEnd)
	}
	_ = file.Sync()
	file.Close()
	c.logger.Success("Download completed: %s", tempFile)

	c.logger.Info("Extracting %s...", fileName)

	if strings.HasSuffix(fileName, ".zip") {
		extractedFiles, err = c.extractZip(tempFile, destDir)
	} else if strings.HasSuffix(fileName, ".tar.gz") || strings.HasSuffix(fileName, ".tgz") {
		extractedFiles, err = c.extractTarGz(tempFile, destDir)
	} else {
		os.Remove(tempFile)
		return nil, fmt.Errorf("unsupported archive format: %s", fileName)
	}

	if err != nil {
		os.Remove(tempFile)
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
		if !isWithinDir(target, destDir) {
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
		closeErr := outFile.Close()
		rc.Close()
		if err != nil {
			return nil, err
		}
		if closeErr != nil {
			return nil, fmt.Errorf("failed to close %s: %w", target, closeErr)
		}

		if runtime.GOOS != "windows" && f.Mode()&0o111 != 0 {
			_ = os.Chmod(target, f.Mode())
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
		if !isWithinDir(target, destDir) {
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
			if err := f.Close(); err != nil {
				return nil, fmt.Errorf("failed to close %s: %w", target, err)
			}

			if runtime.GOOS != "windows" && os.FileMode(header.Mode)&0o111 != 0 {
				_ = os.Chmod(target, os.FileMode(header.Mode))
			}

			extractedFiles = append(extractedFiles, header.Name)
			c.logger.Verbose("Extracted: %s", header.Name)
		}
	}
	return extractedFiles, nil
}

func isWithinDir(target, destDir string) bool {
	cleanTarget := filepath.Clean(target)
	cleanDest := filepath.Clean(destDir)
	return cleanTarget == cleanDest || strings.HasPrefix(cleanTarget, cleanDest+string(os.PathSeparator))
}

// isIgnoredFile reports whether the file name ends in a doc suffix that is
// skipped during extraction.
func isIgnoredFile(fileName string) bool {
	lowerName := strings.ToLower(fileName)
	return strings.HasSuffix(lowerName, ".txt") || strings.HasSuffix(lowerName, ".md") || strings.HasSuffix(lowerName, ".pdf")
}

// splitCommand is a shell-aware split respecting single/double quotes and
// backslash escapes. On unbalanced quotes it falls back to strings.Fields.
func splitCommand(cmdStr string) []string {
	var res []string
	var cur []rune
	inSingle, inDouble, escaped := false, false, false
	for _, r := range cmdStr {
		if escaped {
			cur = append(cur, r)
			escaped = false
			continue
		}
		if r == '\\' && !inSingle {
			escaped = true
			continue
		}
		if r == '\'' && !inDouble {
			inSingle = !inSingle
			continue
		}
		if r == '"' && !inSingle {
			inDouble = !inDouble
			continue
		}
		if !inSingle && !inDouble && (r == ' ' || r == '\t' || r == '\n' || r == '\r') {
			if len(cur) > 0 {
				res = append(res, string(cur))
				cur = cur[:0]
			}
			continue
		}
		cur = append(cur, r)
	}
	if escaped || inSingle || inDouble {
		return strings.Fields(cmdStr)
	}
	if len(cur) > 0 {
		res = append(res, string(cur))
	}
	return res
}

// runInitCommand executes an init command string in workDir, preferring the
// binary resolved inside the tool directory and prepending workDir to PATH.
func (c *Client) runInitCommand(ctx context.Context, cmdStr, workDir string) error {
	// Manifest init commands may contain shell operators; delegate to shell.
	if strings.Contains(cmdStr, "&&") || strings.Contains(cmdStr, "||") || strings.Contains(cmdStr, "|") || strings.Contains(cmdStr, ";") {
		c.logger.Debug("Running (shell): %s", cmdStr)
		var cmd *exec.Cmd
		if runtime.GOOS == "windows" {
			cmd = exec.CommandContext(ctx, "cmd", "/C", cmdStr)
		} else {
			cmd = exec.CommandContext(ctx, "sh", "-c", cmdStr)
		}
		cmd.Dir = workDir
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		pathEnv := os.Getenv("PATH")
		env := os.Environ()
		// Prepend workDir to PATH so init commands resolve tools from workDir first.
		found := false
		for i, kv := range env {
			if strings.HasPrefix(kv, "PATH=") {
				env[i] = fmt.Sprintf("PATH=%s%c%s", workDir, os.PathListSeparator, pathEnv)
				found = true
				break
			}
		}
		if !found {
			env = append(env, fmt.Sprintf("PATH=%s%c%s", workDir, os.PathListSeparator, pathEnv))
		}
		cmd.Env = env
		return cmd.Run()
	}
	parts := splitCommand(cmdStr)
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
	env2 := os.Environ()
	found2 := false
	for i, kv := range env2 {
		if strings.HasPrefix(kv, "PATH=") {
			env2[i] = fmt.Sprintf("PATH=%s%c%s", workDir, os.PathListSeparator, pathEnv)
			found2 = true
			break
		}
	}
	if !found2 {
		env2 = append(env2, fmt.Sprintf("PATH=%s%c%s", workDir, os.PathListSeparator, pathEnv))
	}
	cmd.Env = env2

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
