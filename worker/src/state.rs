use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Debug, Clone, Default)]
pub struct WorkerState {
    pub worker_id: Option<String>,
    pub worker_token: Option<String>,
    pub worker_token_value: Option<tonic::metadata::MetadataValue<tonic::metadata::Ascii>>,
    pub is_connected: bool,
}

pub type SharedState = Arc<RwLock<WorkerState>>;

pub fn new_shared_state() -> SharedState {
    Arc::new(RwLock::new(WorkerState::default()))
}
