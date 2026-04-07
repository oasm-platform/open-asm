use crate::config::Config;
use crate::error::{AgentError, Result};
use crate::proto::Job;
use crate::layer2::tool_manager::ToolManager;
use std::sync::Arc;
use tokio::process::Command;

pub struct JobProcessor {
    config: Arc<Config>,
    tool_manager: Arc<ToolManager>,
}

impl JobProcessor {
    pub fn new(config: Arc<Config>, tool_manager: Arc<ToolManager>) -> Self {
        Self { config, tool_manager }
    }

    pub async fn process_job(&self, job: Job) -> Result<(bool, String)> {
        let tool_name = job.tool_name.as_ref()
            .ok_or_else(|| AgentError::JobProcessing("No tool_name in job".into()))?;

        let args = &job.args;

        self.execute_tool(tool_name, args).await
    }

    pub async fn execute_tool(&self, name: &str, args: &[String]) -> Result<(bool, String)> {
        if !self.tool_manager.tool_exists(name).await {
            return Err(AgentError::Tool(format!("Tool {} not found", name)));
        }

        let tool_path = self.tool_manager.get_tool_path(name);
        let mut cmd = Command::new(&tool_path);

        cmd.args(args);
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());

        tracing::debug!("Executing: {} {:?}", tool_path.display(), args);

        let output = cmd
            .output()
            .await
            .map_err(|e| AgentError::JobProcessing(format!("Execution failed: {}", e)))?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        if !output.status.success() {
            tracing::error!("Tool {} failed: {}", name, stderr);
            return Ok((false, stderr));
        }

        Ok((true, stdout))
    }
}

impl Clone for JobProcessor {
    fn clone(&self) -> Self {
        Self {
            config: self.config.clone(),
            tool_manager: self.tool_manager.clone(),
        }
    }
}
