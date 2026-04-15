use worker::grpc::{self, GrpcClient};
use worker::state::SharedState;
use worker::tools::{ToolManager, ToolManagerConfig};
use worker::executor::{JobExecutor, JobExecutionInput};
use worker::error::WorkerError;

use grpc::generated::JoinRequest;
use grpc::generated::{Worker as ProtoWorker, JobResultRequest, UpdateResultDto, DataPayloadResult};

use tokio::time::Duration;
use clap::Parser;
use std::sync::Arc;
use tokio::sync::Semaphore;
use serde::{Serialize, Deserialize};
use std::fs;
use std::path::Path;

#[derive(Parser, Debug)]
#[command(name = "worker", about = "High-performance gRPC worker for Open-ASM")]
struct Cli {
    /// gRPC server host
    #[arg(long, env = "GRPC_HOST", default_value = "localhost")]
    grpc_host: String,

    /// gRPC server port
    #[arg(long, env = "GRPC_PORT", default_value = "50051")]
    grpc_port: u16,

    /// API key for worker authentication
    #[arg(long, env = "API_KEY")]
    api_key: Option<String>,

    /// Worker signature (optional for cloud workers)
    #[arg(long, env = "WORKER_SIGNATURE", default_value = "")]
    signature: String,

    /// Maximum concurrent jobs
    #[arg(long, env = "MAX_CONCURRENT_JOBS", default_value = "5")]
    max_concurrent_jobs: usize,

    /// Job timeout in seconds (default 1800/30min to accommodate nuclei scans)
    #[arg(long, env = "JOB_TIMEOUT_SECS", default_value = "1800")]
    job_timeout_secs: u64,

    /// Tools cache directory
    #[arg(long, env = "TOOLS_CACHE_DIR", default_value = "tools-cache")]
    tools_cache_dir: String,
}

struct Worker {
    grpc: Option<GrpcClient>,
    state: SharedState,
    tool_manager: ToolManager,
    executor: JobExecutor,
    config: WorkerConfig,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct WorkerConfig {
    grpc_host: String,
    grpc_port: u16,
    api_key: String,
    worker_signature: String,
    job_timeout_secs: u64,
    max_concurrent_jobs: usize,
}

impl WorkerConfig {
    const CONFIG_FILE: &'static str = ".configs.json";

    fn load_or_create(cli: &Cli) -> Result<Self, WorkerError> {
        if let Some(api_key) = &cli.api_key {
            let config = Self::from_cli(cli, api_key);
            config.save()?;
            return Ok(config);
        }

        if Path::new(Self::CONFIG_FILE).exists() {
            let content = fs::read_to_string(Self::CONFIG_FILE)
                .map_err(|e| WorkerError::Config(format!("Failed to read config file: {}", e)))?;
            let config: Self = serde_json::from_str(&content)
                .map_err(|e| WorkerError::Config(format!("Failed to parse config file: {}", e)))?;
            return Ok(config);
        }

        Err(WorkerError::Config("API key is required. Provide it via --api-key or ensure .configs.json exists".to_string()))
    }

    fn from_cli(cli: &Cli, api_key: &str) -> Self {
        Self {
            grpc_host: cli.grpc_host.clone(),
            grpc_port: cli.grpc_port,
            api_key: api_key.to_string(),
            worker_signature: cli.signature.clone(),
            job_timeout_secs: cli.job_timeout_secs,
            max_concurrent_jobs: cli.max_concurrent_jobs,
        }
    }

    fn save(&self) -> Result<(), WorkerError> {
        let content = serde_json::to_string_pretty(self)
            .map_err(|e| WorkerError::Config(format!("Failed to serialize config: {}", e)))?;
        fs::write(Self::CONFIG_FILE, content)
            .map_err(|e| WorkerError::Config(format!("Failed to write config file: {}", e)))?;
        Ok(())
    }
}

impl Worker {
    async fn new(config: WorkerConfig, tool_config: ToolManagerConfig) -> Result<Self, WorkerError> {
        let grpc = GrpcClient::new(&config.grpc_host, config.grpc_port).await?;

        // Create executor with empty tool_paths initially; will be refreshed after download
        let executor = JobExecutor::new(config.job_timeout_secs, std::collections::HashMap::new());

        Ok(Self {
            grpc: Some(grpc.clone()),
            state: worker::state::new_shared_state(),
            tool_manager: ToolManager::with_grpc_client(grpc.workers, tool_config),
            executor,
            config,
        })
    }

    async fn join(&mut self) -> Result<(), WorkerError> {
        let request = JoinRequest {
            api_key: self.config.api_key.clone(),
            signature: self.config.worker_signature.clone(),
        };

        let grpc = self.grpc.as_mut().ok_or_else(|| WorkerError::ConnectionLost("No gRPC client".to_string()))?;
        let response = grpc.workers.join(request).await
            .map_err(WorkerError::Grpc)?
            .into_inner();

        tracing::info!(
            worker_id = %response.worker_id,
            "Worker joined successfully"
        );

        let token_value = response.worker_token.parse().ok();

        let mut state = self.state.write().await;
        state.worker_id = Some(response.worker_id.clone());
        state.worker_token = Some(response.worker_token.clone());
        state.worker_token_value = token_value;
        state.is_connected = true;

        Ok(())
    }

    async fn alive_loop(&self) -> Result<(), WorkerError> {
        let grpc = self.grpc.clone().ok_or_else(|| WorkerError::ConnectionLost("No gRPC client".to_string()))?;
        let state = self.state.clone();

        tokio::spawn(async move {
            let mut was_offline = false;

            loop {
                let (worker_token, token_value) = {
                    let s = state.read().await;
                    (s.worker_token.clone(), s.worker_token_value.clone())
                };

                let Some(token) = worker_token else {
                    tracing::debug!("No worker token yet, skipping alive stream");
                    tokio::time::sleep(Duration::from_secs(5)).await;
                    continue;
                };

                let Some(token_val) = token_value else {
                    tracing::error!("Worker token value not cached, cannot establish alive stream");
                    tokio::time::sleep(Duration::from_secs(5)).await;
                    continue;
                };

                let mut request = tonic::Request::new(grpc::generated::AliveRequest {
                    worker_token: token.clone(),
                });
                request.metadata_mut().insert("worker-token", token_val);

                match grpc.workers.clone().alive(request).await {
                    Ok(response) => {
                        if was_offline {
                            tracing::info!("Worker established alive stream to server");
                            let mut s = state.write().await;
                            s.is_connected = true;
                        }

                        let mut stream = response.into_inner();
                        while let Ok(Some(_)) = stream.message().await {
                            // Heartbeat received, connection is healthy
                        }
                        
                        tracing::warn!("Alive stream closed by server");
                        was_offline = true;
                        let mut s = state.write().await;
                        s.is_connected = false;
                    }
                    Err(e) => {
                        if !was_offline {
                            tracing::warn!(error = %e, "Failed to establish alive stream");
                            was_offline = true;
                            let mut s = state.write().await;
                            s.is_connected = false;
                        }
                    }
                }

                tokio::time::sleep(Duration::from_secs(5)).await;
            }
        });

        Ok(())
    }

    async fn reconnect_grpc(&mut self) -> Result<(), WorkerError> {
        let mut backoff = Duration::from_secs(1);
        let max_backoff = Duration::from_secs(60);

        loop {
            tracing::info!(
                retry_in = ?backoff,
                "Attempting to reconnect gRPC client..."
            );
            
            match GrpcClient::new(&self.config.grpc_host, self.config.grpc_port).await {
                Ok(grpc) => {
                    self.grpc = Some(grpc);
                    tracing::info!("gRPC reconnection successful");

                    // Rejoin worker to get new token
                    tracing::info!("Rejoining worker after reconnection...");
                    self.join().await?;
                    tracing::info!("Worker rejoined successfully after reconnection");
                    return Ok(());
                }
                Err(e) => {
                    tracing::error!(error = %e, "gRPC reconnection failed");
                }
            }

            tokio::time::sleep(backoff).await;
            backoff = std::cmp::min(backoff * 2, max_backoff);
        }
    }

    async fn run(&mut self) -> Result<(), WorkerError> {
        // Join worker
        self.join().await?;

        // Download tools only if needed
        if self.tool_manager.needs_download().await {
            tracing::info!("Downloading tools...");
            let download_tools_url = self.tool_manager.fetch_manifest().await
                .map_err(|e| WorkerError::JobExecution(format!("Failed to fetch manifest: {}", e)))?;

            self.tool_manager.download_tools(&download_tools_url).await
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
        let executor = self.executor.clone();

        // Main job polling loop with concurrent execution
        loop {
            // Check connection status and reconnect if needed
            {
                let is_connected = {
                    let s = self.state.read().await;
                    s.is_connected
                };

                if !is_connected {
                    self.reconnect_grpc().await?;
                }
            }

            // Get current jobs client for this iteration
            let grpc = self.grpc.as_ref().ok_or_else(|| WorkerError::ConnectionLost("No gRPC client".to_string()))?;
            let mut jobs_client = grpc.jobs.clone();

            let (worker_id, worker_token, token_value) = {
                let s = self.state.read().await;
                match (s.worker_id.clone(), s.worker_token.clone(), s.worker_token_value.clone()) {
                    (Some(id), Some(token), Some(val)) => (id, token, val),
                    _ => {
                        tokio::time::sleep(Duration::from_secs(1)).await;
                        continue;
                    }
                }
            };

            // Poll for next job
            let mut request = tonic::Request::new(ProtoWorker { id: worker_id.clone() });
            request.metadata_mut().insert("worker-token", token_value.clone());

            let job = match jobs_client.next(request).await {
                Ok(resp) => resp.into_inner(),
                Err(e) => {
                    if e.message().contains("Invalid worker token") {
                        tracing::warn!("Invalid worker token detected, attempting to rejoin...");
                        self.join().await?;
                        continue;
                    }
                    tracing::error!(error = %e, "Failed to pull job via gRPC");
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
            let _worker_token = worker_token.clone();
            let token_value = token_value.clone();

            let executor = executor.clone();

            tokio::spawn(async move {
                let span = tracing::info_span!("job", job_id = %job_id);
                let _enter = span.enter();

                let execution: Result<worker::executor::JobExecutionOutput, WorkerError> = executor.execute(JobExecutionInput {
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
                req.metadata_mut().insert("worker-token", token_value);
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
        "Starting worker"
    );

    let config = WorkerConfig::load_or_create(&cli)?;
    let tool_config = ToolManagerConfig::new(cli.tools_cache_dir.clone());
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
