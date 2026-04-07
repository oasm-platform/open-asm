use thiserror::Error;

#[derive(Error, Debug)]
pub enum AgentError {
    #[error("Connection error: {0}")]
    Connection(String),

    #[error("Authentication failed: {0}")]
    Auth(String),

    #[error("Job processing error: {0}")]
    JobProcessing(String),

    #[error("Tool error: {0}")]
    Tool(String),

    #[error("Download error: {0}")]
    Download(String),

    #[error("Verification error: {0}")]
    Verification(String),

    #[error("Configuration error: {0}")]
    Config(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

pub type Result<T> = std::result::Result<T, AgentError>;
