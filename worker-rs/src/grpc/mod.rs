pub mod generated {
    tonic::include_proto!("workers");
    tonic::include_proto!("jobs_registry");
}

use tonic::transport::{Channel, Endpoint};
use crate::error::WorkerError;

pub struct GrpcClient {
    pub workers: generated::workers_service_client::WorkersServiceClient<Channel>,
    pub jobs: generated::jobs_registry_service_client::JobsRegistryServiceClient<Channel>,
}

impl GrpcClient {
    pub async fn new(host: &str, port: u16) -> Result<Self, WorkerError> {
        let addr = format!("http://{}:{}", host, port);
        let channel = Endpoint::from_shared(addr)
            .map_err(|e| WorkerError::ConnectionLost(e.to_string()))?
            .connect()
            .await
            .map_err(WorkerError::Transport)?;

        Ok(Self {
            workers: generated::workers_service_client::WorkersServiceClient::new(channel.clone()),
            jobs: generated::jobs_registry_service_client::JobsRegistryServiceClient::new(channel),
        })
    }
}
