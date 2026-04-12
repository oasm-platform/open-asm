use worker_rs::grpc::{self, GrpcClient};
use worker_rs::state::SharedState;
use worker_rs::tools::{ToolManager, ToolManagerConfig};
use worker_rs::executor::{JobExecutor, JobExecutionInput};
use worker_rs::error::WorkerError;

use grpc::generated::{JoinRequest, AliveRequest};
use grpc::generated::{Worker as ProtoWorker, JobResultRequest, UpdateResultDto, DataPayloadResult};

use tokio::time::{interval, Duration};
use clap::Parser;
use std::sync::Arc;
use tokio::sync::Semaphore;

#[derive(Parser, Debug)]
#[command(name = "worker-rs", about = "High-performance gRPC worker for Open-ASM")]
struct Cli {
    /// gRPC server host
    #[arg(long, default_value = "localhost")]
    grpc_host: String,

    /// gRPC server port
    #[arg(long, default_value = "50051")]
    grpc_port: u16,

    /// API server host
    #[arg(long, default_value = "localhost")]
    api_host: String,

    /// API server port
    #[arg(long, default_value = "6276")]
    api_port: u16,

    /// API key for worker authentication
    #[arg(long)]
    api_key: String,

    /// Worker signature (optional for cloud workers)
    #[arg(long, default_value = "")]
    signature: String,

    /// Maximum concurrent jobs
    #[arg(long, default_value = "5")]
    max_concurrent_jobs: usize,

    /// Job timeout in seconds (default 1800/30min to accommodate nuclei scans)
    #[arg(long, default_value = "1800")]
    job_timeout_secs: u64,

    /// Tools cache directory
    #[arg(long, default_value = "tools-cache")]
    tools_cache_dir: String,
}

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
    max_concurrent_jobs: usize,
}

impl WorkerConfig {
    fn from_cli(cli: &Cli) -> Self {
        Self {
            grpc_host: cli.grpc_host.clone(),
            grpc_port: cli.grpc_port,
            api_key: cli.api_key.clone(),
            worker_signature: cli.signature.clone(),
            job_timeout_secs: cli.job_timeout_secs,
            max_concurrent_jobs: cli.max_concurrent_jobs,
        }
    }
}

impl Worker {
    async fn new(config: WorkerConfig, tool_config: ToolManagerConfig) -> Result<Self, WorkerError> {
        let grpc = GrpcClient::new(&config.grpc_host, config.grpc_port).await?;

        // Create executor with empty tool_paths initially; will be refreshed after download
        let executor = JobExecutor::new(config.job_timeout_secs, std::collections::HashMap::new());

        Ok(Self {
            grpc,
            state: worker_rs::state::new_shared_state(),
            tool_manager: ToolManager::with_config(tool_config),
            executor,
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

        tracing::info!(
            worker_id = %response.worker_id,
            "Worker joined successfully"
        );

        let mut state = self.state.write().await;
        state.worker_id = Some(response.worker_id.clone());
        state.worker_token = Some(response.worker_token.clone());
        state.is_connected = true;

        Ok(())
    }

    async fn alive_loop(&self) -> Result<(), WorkerError> {
        let state = self.state.clone();
        let mut workers_client = self.grpc.workers.clone();

        tokio::spawn(async move {
            let mut ticker = interval(Duration::from_secs(5));
            ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

            loop {
                ticker.tick().await;

                let worker_token = {
                    let s = state.read().await;
                    if !s.is_connected {
                        continue;
                    }
                    s.worker_token.clone()
                };

                let Some(token) = worker_token else {
                    continue;
                };

                if let Err(e) = workers_client
                    .alive(tonic::Request::new(AliveRequest { worker_token: token }))
                    .await
                {
                    tracing::warn!(error = %e, "Alive heartbeat failed");
                    let mut state = state.write().await;
                    state.is_connected = false;
                }
            }
        });

        Ok(())
    }

    async fn run(&mut self) -> Result<(), WorkerError> {
        // Join worker
        self.join().await?;

        // Download tools only if needed
        if self.tool_manager.needs_download().await {
            tracing::info!("Downloading tools...");
            let manifest = self.tool_manager.fetch_manifest().await
                .map_err(|e| WorkerError::JobExecution(format!("Failed to fetch manifest: {}", e)))?;

            self.tool_manager.download_tools(&manifest.download_tools_url).await
                .map_err(|e| WorkerError::JobExecution(format!("Failed to download tools: {}", e)))?;

            tracing::info!("Tools downloaded successfully");
        }

        // Initialize nuclei templates
        if let Err(e) = self.tool_manager.init_nuclei_templates().await {
            tracing::warn!(error = %e, "Failed to initialize nuclei templates");
        }

        // Refresh executor's tool paths now that tools are downloaded
        self.executor = JobExecutor::with_resolved_tools(&self.tool_manager, self.config.job_timeout_secs).await;

        // Log tool validation status
        let tool_status = self.executor.get_tool_validation_status().await;
        let mut valid_tools = Vec::new();
        let mut invalid_tools = Vec::new();

        for (name, status) in &tool_status {
            if status.is_valid {
                valid_tools.push(name.clone());
            } else {
                let reason = if !status.missing_deps.is_empty() {
                    format!("missing: {}", status.missing_deps.join(", "))
                } else {
                    status.error_message.clone().unwrap_or_else(|| "unknown".to_string())
                };
                invalid_tools.push(format!("{} ({})", name, reason));
            }
        }

        if !valid_tools.is_empty() {
            tracing::info!(tools = %valid_tools.join(", "), "Valid tools");
        }
        if !invalid_tools.is_empty() {
            tracing::warn!(tools = %invalid_tools.join(", "), "Tools with issues");
        }
        tracing::info!(valid = valid_tools.len(), invalid = invalid_tools.len(), "Tool validation complete");

        // Start alive loop in background
        self.alive_loop().await?;

        let max_concurrent = self.config.max_concurrent_jobs;
        let semaphore = Arc::new(Semaphore::new(max_concurrent));
        let state = self.state.clone();
        let mut jobs_client = self.grpc.jobs.clone();
        let executor = self.executor.clone();

        // Main job polling loop with concurrent execution
        loop {
            let (worker_id, worker_token) = {
                let s = state.read().await;
                match (s.worker_id.clone(), s.worker_token.clone()) {
                    (Some(id), Some(token)) => (id, token),
                    _ => {
                        tokio::time::sleep(Duration::from_secs(1)).await;
                        continue;
                    }
                }
            };

            // Poll for next job
            let mut request = tonic::Request::new(ProtoWorker { id: worker_id.clone() });
            match worker_token.parse() {
                Ok(token_value) => {
                    request.metadata_mut().insert("worker-token", token_value);
                }
                Err(e) => {
                    tracing::error!(error = %e, "Failed to parse worker token");
                    tokio::time::sleep(Duration::from_secs(5)).await;
                    continue;
                }
            }

            let job = match jobs_client.next(request).await {
                Ok(resp) => resp.into_inner(),
                Err(e) => {
                    tracing::warn!(error = %e, "Failed to poll job via gRPC");
                    tokio::time::sleep(Duration::from_secs(1)).await;
                    continue;
                }
            };

            if job.id.is_empty() {
                tokio::time::sleep(Duration::from_millis(500)).await;
                continue;
            }

            let job_id = job.id;
            let command = job.command.unwrap_or_default();

            tracing::info!(
                job_id = %job_id,
                active = max_concurrent - semaphore.available_permits(),
                max = max_concurrent,
                command = %command,
                "Received job"
            );

            let permit = semaphore.clone().acquire_owned().await
                .expect("Semaphore closed");

            let worker_id = worker_id.clone();
            let worker_token = worker_token.clone();
            let mut jobs_client = jobs_client.clone();
            let executor = executor.clone();

            tokio::spawn(async move {
                let span = tracing::info_span!("job", job_id = %job_id);
                let _enter = span.enter();

                let execution: Result<worker_rs::executor::JobExecutionOutput, WorkerError> = executor.execute(JobExecutionInput {
                    job_id: job_id.clone(),
                    command: command.clone(),
                    working_dir: None,
                }).await;

                let result = match execution {
                    Ok(output) => {
                        tracing::info!(success = output.success, "Job completed");
                        JobResultRequest {
                            worker_id: worker_id.clone(),
                            data: Some(UpdateResultDto {
                                job_id: job_id.clone(),
                                data: Some(DataPayloadResult {
                                    error: !output.success,
                                    raw: Some(output.stdout.clone()),
                                    payload: None,
                                }),
                            }),
                        }
                    }
                    Err(WorkerError::ToolDependencyMissing { tool, message }) => {
                        tracing::error!(tool = %tool, "Job failed - missing dependency");
                        JobResultRequest {
                            worker_id: worker_id.clone(),
                            data: Some(UpdateResultDto {
                                job_id: job_id.clone(),
                                data: Some(DataPayloadResult {
                                    error: true,
                                    raw: Some(format!("Tool '{}' is not functional: {}. Please install missing dependencies or update the tool.", tool, message)),
                                    payload: None,
                                }),
                            }),
                        }
                    }
                    Err(e) => {
                        tracing::error!(error = %e, "Job execution failed");
                        JobResultRequest {
                            worker_id: worker_id.clone(),
                            data: Some(UpdateResultDto {
                                job_id: job_id.clone(),
                                data: Some(DataPayloadResult {
                                    error: true,
                                    raw: Some(e.to_string()),
                                    payload: None,
                                }),
                            }),
                        }
                    }
                };

                let mut req = tonic::Request::new(result);
                req.metadata_mut().insert("worker-token", worker_token.parse().unwrap());
                if let Err(e) = jobs_client.result(req).await {
                    tracing::error!(error = %e, "Failed to report job result");
                }

                drop(permit);
            });
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
    // Initialize tracing with RUST_LOG environment variable support
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"))
        )
        .init();

    let cli = Cli::parse();

    tracing::info!(
        host = %cli.grpc_host,
        port = cli.grpc_port,
        max_concurrent = cli.max_concurrent_jobs,
        "Starting worker-rs"
    );

    let config = WorkerConfig::from_cli(&cli);
    let tool_config = ToolManagerConfig::new(
        cli.api_host.clone(),
        cli.api_port,
        cli.tools_cache_dir.clone(),
    );
    let mut worker = Worker::new(config, tool_config).await?;

    tokio::select! {
        result = worker.run() => {
            if let Err(e) = result {
                tracing::error!(error = %e, "Worker error");
            }
        }
        _ = shutdown_signal() => {
            tracing::info!("Shutting down worker");
        }
    }

    Ok(())
}
