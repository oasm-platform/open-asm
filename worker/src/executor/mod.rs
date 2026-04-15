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
pub struct ToolValidationResult {
    pub tool_name: String,
    pub path: PathBuf,
    pub is_valid: bool,
    pub missing_deps: Vec<String>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone)]
pub struct JobExecutor {
    timeout_secs: u64,
    /// Map of tool name -> absolute path, used to replace bare tool names in commands.
    tool_paths: Arc<HashMap<String, PathBuf>>,
    /// Cache of tool validation results to avoid repeated checks.
    tool_validations: Arc<Mutex<Option<HashMap<String, ToolValidationResult>>>>,
}

impl JobExecutor {
    pub fn new(timeout_secs: u64, tool_paths: HashMap<String, PathBuf>) -> Self {
        Self {
            timeout_secs,
            tool_paths: Arc::new(tool_paths),
            tool_validations: Arc::new(Mutex::new(None)),
        }
    }

    /// Resolve tool paths from the tool manager and update the executor.
    pub async fn with_resolved_tools(tool_manager: &crate::tools::ToolManager, timeout_secs: u64) -> Self {
        let paths = tool_manager.get_all_tool_paths().await;
        let executor = Self::new(timeout_secs, paths);
        
        // Validate all tools at startup
        executor.validate_all_tools().await;
        
        executor
    }

    /// Validate all tools and cache the results.
    pub async fn validate_all_tools(&self) {
        let mut validations = HashMap::new();
        
        for (tool_name, tool_path) in self.tool_paths.iter() {
            let result = self.validate_tool(tool_name, tool_path).await;
            validations.insert(tool_name.clone(), result);
        }
        
        let mut cache = self.tool_validations.lock().await;
        *cache = Some(validations);
    }

    /// Validate a single tool by checking if it exists and has all required dependencies.
    async fn validate_tool(&self, tool_name: &str, tool_path: &PathBuf) -> ToolValidationResult {
        // Check if file exists
        if !tool_path.exists() {
            return ToolValidationResult {
                tool_name: tool_name.to_string(),
                path: tool_path.clone(),
                is_valid: false,
                missing_deps: vec![],
                error_message: Some("Binary not found".to_string()),
            };
        }

        // Check if file is executable
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Ok(metadata) = std::fs::metadata(tool_path) {
                let mode = metadata.permissions().mode();
                if mode & 0o111 == 0 {
                    return ToolValidationResult {
                        tool_name: tool_name.to_string(),
                        path: tool_path.clone(),
                        is_valid: false,
                        missing_deps: vec![],
                        error_message: Some("Not executable".to_string()),
                    };
                }
            }
        }

        // Check for missing shared library dependencies using ldd
        let missing_deps = self.check_missing_dependencies(tool_path).await;
        
        ToolValidationResult {
            tool_name: tool_name.to_string(),
            path: tool_path.clone(),
            is_valid: missing_deps.is_empty(),
            missing_deps,
            error_message: None,
        }
    }

    /// Check for missing shared library dependencies using ldd.
    #[allow(unused_mut)]
    async fn check_missing_dependencies(&self, tool_path: &PathBuf) -> Vec<String> {
        let mut missing = Vec::new();
        
        // Only check on Linux
        #[cfg(target_os = "linux")]
        {
            match Command::new("ldd")
                .arg(tool_path)
                .output()
                .await
            {
                Ok(output) => {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    for line in stdout.lines() {
                        if line.contains("not found") {
                            // Extract library name from "libfoo.so => not found"
                            if let Some(lib_name) = line.split_whitespace().next() {
                                missing.push(lib_name.to_string());
                            }
                        }
                    }
                }
                Err(e) => {
                    tracing::warn!("Failed to run ldd for {:?}: {}", tool_path, e);
                }
            }
        }
        
        // Suppress unused variable warning on non-linux platforms
        #[cfg(not(target_os = "linux"))]
        {
            let _ = tool_path;
        }

        missing
    }

    /// Check if tools used in a command are valid.
    /// Returns error details if any tool has missing dependencies.
    async fn validate_command_tools(&self, command: &str) -> Result<(), WorkerError> {
        // Extract tool names from command first (before acquiring lock)
        let delimiters = &[' ', '|', ';', '(', '\n', '\t', '&'];
        let command_tools: Vec<String> = command
            .split(|c| delimiters.contains(&c))
            .map(|s| s.to_string())
            .collect();

        // Get validations, refresh if needed
        let need_refresh = {
            let validations = self.tool_validations.lock().await;
            validations.is_none()
        };

        if need_refresh {
            self.validate_all_tools().await;
        }

        let validations = self.tool_validations.lock().await;
        let validations = match validations.as_ref() {
            Some(v) => v.clone(), // Clone to avoid borrow issues
            None => return Ok(()), // Should not happen, but be lenient
        };

        // Check each tool in the command
        for tool_name in &command_tools {
            if let Some(validation) = validations.get(tool_name) {
                if !validation.is_valid {
                    let missing = validation.missing_deps.join(", ");
                    let error_msg = if missing.is_empty() {
                        validation.error_message.clone().unwrap_or_else(|| "Unknown error".to_string())
                    } else {
                        format!("Missing dependencies: {}", missing)
                    };

                    tracing::error!(
                        "Tool '{}' is not functional: {} (path: {:?})",
                        tool_name, error_msg, validation.path
                    );

                    return Err(WorkerError::ToolDependencyMissing {
                        tool: tool_name.clone(),
                        message: error_msg,
                    });
                }
            }
        }

        Ok(())
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

        // Validate that tools used in the command have all dependencies met
        self.validate_command_tools(&input.command).await?;

        // Resolve tool paths in the command
        let resolved_command = self.resolve_command(&input.command);
        if resolved_command != input.command {
            tracing::debug!(
                job_id = %input.job_id,
                original = %input.command,
                resolved = %resolved_command,
                "Command resolved with full paths"
            );
        }

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
        let (shell, flag) = if cfg!(target_os = "windows") {
            ("cmd", "/C")
        } else {
            ("/bin/sh", "-c")
        };
        let mut cmd = Command::new(shell);
        cmd.arg(flag).arg(resolved_command);

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

        // Provide enhanced error message for exit code 127
        if exit_code == Some(127) {
            let stderr_output = stderr_lines.join("\n");
            let enhanced_error = if stderr_output.is_empty() {
                "Command not found or missing dependencies (stderr empty)".to_string()
            } else {
                format!("Command not found or missing dependencies: {}", stderr_output)
            };

            tracing::error!(
                job_id = %input.job_id,
                "Job failed with exit code 127"
            );

            return Err(WorkerError::JobExecution(enhanced_error));
        }

        tracing::debug!(
            job_id = %input.job_id,
            success = success,
            exit_code = ?exit_code,
            command = %input.command,
            "Job completed"
        );

        Ok(JobExecutionOutput {
            job_id: input.job_id.clone(),
            success,
            stdout: stdout_lines.join("\n"),
            stderr: stderr_lines.join("\n"),
            exit_code,
        })
    }

    /// Get validation status for all tools.
    pub async fn get_tool_validation_status(&self) -> HashMap<String, ToolValidationResult> {
        let validations = self.tool_validations.lock().await;
        validations.clone().unwrap_or_default()
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
