/**
 * Where the full stdout of run_tool_connector / execute_remote_command is
 * kept (Redis only, never the database). read_tool_output pages it and
 * propose_vulnerability checks quoted evidence against it.
 */
export const AGENT_TOOL_OUTPUT_TTL_SECONDS = 3600;

export const toolOutputKey = (conversationId: string, runId: string) =>
  `agent:tool-output:${conversationId}:${runId}`;
