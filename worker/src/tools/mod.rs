use crate::error::WorkerError;
use crate::grpc::generated::workers_service_client::WorkersServiceClient;
use crate::grpc::generated::{GetManifestRequest, DownloadToolsRequest};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tonic::transport::Channel;



#[derive(Debug)]
pub struct ToolManagerConfig {
    pub tools_cache_dir: String,
}

impl ToolManagerConfig {
    pub fn new(tools_cache_dir: String) -> Self {
        Self {
            tools_cache_dir,
        }
    }
}

/// Known tool names that we expect to find in the cache.
const KNOWN_TOOLS: &[&str] = &["nuclei", "httpx", "naabu", "subfinder", "dnsx", "screenshot"];

pub struct ToolManager {
    grpc_client: WorkersServiceClient<Channel>,
    config: ToolManagerConfig,
    cache_dir: std::path::PathBuf,
    /// Resolved absolute paths of cached tools, populated after download/extraction.
    tool_paths: Arc<RwLock<HashMap<String, std::path::PathBuf>>>,
}

impl ToolManager {
    pub fn with_grpc_client(grpc_client: WorkersServiceClient<Channel>, config: ToolManagerConfig) -> Self {
        let cache_dir = std::path::PathBuf::from(&config.tools_cache_dir);
        // Convert to absolute path to avoid issues with relative paths in command execution
        let cache_dir = if cache_dir.is_absolute() {
            cache_dir
        } else {
            std::env::current_dir().unwrap_or_default().join(&cache_dir)
        };
        Self {
            grpc_client,
            config,
            cache_dir,
            tool_paths: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn fetch_manifest(&mut self) -> Result<String, WorkerError> {
        tracing::debug!("Fetching manifest via gRPC");

        let response = self.grpc_client
            .get_manifest(tonic::Request::new(GetManifestRequest {}))
            .await
            .map_err(WorkerError::Grpc)?
            .into_inner();

        Ok(response.download_tools_url)
    }

    pub async fn download_tools(&mut self, download_url: &str) -> Result<(), WorkerError> {
        tracing::info!(url = %download_url, "Downloading tools via gRPC streaming");

        tokio::fs::create_dir_all(&self.cache_dir).await?;

        let mut stream = self.grpc_client
            .download_tools(tonic::Request::new(DownloadToolsRequest {
                url: download_url.to_string(),
            }))
            .await
            .map_err(WorkerError::Grpc)?
            .into_inner();

        let mut all_bytes = Vec::new();

        while let Some(response) = stream.message().await.map_err(WorkerError::Grpc)? {
            all_bytes.extend_from_slice(&response.chunk);
            if response.eof {
                break;
            }
        }

        if download_url.ends_with(".tar.gz") || download_url.ends_with(".tgz") {
            self.extract_tar_gz(&all_bytes).await?;
        } else {
            // Save file
            let file_path = self.cache_dir.join("tools.bin");
            tokio::fs::write(&file_path, all_bytes).await?;
        }

        Ok(())
    }

    async fn extract_tar_gz(&self, data: &[u8]) -> Result<(), WorkerError> {
        // TODO: For large archives, stream to a temp file instead of loading all bytes.
        let cache_dir = self.cache_dir.clone();
        let bytes = data.to_vec();

        if bytes.len() < 2 || bytes[0] != 0x1f || bytes[1] != 0x8b {
            tracing::warn!(size = bytes.len(), "Downloaded file is not a valid gzip archive");
            return Ok(());
        }

        tokio::task::spawn_blocking(move || {
            use flate2::read::GzDecoder;
            use tar::Archive;
            let decoder = GzDecoder::new(bytes.as_slice());
            let mut archive = Archive::new(decoder);
            archive.unpack(&cache_dir)?;
            Ok::<_, WorkerError>(())
        })
        .await
        .map_err(|e| WorkerError::JobExecution(e.to_string()))?
    }

    #[allow(dead_code)]
    async fn extract_zip(&self, data: &[u8]) -> Result<(), WorkerError> {
        // TODO: For large archives, stream to a temp file instead of loading all bytes.
        let cache_dir = self.cache_dir.clone();
        let data = data.to_vec();
        tokio::task::spawn_blocking(move || {
            use std::io::Cursor;
            use zip::ZipArchive;
            let cursor = Cursor::new(data);
            let mut archive = ZipArchive::new(cursor)?;

            for i in 0..archive.len() {
                let mut file = archive.by_index(i)?;
                let outpath = cache_dir.join(file.name());

                if file.name().ends_with('/') {
                    std::fs::create_dir_all(&outpath)?;
                } else {
                    if let Some(p) = outpath.parent() {
                        std::fs::create_dir_all(p)?;
                    }

                    let mut outfile = std::fs::File::create(&outpath)?;
                    std::io::copy(&mut file, &mut outfile)?;
                }
            }
            Ok::<_, WorkerError>(())
        })
        .await
        .map_err(|e| WorkerError::JobExecution(e.to_string()))?
    }

    #[allow(dead_code)]
    async fn set_execute_permissions(&self) -> Result<(), WorkerError> {
        let cache_dir = self.cache_dir.clone();
        tokio::task::spawn_blocking(move || {
            for entry in walkdir::WalkDir::new(&cache_dir) {
                let entry = entry.map_err(|e| WorkerError::JobExecution(e.to_string()))?;
                let path = entry.path();
                if path.is_file() {
                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::PermissionsExt;
                        let metadata = std::fs::metadata(path)?;
                        let mut perms = metadata.permissions();
                        perms.set_mode(0o755);
                        std::fs::set_permissions(path, perms)?;
                    }
                }
            }
            Ok::<_, WorkerError>(())
        })
        .await
        .map_err(|e| WorkerError::JobExecution(e.to_string()))?
    }

    /// Scan the cache directory and populate the tool_paths map.
    async fn refresh_tool_paths(&self) {
        let cache_dir = self.cache_dir.clone();

        // Use spawn_blocking for filesystem operations to avoid blocking the async runtime
        let paths_map = tokio::task::spawn_blocking(move || {
            let mut paths = HashMap::new();

            for tool_name in KNOWN_TOOLS {
                let path = cache_dir.join(tool_name);
                // Add platform-specific extension if needed
                #[cfg(windows)]
                let path = path.with_extension("exe");

                if path.exists() && path.is_file() {
                    paths.insert(tool_name.to_string(), path);
                }
            }

            // Also scan for any other executables in the cache that we may not know about
            if let Ok(mut entries) = std::fs::read_dir(&cache_dir) {
                while let Some(entry) = entries.next().and_then(|e| e.ok()) {
                    let path = entry.path();
                    if path.is_file() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        // Strip .exe extension for matching
                        let base_name = name.strip_suffix(".exe").unwrap_or(&name);
                        if !paths.contains_key(base_name) {
                            paths.insert(base_name.to_string(), path);
                        }
                    }
                }
            }

            paths
        }).await.unwrap_or_default();

        let mut paths = self.tool_paths.write().await;
        paths.clear();
        paths.extend(paths_map);
    }

    /// Get the absolute path for a known tool by name.
    /// Returns None if the tool is not found in the cache.
    pub async fn resolve_tool_path(&self, tool_name: &str) -> Option<std::path::PathBuf> {
        self.tool_paths.read().await.get(tool_name).cloned()
    }

    /// Scan a command string for known tool names and return a map of
    /// tool_name -> absolute_path for all tools found in the command.
    pub async fn resolve_command_tools(&self, command: &str) -> HashMap<String, std::path::PathBuf> {
        let paths = self.tool_paths.read().await;
        let mut result = HashMap::new();

        // Tokenize the command and check for tool name matches
        let delimiters = &[' ', '|', ';', '(', '\n', '\t', '&'];
        let tokens: Vec<&str> = command.split(|c| delimiters.contains(&c)).collect();

        for (name, path) in paths.iter() {
            if tokens.contains(&name.as_str()) {
                result.insert(name.clone(), path.clone());
            }
        }

        result
    }

    /// Return all cached tool paths. Useful for initializing the executor with all available tools.
    pub async fn get_all_tool_paths(&self) -> HashMap<String, std::path::PathBuf> {
        self.tool_paths.read().await.clone()
    }

    /// Initialize nuclei templates by running `nuclei -ut`.
    /// This mirrors the behavior of the old TypeScript worker's entrypoint.sh.
    pub async fn init_nuclei_templates(&self) -> Result<(), WorkerError> {
        let nuclei_path = match self.resolve_tool_path("nuclei").await {
            Some(p) => p,
            None => {
                tracing::warn!("nuclei binary not found in cache, skipping template initialization");
                return Ok(());
            }
        };

        let output = tokio::process::Command::new(&nuclei_path)
            .arg("-ut")
            .output()
            .await
            .map_err(|e| WorkerError::JobExecution(format!("nuclei -ut failed: {}", e)))?;

        if output.status.success() {
            tracing::debug!("Nuclei templates initialized");
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            tracing::warn!(error = %stderr.lines().next().unwrap_or(""), "Nuclei template initialization had issues");
            // Non-fatal: continue anyway since templates may already exist
            Ok(())
        }
    }

    pub fn get_config(&self) -> &ToolManagerConfig {
        &self.config
    }

    /// Check if tools have already been downloaded and extracted.
    /// Returns true if the cache directory exists and contains executable files.
    /// Also populates the tool_paths map if tools are found.
    pub async fn needs_download(&self) -> bool {
        let cache_dir = self.cache_dir.clone();

        // Use spawn_blocking for filesystem operations to avoid blocking the async runtime
        let result = tokio::task::spawn_blocking(move || {
            // Check if cache directory exists
            if !cache_dir.exists() || !cache_dir.is_dir() {
                return true;
            }

            // Check if it contains at least one executable file
            let mut found_executable = false;
            let entries = match std::fs::read_dir(&cache_dir) {
                Ok(e) => e,
                Err(_) => return true, // Can't read directory, assume need download
            };

            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    #[cfg(unix)]
                    {
                        if let Ok(metadata) = std::fs::metadata(&path) {
                            use std::os::unix::fs::PermissionsExt;
                            let mode = metadata.permissions().mode();
                            if mode & 0o111 != 0 {
                                found_executable = true;
                            }
                        }
                    }
                    #[cfg(not(unix))]
                    {
                        found_executable = true;
                    }
                }
            }

            !found_executable
        }).await;

        let needs_download = result.unwrap_or(true);

        // If tools exist, populate tool_paths map
        if !needs_download {
            self.refresh_tool_paths().await;
        }

        needs_download
    }
}

#[cfg(test)]
mod tests {
    use super::*;
}
