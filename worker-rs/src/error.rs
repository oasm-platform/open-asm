use thiserror::Error;

#[derive(Error, Debug)]
pub enum WorkerError {
    #[error("gRPC error: {0}")]
    Grpc(#[from] tonic::Status),

    #[error("gRPC transport error: {0}")]
    Transport(#[from] tonic::transport::Error),

    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Zip error: {0}")]
    Zip(#[from] zip::result::ZipError),

    #[error("Worker not joined: {0}")]
    NotJoined(&'static str),

    #[error("Job execution failed: {0}")]
    JobExecution(String),

    #[error("Connection lost: {0}")]
    ConnectionLost(String),
}

pub type Result<T> = std::result::Result<T, WorkerError>;
