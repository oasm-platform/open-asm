export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface McpResource {
  uri: string;
  name: string;
  mimeType?: string;
}

export interface McpServerConfig {
  url?: string;
  headers?: Record<string, string>;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  disabled?: boolean;
  allowed_tools?: string[] | null; // null or empty means all tools allowed
  timeout?: number; // timeout in seconds, default 60
}

export interface McpServerConfigWithStatus extends McpServerConfig {
  active: boolean;
  status: 'active' | 'disabled' | 'error';
  error?: string;
  tools?: McpTool[];
  resources?: McpResource[];
}

export interface ApiError {
  response?: {
    data?: {
      message?: string;
    };
  };
  message?: string;
}
