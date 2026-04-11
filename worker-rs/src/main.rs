use worker_rs::grpc::{self, GrpcClient};
use worker_rs::state::SharedState;
use worker_rs::tools::ToolManager;
use worker_rs::executor::{JobExecutor, JobExecutionInput};
use worker_rs::error::WorkerError;

use grpc::generated::{JoinRequest, AliveRequest};
use grpc::generated::{Worker as ProtoWorker, JobResultRequest, UpdateResultDto, DataPayloadResult};

use tokio::time::{interval, Duration};
use tokio_stream::wrappers::ReceiverStream;
use tokio_stream::StreamExt;

struct Worker {
    grpc: GrpcClient,
    state: SharedState,
    tool_manager: ToolManager,
    executor: JobExecutor,
    config: WorkerConfig,
}

struct WorkerConfig {
    grpc_host: String,
    grpc_port: u16,
    api_key: String,
    worker_signature: String,
    job_timeout_secs: u64,
}

impl WorkerConfig {
    fn from_env() -> Self {
        Self {
            grpc_host: std::env::var("GRPC_HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            grpc_port: std::env::var("GRPC_PORT")
                .unwrap_or_else(|_| "50051".to_string())
                .parse()
                .unwrap_or(50051),
            api_key: std::env::var("API_KEY").unwrap_or_default(),
            worker_signature: std::env::var("WORKER_SIGNATURE").unwrap_or_default(),
            job_timeout_secs: std::env::var("JOB_TIMEOUT_SECS")
                .unwrap_or_else(|_| "300".to_string())
                .parse()
                .unwrap_or(300),
        }
    }
}

impl Worker {
    async fn new(config: WorkerConfig) -> Result<Self, WorkerError> {
        let grpc = GrpcClient::new(&config.grpc_host, config.grpc_port).await?;

        Ok(Self {
            grpc,
            state: worker_rs::state::new_shared_state(),
            tool_manager: ToolManager::new(),
            executor: JobExecutor::new(config.job_timeout_secs),
            config,
        })
    }

    async fn join(&mut self) -> Result<(), WorkerError> {
        let request = JoinRequest {
            api_key: self.config.api_key.clone(),
            signature: self.config.worker_signature.clone(),
        };

        let response = self.grpc.workers.join(request).await
            .map_err(|e| WorkerError::Grpc(e))?
            .into_inner();

        let mut state = self.state.write().await;
        state.worker_id = Some(response.worker_id.clone());
        state.worker_token = Some(response.worker_token.clone());
        state.is_connected = true;

        tracing::info!("Worker joined with ID: {}", response.worker_id);

        Ok(())
    }

    async fn alive_loop(&self) -> Result<(), WorkerError> {
        let state = self.state.clone();
        let mut workers_client = self.grpc.workers.clone();

        tokio::spawn(async move {
            let (tx, rx) = tokio::sync::mpsc::channel(4);
            let stream = ReceiverStream::new(rx);

            // Start the bidirectional streaming call once
            let mut response_stream = match workers_client.alive(stream).await {
                Ok(resp) => resp.into_inner(),
                Err(e) => {
                    tracing::error!("Failed to start alive stream: {}", e);
                    let mut state = state.write().await;
                    state.is_connected = false;
                    return;
                }
            };

            let mut ticker = interval(Duration::from_secs(5));

            loop {
                tokio::select! {
                    _ = ticker.tick() => {
                        let worker_token = {
                            let s = state.read().await;
                            if !s.is_connected {
                                continue;
                            }
                            s.worker_token.clone()
                        };

                        let Some(token) = worker_token else { continue };

                        let request = AliveRequest { worker_token: token };
                        if tx.send(request).await.is_err() {
                            tracing::warn!("Alive channel receiver dropped, exiting");
                            break;
                        }
                    }
                    resp = response_stream.next() => {
                        match resp {
                            Some(_) => tracing::debug!("Alive heartbeat acknowledged"),
                            None => {
                                tracing::warn!("Alive stream closed by server");
                                let mut state = state.write().await;
                                state.is_connected = false;
                                break;
                            }
                        }
                    }
                }
            }
        });

        Ok(())
    }

    async fn run(&mut self) -> Result<(), WorkerError> {
        // Join worker
        self.join().await?;

        // Download tools on startup
        match self.tool_manager.fetch_manifest().await {
            Ok(manifest) => {
                if let Err(e) = self.tool_manager.download_tools(&manifest.download_tools_url).await {
                    tracing::warn!("Failed to download tools: {}", e);
                }
            }
            Err(e) => {
                tracing::warn!("Failed to fetch manifest: {}", e);
            }
        }

        // Start alive loop in background
        self.alive_loop().await?;

        // Main job polling loop
        loop {
            let worker_id = {
                let state = self.state.read().await;
                state.worker_id.clone()
            };

            let worker_id = match worker_id {
                Some(id) => id,
                None => {
                    tokio::time::sleep(Duration::from_secs(1)).await;
                    continue;
                }
            };

            // Poll for next job
            let request = tonic::Request::new(ProtoWorker { id: worker_id.clone() });

            match self.grpc.jobs.next(request).await {
                Ok(response) => {
                    let job = response.into_inner();

                    if job.id.is_empty() {
                        // No job available, wait and retry
                        tokio::time::sleep(Duration::from_millis(500)).await;
                        continue;
                    }

                    tracing::info!("Received job: {}", job.id);

                    // Execute job
                    let execution = self.executor.execute(JobExecutionInput {
                        job_id: job.id.clone(),
                        command: job.command.clone().unwrap_or_default(),
                        working_dir: None,
                    }).await;

                    // Report result
                    let result = match execution {
                        Ok(output) => {
                            JobResultRequest {
                                worker_id: worker_id.clone(),
                                data: Some(UpdateResultDto {
                                    job_id: job.id,
                                    data: Some(DataPayloadResult {
                                        error: !output.success,
                                        raw: Some(output.stdout.clone()),
                                        payload: None,
                                    }),
                                }),
                            }
                        }
                        Err(e) => {
                            tracing::error!("Job execution failed: {}", e);
                            JobResultRequest {
                                worker_id: worker_id.clone(),
                                data: Some(UpdateResultDto {
                                    job_id: job.id,
                                    data: Some(DataPayloadResult {
                                        error: true,
                                        raw: Some(e.to_string()),
                                        payload: None,
                                    }),
                                }),
                            }
                        }
                    };

                    if let Err(e) = self.grpc.jobs.result(result).await {
                        tracing::error!("Failed to report job result: {}", e);
                    }
                }
                Err(e) => {
                    tracing::warn!("Failed to poll job: {}", e);
                    tokio::time::sleep(Duration::from_secs(1)).await;
                }
            }
        }
    }
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    tracing::info!("Shutdown signal received");
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();
    tracing::info!("Starting worker-rs");

    let config = WorkerConfig::from_env();
    let mut worker = Worker::new(config).await?;

    tokio::select! {
        result = worker.run() => {
            if let Err(e) = result {
                tracing::error!("Worker error: {}", e);
            }
        }
        _ = shutdown_signal() => {
            tracing::info!("Shutting down worker");
        }
    }

    Ok(())
}
