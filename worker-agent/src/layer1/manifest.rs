use crate::config::Config;
use crate::error::{AgentError, Result};
use crate::proto::{ToolManifest, ToolDefinition};
use std::sync::Arc;

pub struct ToolManifestFetcher {
    config: Arc<Config>,
}

impl ToolManifestFetcher {
    pub fn new(config: Arc<Config>) -> Self {
        Self { config }
    }

    pub async fn fetch_manifest_for_worker(&self, worker_id: &str) -> Result<ToolManifest> {
        let client = reqwest::Client::new();
        let url = format!("{}/api/tools/manifest?worker_id={}", self.config.api_url, worker_id);

        let response = client
            .get(&url)
            .send()
            .await
            .map_err(|e| AgentError::Connection(e.to_string()))?;

        if !response.status().is_success() {
            return Err(AgentError::Connection(
                format!("Manifest fetch failed: {}", response.status())
            ));
        }

        let manifest: ToolManifest = response
            .json()
            .await
            .map_err(|e| AgentError::Connection(e.to_string()))?;

        tracing::debug!("Fetched manifest with {} tools", manifest.tools.len());
        Ok(manifest)
    }
}
