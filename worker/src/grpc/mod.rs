#[allow(clippy::large_enum_variant)]
pub mod generated {
    tonic::include_proto!("workers");
    tonic::include_proto!("jobs_registry");
}

use crate::error::WorkerError;
use tokio::time::{sleep, Duration};
use tonic::transport::{Channel, Endpoint};

#[derive(Clone)]
pub struct GrpcClient {
    pub workers: generated::workers_service_client::WorkersServiceClient<Channel>,
    pub jobs: generated::jobs_registry_service_client::JobsRegistryServiceClient<Channel>,
}

impl GrpcClient {
    pub async fn new(host: &str, port: u16) -> Result<Self, WorkerError> {
        let addr = format!("http://{}:{}", host, port);
        let mut attempt = 0;
        let max_attempts = 5;
        let retry_delay = Duration::from_secs(5);

        loop {
            attempt += 1;
            match Endpoint::from_shared(addr.clone())
                .map_err(|e| WorkerError::ConnectionLost(e.to_string()))?
                .connect()
                .await
            {
                Ok(channel) => {
                    if attempt > 1 {
                        tracing::info!(attempt = attempt, "gRPC connection retry successful");
                    } else {
                        tracing::info!("gRPC connection successful");
                    }

                    // Increase max message size to 64MB (default is 4MB) to handle large job outputs
                    let max_message_size = 64 * 1024 * 1024; // 64MB

                    return Ok(Self {
                        workers: generated::workers_service_client::WorkersServiceClient::new(
                            channel.clone(),
                        )
                        .max_decoding_message_size(max_message_size)
                        .max_encoding_message_size(max_message_size),
                        jobs:
                            generated::jobs_registry_service_client::JobsRegistryServiceClient::new(
                                channel,
                            )
                            .max_decoding_message_size(max_message_size)
                            .max_encoding_message_size(max_message_size),
                    });
                }
                Err(e) => {
                    if attempt >= max_attempts {
                        return Err(WorkerError::Transport(e));
                    }
                    tracing::error!(attempt = attempt, error = %e, "gRPC connection failed, retrying in {}s", retry_delay.as_secs());
                    sleep(retry_delay).await;
                }
            }
        }
    }
}
