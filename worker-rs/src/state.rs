use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Debug, Clone)]
pub struct WorkerState {
    pub worker_id: Option<String>,
    pub worker_token: Option<String>,
    pub is_connected: bool,
}

impl Default for WorkerState {
    fn default() -> Self {
        Self {
            worker_id: None,
            worker_token: None,
            is_connected: false,
        }
    }
}

pub type SharedState = Arc<RwLock<WorkerState>>;

pub fn new_shared_state() -> SharedState {
    Arc::new(RwLock::new(WorkerState::default()))
}
