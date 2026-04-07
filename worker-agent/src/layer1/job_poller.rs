use crate::config::Config;
use crate::error::{AgentError, Result};
use crate::proto::Job;
use crate::layer1::grpc_client::GrpcClient;
use std::sync::Arc;
use tokio::sync::mpsc;
use std::time::Duration;

pub struct JobPoller {
    config: Arc<Config>,
    client: Arc<GrpcClient>,
    sender: mpsc::UnboundedSender<Job>,
}

impl JobPoller {
    pub fn new(config: Arc<Config>, client: Arc<GrpcClient>, sender: mpsc::UnboundedSender<Job>) -> Self {
        Self {
            config,
            client,
            sender,
        }
    }

    pub async fn poll_jobs(&self) {
        let pull_interval = Duration::from_secs(1);

        loop {
            if !self.client.is_connected().await {
                tokio::time::sleep(Duration::from_secs(1)).await;
                continue;
            }

            match self.pull_single_job().await {
                Ok(Some(job)) => {
                    if let Err(e) = self.sender.send(job) {
                        tracing::error!("Failed to queue job: {}", e);
                    }
                }
                Ok(None) => {
                    // No job available, wait
                }
                Err(e) => {
                    tracing::error!("Job polling error: {}", e);
                }
            }

            tokio::time::sleep(pull_interval).await;
        }
    }

    async fn pull_single_job(&self) -> Result<Option<Job>> {
        let worker_id = self.client.get_worker_id().await.ok_or_else(|| 
            AgentError::Connection("Not connected".into()))?;

        let token = self.client.get_token().await.ok_or_else(|| 
            AgentError::Connection("No token".into()))?;

        let client = reqwest::Client::new();
        let url = format!("{}/api/jobs/next", self.config.api_url);

        let response = client
            .get(&url)
            .header("worker-token", token)
            .send()
            .await
            .map_err(|e| AgentError::Connection(e.to_string()))?;

        if response.status() == 204 || response.status() == 404 {
            return Ok(None);
        }

        if !response.status().is_success() {
            return Err(AgentError::JobProcessing(format!("Status: {}", response.status())));
        }

        let job: Job = response
            .json()
            .await
            .map_err(|e| AgentError::JobProcessing(e.to_string()))?;

        Ok(Some(job))
    }
}
