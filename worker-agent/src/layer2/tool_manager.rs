use crate::config::Config;
use crate::error::{AgentError, Result};
use crate::proto::{ToolDefinition, ToolManifest};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use sha2::{Sha256, Digest};
use tokio::fs;

pub struct ToolManager {
    config: Arc<Config>,
    tools_dir: PathBuf,
}

impl ToolManager {
    pub fn new(config: Arc<Config>) -> Self {
        let tools_dir = PathBuf::from(&config.tools_dir);
        Self { config, tools_dir }
    }

    pub async fn init(&self) -> Result<()> {
        if !self.tools_dir.exists() {
            fs::create_dir_all(&self.tools_dir)
                .await
                .map_err(|e| AgentError::Tool(format!("Failed to create tools dir: {}", e)))?;
        }
        Ok(())
    }

    pub async fn sync_tools(&self, manifest: &ToolManifest) -> Result<()> {
        for tool in &manifest.tools {
            self.sync_tool(tool).await?;
        }
        Ok(())
    }

    async fn sync_tool(&self, tool: &ToolDefinition) -> Result<()> {
        let tool_path = self.tool_path(tool);

        if tool_path.exists() {
            let local_hash = self.compute_hash(&tool_path).await?;
            if local_hash == tool.sha256 {
                tracing::debug!("Tool {} up to date", tool.name);
                return Ok(());
            }
            tracing::info!("Tool {} hash mismatch, re-downloading", tool.name);
            fs::remove_file(&tool_path).await.ok();
        }

        self.download_tool(tool).await?;
        self.set_executable(&tool_path).await?;

        Ok(())
    }

    async fn download_tool(&self, tool: &ToolDefinition) -> Result<()> {
        tracing::info!("Downloading tool {} from {}", tool.name, tool.url);

        let client = reqwest::Client::new();
        let response = client
            .get(&tool.url)
            .send()
            .await
            .map_err(|e| AgentError::Download(format!("Request failed: {}", e)))?;

        if !response.status().is_success() {
            return Err(AgentError::Download(format!("Download failed: {}", response.status())));
        }

        let bytes = response
            .bytes()
            .await
            .map_err(|e| AgentError::Download(format!("Read bytes: {}", e)))?;

        let computed_hash = hex::encode(Sha256::digest(&bytes));
        if computed_hash != tool.sha256 {
            return Err(AgentError::Verification(
                format!("Hash mismatch: expected {}, got {}", tool.sha256, computed_hash)
            ));
        }

        let tool_path = self.tool_path(tool);
        fs::write(&tool_path, &bytes)
            .await
            .map_err(|e| AgentError::Download(format!("Write failed: {}", e)))?;

        tracing::info!("Downloaded and verified tool {}", tool.name);
        Ok(())
    }

    async fn set_executable(&self, path: &Path) -> Result<()> {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let metadata = fs::metadata(path).await?;
            let mut perms = metadata.permissions();
            perms.set_mode(0o755);
            fs::set_permissions(path, perms).await?;
        }

        Ok(())
    }

    async fn compute_hash(&self, path: &Path) -> Result<String> {
        let bytes = fs::read(path).await.map_err(|e| AgentError::Verification(e.to_string()))?;
        Ok(hex::encode(Sha256::digest(&bytes)))
    }

    fn tool_path(&self, tool: &ToolDefinition) -> PathBuf {
        self.tools_dir.join(&tool.executable_name)
    }

    pub fn get_tool_path(&self, name: &str) -> PathBuf {
        self.tools_dir.join(name)
    }

    pub async fn tool_exists(&self, name: &str) -> bool {
        self.get_tool_path(name).exists()
    }
}
