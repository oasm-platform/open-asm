use crate::error::WorkerError;
use std::collections::HashMap;
use std::path::PathBuf;
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
    /// Map of tool name -> absolute path, used to replace bare tool names in commands.
    tool_paths: Arc<HashMap<String, PathBuf>>,
}

impl JobExecutor {
    pub fn new(timeout_secs: u64, tool_paths: HashMap<String, PathBuf>) -> Self {
        Self {
            timeout_secs,
            tool_paths: Arc::new(tool_paths),
        }
    }

    /// Resolve tool paths from the tool manager and update the executor.
    pub async fn with_resolved_tools(tool_manager: &crate::tools::ToolManager, timeout_secs: u64) -> Self {
        let paths = tool_manager.get_all_tool_paths().await;
        Self::new(timeout_secs, paths)
    }

    /// Replace bare tool names in the command with absolute paths.
    /// e.g. "nuclei -u http://example.com" -> "/path/to/tools-cache/nuclei -u http://example.com"
    fn resolve_command(&self, command: &str) -> String {
        let mut result = command.to_string();

        // Sort tool names by length (longest first) to avoid partial replacements
        let mut tools: Vec<_> = self.tool_paths.iter().collect();
        tools.sort_by(|a, b| b.0.len().cmp(&a.0.len()));

        for (name, path) in tools {
            let path_str = path.to_string_lossy();
            // Simple approach: split by whitespace and delimiters, replace matching tokens
            // We use word-boundary matching via manual tokenization
            result = Self::replace_tool_token(&result, name, &path_str);
        }

        result
    }

    /// Replace a tool name token in a shell command string.
    /// Handles: start of string, after spaces, after |, after &&, after ;, after (
    fn replace_tool_token(input: &str, tool_name: &str, path_str: &str) -> String {
        // Split the input into segments separated by delimiters
        // Delimiters: space, |, &&, ;, (, newline
        let delimiters = &[' ', '|', ';', '(', '\n', '\t'];

        let mut result = String::with_capacity(input.len() + path_str.len());
        let mut chars = input.chars().peekable();
        let mut current_token = String::new();

        while let Some(ch) = chars.next() {
            if delimiters.contains(&ch) {
                // Flush current token
                if current_token == tool_name {
                    result.push_str(path_str);
                } else {
                    result.push_str(&current_token);
                }
                current_token.clear();
                result.push(ch);

                // Handle && as two consecutive &
                if ch == '&' && chars.peek() == Some(&'&') {
                    chars.next();
                    result.push('&');
                }
            } else {
                current_token.push(ch);
            }
        }

        // Flush last token
        if current_token == tool_name {
            result.push_str(path_str);
        } else {
            result.push_str(&current_token);
        }

        result
    }

    pub async fn execute(&self, input: JobExecutionInput) -> Result<JobExecutionOutput, WorkerError> {
        let timeout = tokio::time::Duration::from_secs(self.timeout_secs);

        // Resolve tool paths in the command
        let resolved_command = self.resolve_command(&input.command);
        tracing::info!(
            "Executing job {}: {}",
            input.job_id,
            if resolved_command != input.command {
                format!("{} (resolved: {})", input.command, resolved_command)
            } else {
                resolved_command.clone()
            }
        );

        let output = tokio::time::timeout(timeout, self.execute_command(&input, &resolved_command))
            .await
            .map_err(|_| WorkerError::JobExecution("Timeout".to_string()))??;

        Ok(output)
    }

    async fn execute_command(
        &self,
        input: &JobExecutionInput,
        resolved_command: &str,
    ) -> Result<JobExecutionOutput, WorkerError> {
        let mut cmd = Command::new("/bin/sh");
        cmd.arg("-c").arg(resolved_command);

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_command_simple() {
        let mut tool_paths = HashMap::new();
        tool_paths.insert("nuclei".to_string(), PathBuf::from("/tools/nuclei"));
        let executor = JobExecutor::new(300, tool_paths);

        let result = executor.resolve_command("nuclei -u http://example.com -silent");
        assert_eq!(result, "/tools/nuclei -u http://example.com -silent");
    }

    #[test]
    fn test_resolve_command_piped() {
        let mut tool_paths = HashMap::new();
        tool_paths.insert("subfinder".to_string(), PathBuf::from("/tools/subfinder"));
        tool_paths.insert("dnsx".to_string(), PathBuf::from("/tools/dnsx"));
        let executor = JobExecutor::new(300, tool_paths);

        let result = executor.resolve_command(
            "(echo example.com && subfinder -duc -d example.com) | dnsx -duc -a -resp"
        );
        assert!(result.contains("/tools/subfinder"));
        assert!(result.contains("/tools/dnsx"));
        assert!(!result.contains(" subfinder "));
        assert!(!result.contains(" dnsx "));
    }

    #[test]
    fn test_resolve_command_httpx() {
        let mut tool_paths = HashMap::new();
        tool_paths.insert("httpx".to_string(), PathBuf::from("/tools/httpx"));
        let executor = JobExecutor::new(300, tool_paths);

        let result = executor.resolve_command("httpx -duc -u {{value}} -status-code -silent");
        assert_eq!(result, "/tools/httpx -duc -u {{value}} -status-code -silent");
    }

    #[test]
    fn test_resolve_command_no_tools() {
        let tool_paths = HashMap::new();
        let executor = JobExecutor::new(300, tool_paths);

        let result = executor.resolve_command("echo hello");
        assert_eq!(result, "echo hello");
    }

    #[test]
    fn test_resolve_command_naabu() {
        let mut tool_paths = HashMap::new();
        tool_paths.insert("naabu".to_string(), PathBuf::from("/tools/naabu"));
        let executor = JobExecutor::new(300, tool_paths);

        let result = executor.resolve_command("naabu -host example.com -silent");
        assert_eq!(result, "/tools/naabu -host example.com -silent");
    }
}
