use crate::config::Config;
use crate::error::{AgentError, Result};
use crate::proto::{JoinRequest, JoinResponse};
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct GrpcClient {
    config: Arc<Config>,
    worker_id: Arc<RwLock<Option<String>>>,
    worker_token: Arc<RwLock<Option<String>>>,
}

impl GrpcClient {
    pub fn new(config: Arc<Config>) -> Self {
        Self {
            config,
            worker_id: Arc::new(RwLock::new(None)),
            worker_token: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn join(&self) -> Result<JoinResponse> {
        let request = JoinRequest {
            api_key: self.config.api_key.clone(),
            signature: None,
        };

        tracing::info!("Connecting to backend at {}", self.config.api_url);

        let client = reqwest::Client::new();
        let url = format!("{}/api/workers/join", self.config.api_url);

        let response = client
            .post(&url)
            .json(&request)
            .send()
            .await
            .map_err(|e| AgentError::Connection(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AgentError::Auth(format!("{}: {}", status, body)));
        }

        let join_response: JoinResponse = response
            .json()
            .await
            .map_err(|e| AgentError::Auth(e.to_string()))?;

        *self.worker_id.write().await = Some(join_response.worker_id.clone());
        *self.worker_token.write().await = Some(join_response.worker_token.clone());

        tracing::info!("Connected as worker: {}", join_response.worker_id);
        Ok(join_response)
    }

    pub async fn get_worker_id(&self) -> Option<String> {
        self.worker_id.read().await.clone()
    }

    pub async fn get_token(&self) -> Option<String> {
        self.worker_token.read().await.clone()
    }

    pub async fn is_connected(&self) -> bool {
        self.worker_id.read().await.is_some()
    }

    pub async fn reconnect(&self) -> Result<()> {
        tracing::warn!("Reconnecting to backend...");
        *self.worker_id.write().await = None;
        *self.worker_token.write().await = None;

        let mut retry_count = 0;
        let max_retries = 5;

        while retry_count < max_retries {
            match self.join().await {
                Ok(_) => return Ok(()),
                Err(e) => {
                    retry_count += 1;
                    let delay = std::time::Duration::from_secs(2u64.pow(retry_count as u32)).min(std::time::Duration::from_secs(30));
                    tracing::error!("Connection attempt {} failed: {}. Retrying in {:?}...", retry_count, e, delay);
                    tokio::time::sleep(delay).await;
                }
            }
        }

        Err(AgentError::Connection("Failed to reconnect after max retries".into()))
    }
}

impl Clone for GrpcClient {
    fn clone(&self) -> Self {
        Self {
            config: self.config.clone(),
            worker_id: self.worker_id.clone(),
            worker_token: self.worker_token.clone(),
        }
    }
}
