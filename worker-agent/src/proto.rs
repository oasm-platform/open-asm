use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JoinRequest {
    pub api_key: String,
    pub signature: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JoinResponse {
    pub worker_id: String,
    pub worker_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AliveRequest {
    pub worker_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AliveResponse {
    pub alive: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Worker {
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Job {
    pub id: String,
    pub asset: Option<String>,
    pub command: Option<String>,
    pub tool_name: Option<String>,
    pub args: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobResultRequest {
    pub worker_id: String,
    pub job_id: String,
    pub success: bool,
    pub output: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobResponse {
    pub success: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    pub name: String,
    pub url: String,
    pub sha256: String,
    pub executable_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolManifest {
    pub tools: Vec<ToolDefinition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobResultData {
    pub raw: Option<String>,
    pub error: bool,
    pub payload: serde_json::Value,
}
