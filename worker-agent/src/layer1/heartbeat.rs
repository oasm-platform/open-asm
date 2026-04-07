use crate::config::Config;
use crate::layer1::grpc_client::GrpcClient;
use std::sync::Arc;
use std::time::Duration;

pub struct Heartbeat {
    config: Arc<Config>,
    client: Arc<GrpcClient>,
}

impl Heartbeat {
    pub fn new(config: Arc<Config>, client: Arc<GrpcClient>) -> Self {
        Self { config, client }
    }

    pub async fn start(&self) {
        let interval = Duration::from_secs(self.config.heartbeat_interval);

        loop {
            tokio::time::sleep(interval).await;

            if let Err(e) = self.send_heartbeat().await {
                tracing::error!("Heartbeat failed: {}", e);

                // Try to reconnect
                if let Err(e) = self.client.reconnect().await {
                    tracing::error!("Reconnection failed: {}", e);
                }
            }
        }
    }

    async fn send_heartbeat(&self) -> crate::error::Result<()> {
        let token = self.client.get_token().await.ok_or_else(|| 
            crate::error::AgentError::Connection("No token".into()))?;

        let client = reqwest::Client::new();
        let url = format!("{}/api/workers/alive", self.config.api_url);

        let response = client
            .post(&url)
            .header("worker-token", token)
            .send()
            .await
            .map_err(|e| crate::error::AgentError::Connection(e.to_string()))?;

        if response.status() == 401 {
            return Err(crate::error::AgentError::Auth("Token expired".into()));
        }

        if !response.status().is_success() {
            return Err(crate::error::AgentError::Connection(
                format!("Heartbeat failed: {}", response.status())
            ));
        }

        Ok(())
    }
}
