use crate::config::Config;
use crate::error::Result;
use crate::layer1::{grpc_client::GrpcClient, job_poller::JobPoller, heartbeat::Heartbeat, manifest::ToolManifestFetcher};
use crate::layer2::{tool_manager::ToolManager, job_processor::JobProcessor};
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio::time::{interval, Duration};
use crate::proto::Job;
use crate::proto::JobResultRequest;

pub async fn run() -> Result<()> {
    let config = Arc::new(Config::from_args());

    tracing::info!("Starting Worker Agent");
    tracing::info!("API URL: {}", config.api_url);
    tracing::info!("Max concurrent jobs: {}", config.max_concurrent_jobs);

    let client = Arc::new(GrpcClient::new(config.clone()));

    client.join().await?;

    let worker_id = client.get_worker_id().await.unwrap();

    let tool_manager = Arc::new(ToolManager::new(config.clone()));
    tool_manager.init().await?;

    let manifest_fetcher = ToolManifestFetcher::new(config.clone());

    match manifest_fetcher.fetch_manifest_for_worker(&worker_id).await {
        Ok(manifest) => {
            if let Err(e) = tool_manager.sync_tools(&manifest).await {
                tracing::error!("Initial tool sync failed: {}", e);
            }
        }
        Err(e) => {
            tracing::warn!("Could not fetch tool manifest: {}", e);
        }
    }

    let (job_tx, mut job_rx) = mpsc::unbounded_channel::<Job>();

    let poller_client = client.clone();
    let poller_config = config.clone();
    let poller_tx = job_tx.clone();
    tokio::spawn(async move {
        let poller = JobPoller::new(poller_config, poller_client, poller_tx);
        poller.poll_jobs().await;
    });

    let heartbeat_client = client.clone();
    let heartbeat_config = config.clone();
    tokio::spawn(async move {
        let heartbeat = Heartbeat::new(heartbeat_config, heartbeat_client);
        heartbeat.start().await;
    });

    let sync_config = config.clone();
    let sync_tool_manager = tool_manager.clone();
    let sync_fetcher = ToolManifestFetcher::new(config.clone());
    let sync_worker_id = worker_id.clone();
    tokio::spawn(async move {
        let mut interval_timer = interval(Duration::from_secs(sync_config.manifest_check_interval));
        loop {
            interval_timer.tick().await;
            if let Ok(manifest) = sync_fetcher.fetch_manifest_for_worker(&sync_worker_id).await {
                if let Err(e) = sync_tool_manager.sync_tools(&manifest).await {
                    tracing::error!("Tool sync failed: {}", e);
                }
            }
        }
    });

    let processor = JobProcessor::new(config.clone(), tool_manager);
    let max_jobs = config.max_concurrent_jobs;
    let mut running_jobs: usize = 0;
    let api_url = config.api_url.clone();
    let client_for_result = client.clone();

    loop {
        tokio::select! {
            Some(job) = job_rx.recv() => {
                if running_jobs >= max_jobs {
                    let _ = job_tx.send(job);
                    tokio::time::sleep(Duration::from_millis(100)).await;
                    continue;
                }

                running_jobs += 1;
                let job_tx = job_tx.clone();
                let proc = processor.clone();
                let worker_id = worker_id.clone();
                let token = client_for_result.get_token().await.unwrap();
                let api_url = api_url.clone();

                tokio::spawn(async move {
                    let job_id = job.id.clone();
                    tracing::info!("Processing job {}", job_id);

                    let result = proc.process_job(job).await;

                    match result {
                        Ok((success, output)) => {
                            tracing::info!("Job {} completed: success={}", job_id, success);

                            let _ = report_result(&api_url, &worker_id, &token, &job_id, success, Some(&output), None).await;
                        }
                        Err(e) => {
                            tracing::error!("Job {} failed: {}", job_id, e);
                            let error_msg = e.to_string();
                            let _ = report_result(&api_url, &worker_id, &token, &job_id, false, None, Some(&error_msg)).await;
                        }
                    }

                    running_jobs -= 1;
                });
            }
            _ = tokio::time::sleep(Duration::from_secs(1)) => {
                // Idle
            }
        }
    }

    #[allow(unreachable_code)]
    Ok(())
}

async fn report_result(
    api_url: &str,
    worker_id: &str,
    token: &str,
    job_id: &str,
    success: bool,
    output: Option<&str>,
    error: Option<&str>,
) -> Result<()> {
    let client = reqwest::Client::new();
    let url = format!("{}/api/jobs/result", api_url);

    let request = JobResultRequest {
        worker_id: worker_id.to_string(),
        job_id: job_id.to_string(),
        success,
        output: output.map(|s| s.to_string()),
        error: error.map(|s| s.to_string()),
    };

    let response = client
        .post(&url)
        .header("worker-token", token)
        .json(&request)
        .send()
        .await
        .map_err(|e| crate::error::AgentError::Connection(e.to_string()))?;

    if !response.status().is_success() {
        tracing::warn!("Failed to report job result: {}", response.status());
    }

    Ok(())
}
