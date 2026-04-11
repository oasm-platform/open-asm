use crate::error::WorkerError;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct WorkerManifestResponse {
    #[serde(rename = "downloadToolsUrl")]
    pub download_tools_url: String,
}

#[derive(Debug, Deserialize)]
pub struct ToolManagerConfig {
    pub api_host: String,
    pub api_port: u16,
    pub tools_cache_dir: String,
}

impl Default for ToolManagerConfig {
    fn default() -> Self {
        Self {
            api_host: std::env::var("API_HOST").unwrap_or_else(|_| "localhost".to_string()),
            api_port: std::env::var("API_PORT")
                .unwrap_or_else(|_| "6276".to_string())
                .parse()
                .unwrap_or(6276),
            tools_cache_dir: std::env::var("TOOLS_CACHE_DIR")
                .unwrap_or_else(|_| "./tools-cache".to_string()),
        }
    }
}

pub struct ToolManager {
    client: reqwest::Client,
    config: ToolManagerConfig,
    cache_dir: std::path::PathBuf,
}

impl ToolManager {
    pub fn new() -> Self {
        let config = ToolManagerConfig::default();
        Self::with_config(config)
    }

    pub fn with_config(config: ToolManagerConfig) -> Self {
        let cache_dir = std::path::PathBuf::from(&config.tools_cache_dir);
        Self {
            client: reqwest::Client::new(),
            config,
            cache_dir,
        }
    }

    pub async fn fetch_manifest(&self) -> Result<WorkerManifestResponse, WorkerError> {
        let url = format!(
            "http://{}:{}/api/workers/manifest",
            self.config.api_host, self.config.api_port
        );

        tracing::info!("Fetching manifest from: {}", url);

        let response = self.client.get(&url).send().await?;
        let manifest: WorkerManifestResponse = response.json().await?;

        tracing::info!("Got manifest with download URL: {}", manifest.download_tools_url);

        Ok(manifest)
    }

    pub async fn download_tools(&self, download_url: &str) -> Result<(), WorkerError> {
        let base_url = format!("http://{}:{}", self.config.api_host, self.config.api_port);
        let full_url = if download_url.starts_with('/') {
            format!("{}{}", base_url, download_url)
        } else {
            download_url.to_string()
        };

        tracing::info!("Downloading tools from: {}", full_url);

        tokio::fs::create_dir_all(&self.cache_dir).await?;

        let response = self.client.get(&full_url).send().await?;
        let bytes = response.bytes().await?;

        if full_url.ends_with(".tar.gz") || full_url.ends_with(".tgz") {
            self.extract_tar_gz(&bytes).await?;
        } else {
            // Default to zip
            self.extract_zip(&bytes).await?;
        }

        self.set_execute_permissions().await?;

        tracing::info!("Tools extracted to: {:?}", self.cache_dir);
        Ok(())
    }

    async fn extract_tar_gz(&self, data: &[u8]) -> Result<(), WorkerError> {
        // TODO: For large archives, stream to a temp file instead of loading all bytes.
        let cache_dir = self.cache_dir.clone();
        let data = data.to_vec();
        tokio::task::spawn_blocking(move || {
            use flate2::read::GzDecoder;
            use tar::Archive;
            let decoder = GzDecoder::new(data.as_slice());
            let mut archive = Archive::new(decoder);
            archive.unpack(&cache_dir)?;
            Ok::<_, WorkerError>(())
        })
        .await
        .map_err(|e| WorkerError::JobExecution(e.to_string()))?
    }

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

    pub fn get_tool_path(&self, tool_name: &str) -> std::path::PathBuf {
        self.cache_dir.join(tool_name)
    }
}
