use crate::error::WorkerError;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;

#[derive(Debug, Clone)]
pub struct JobExecutionInput {
    pub job_id: String,
    pub command: String,
    pub working_dir: Option<String>,
}

#[derive(Debug, Clone)]
pub struct JobExecutionOutput {
    pub job_id: String,
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
}

#[derive(Debug, Clone)]
pub struct JobExecutor {
    timeout_secs: u64,
}

impl JobExecutor {
    pub fn new(timeout_secs: u64) -> Self {
        Self { timeout_secs }
    }

    pub async fn execute(&self, input: JobExecutionInput) -> Result<JobExecutionOutput, WorkerError> {
        let timeout = tokio::time::Duration::from_secs(self.timeout_secs);

        tracing::info!("Executing job {}: {}", input.job_id, input.command);

        let output = tokio::time::timeout(timeout, self.execute_command(&input))
            .await
            .map_err(|_| WorkerError::JobExecution("Timeout".to_string()))??;

        Ok(output)
    }

    async fn execute_command(
        &self,
        input: &JobExecutionInput,
    ) -> Result<JobExecutionOutput, WorkerError> {
        let mut cmd = Command::new("/bin/sh");
        cmd.arg("-c").arg(&input.command);

        if let Some(ref dir) = input.working_dir {
            cmd.current_dir(dir);
        }

        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());

        let mut child = cmd
            .spawn()
            .map_err(|e| WorkerError::JobExecution(e.to_string()))?;

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        let stdout_lines = Arc::new(Mutex::new(Vec::new()));
        let stderr_lines = Arc::new(Mutex::new(Vec::new()));

        let mut handles = vec![];

        if let Some(stdout_stream) = stdout {
            let stdout_lines = Arc::clone(&stdout_lines);
            handles.push(tokio::spawn(async move {
                let mut reader = BufReader::new(stdout_stream);
                let mut line = String::new();
                loop {
                    line.clear();
                    match reader.read_line(&mut line).await {
                        Ok(0) => break,
                        Ok(_) => stdout_lines.lock().await.push(line.trim_end().to_string()),
                        Err(e) => {
                            tracing::warn!("Failed to read stdout: {}", e);
                            break;
                        }
                    }
                }
            }));
        }

        if let Some(stderr_stream) = stderr {
            let stderr_lines = Arc::clone(&stderr_lines);
            handles.push(tokio::spawn(async move {
                let mut reader = BufReader::new(stderr_stream);
                let mut line = String::new();
                loop {
                    line.clear();
                    match reader.read_line(&mut line).await {
                        Ok(0) => break,
                        Ok(_) => stderr_lines.lock().await.push(line.trim_end().to_string()),
                        Err(e) => {
                            tracing::warn!("Failed to read stderr: {}", e);
                            break;
                        }
                    }
                }
            }));
        }

        for handle in handles {
            let _ = handle.await;
        }

        let stdout_lines = Arc::try_unwrap(stdout_lines).unwrap().into_inner();
        let stderr_lines = Arc::try_unwrap(stderr_lines).unwrap().into_inner();

        let status = child
            .wait()
            .await
            .map_err(|e| WorkerError::JobExecution(e.to_string()))?;

        let success = status.success();
        let exit_code = status.code();

        tracing::info!(
            "Job {} completed: success={}, exit_code={:?}",
            input.job_id, success, exit_code
        );

        Ok(JobExecutionOutput {
            job_id: input.job_id.clone(),
            success,
            stdout: stdout_lines.join("\n"),
            stderr: stderr_lines.join("\n"),
            exit_code,
        })
    }
}
