import type { Tool } from 'ai';
import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import type { RemoteExecuteService } from '@/modules/remote-execute/remote-execute.service';

import { defineTool, errorMessage } from './helpers';
import type { Deps, ToolCallOptions } from './types';

const logger = new Logger('AgentTool');

/** The worker's whole budget for one run_tool_connector, connect included. */
export const AGENT_TOOL_RUN_TIMEOUT_MS = 5 * 60_000;
/** Core waits this much past the budget for the worker's final event. */
const AGENT_TOOL_RESULT_GRACE_MS = 30_000;
/** What one run_tool_connector / read_tool_output answer puts into the LLM context. */
const AGENT_TOOL_OUTPUT_PAGE = 8 * 1024;
/** Full output kept for read_tool_output: Redis only, never the database. */
const AGENT_TOOL_OUTPUT_STORE_MAX = 10 * 1024 * 1024;
const AGENT_TOOL_OUTPUT_TTL_SECONDS = 3600;

const toolOutputKey = (conversationId: string, runId: string) =>
  `agent:tool-output:${conversationId}:${runId}`;

/** Output lines; a trailing newline ends the last line, it opens no new one. */
function outputLines(raw: string): string[] {
  if (raw === '') return [];
  const lines = raw.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/**
 * What the model gets of a tool's stdout: its first page and, when there is
 * more, a runId under which read_tool_output pages through the rest.
 */
export async function pageForModel(
  deps: Deps<'redisService'>,
  conversationId: string,
  runId: string,
  stdout: string,
) {
  const truncated = stdout.length > AGENT_TOOL_OUTPUT_PAGE;
  let stored = false;
  if (truncated) {
    try {
      await deps.redisService.setex(
        toolOutputKey(conversationId, runId),
        AGENT_TOOL_OUTPUT_TTL_SECONDS,
        stdout,
      );
      stored = true;
    } catch (error) {
      logger.warn(`Failed to keep tool output ${runId}: ${errorMessage(error)}`);
    }
  }
  return {
    stdout: stdout.slice(0, AGENT_TOOL_OUTPUT_PAGE),
    truncated,
    totalLines: outputLines(stdout).length,
    ...(stored ? { runId } : {}),
  };
}

/** Required config fields of a connector that `config` leaves empty. */
function missingRequiredConfig(
  schema: Record<string, unknown> | undefined,
  config: Record<string, unknown> | undefined,
): string[] {
  const required = Array.isArray(schema?.required)
    ? (schema.required as unknown[]).filter(
        (key): key is string => typeof key === 'string',
      )
    : [];
  return required.filter((key) => {
    const value = config?.[key];
    return value === undefined || value === null || value === '';
  });
}

/**
 * A JSON line (an object, or an array of objects as nuclei prints) cut down
 * to `fields`; any other line is returned as is.
 */
function pickJsonFields(line: string, fields: string[]): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return line;
  }
  const pick = (value: unknown) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          fields
            .filter((key) => key in value)
            .map((key) => [key, (value as Record<string, unknown>)[key]]),
        )
      : value;
  if (Array.isArray(parsed)) return JSON.stringify(parsed.map(pick));
  if (parsed && typeof parsed === 'object') return JSON.stringify(pick(parsed));
  return line;
}

/**
 * One page of a stored tool output: lines from `offset` (into the matching
 * lines when `pattern` is set, a case-insensitive substring), at most `limit`
 * lines and AGENT_TOOL_OUTPUT_PAGE characters. Lines are numbered 1-based as
 * in the full output. With `fields`, JSON lines keep only those keys.
 */
export function pageToolOutput(
  raw: string,
  {
    offset,
    limit,
    pattern,
    fields,
  }: { offset: number; limit: number; pattern?: string; fields?: string[] },
) {
  const lines = outputLines(raw);
  const needle = pattern?.toLowerCase();
  const picked: number[] = [];
  lines.forEach((line, i) => {
    if (!needle || line.toLowerCase().includes(needle)) picked.push(i);
  });

  let output = '';
  let next = offset;
  for (const i of picked.slice(offset, offset + limit)) {
    const line = fields?.length ? pickJsonFields(lines[i], fields) : lines[i];
    const row = `${i + 1}: ${line}\n`;
    const room = AGENT_TOOL_OUTPUT_PAGE - output.length;
    if (row.length > room) {
      // A single oversized line still advances, cut, so paging cannot stall.
      if (output === '') {
        output = `${row.slice(0, room - 15)} …[line cut]\n`;
        next++;
      }
      break;
    }
    output += row;
    next++;
  }
  return {
    totalLines: lines.length,
    ...(needle ? { matchedLines: picked.length } : {}),
    offset,
    nextOffset: next < picked.length ? next : null,
    output,
  };
}

/**
 * run_tool_connector: runs one connector flagged `agentTool: true` against one target
 * on the conversation's worker and returns the worker's raw output. Not a
 * job: nothing goes through the job registry or the database. Agent-only,
 * off the MCP surface, and approval-gated like any mutating tool (the
 * target is free text).
 */
export function runConnectorTool(
  deps: Deps<
    | 'connectorRegistry'
    | 'toolsService'
    | 'remoteExecuteSubscribe'
    | 'toolConfigProfiles'
    | 'remoteExecuteService'
    | 'redisService'
  >,
  workspaceId: string,
  conversationId: string,
): Tool | null {
  // Runs on the conversation's pinned worker, so none without a conversation.
  if (!conversationId) return null;
  const connectors = deps.connectorRegistry.getAgentConnectors();
  if (connectors.length === 0) return null;

  const inputSchema = z.object({
    tool: z
      .enum(connectors.map((entry) => entry.slug) as [string, ...string[]])
      .describe('Connector slug to run'),
    target: z
      .string()
      .min(1)
      .describe('Target passed to the tool: domain, IP, host:port or URL'),
    configProfileId: z.string().uuid().optional(),
  });
  const catalog = connectors
    .map(
      (entry) =>
        `- ${entry.slug}: ${entry.shortDescription ?? entry.description ?? ''}`,
    )
    .join('\n');

  return defineTool({
    description: [
      "Run one security tool against one target on this conversation's worker and get its raw output.",
      'Nothing is saved: results are not stored as assets or vulnerabilities.',
      `Waits up to ${AGENT_TOOL_RUN_TIMEOUT_MS / 60_000} minutes. Output: stdout (first ${AGENT_TOOL_OUTPUT_PAGE / 1024}KB), exitCode, error, timedOut, truncated, totalLines.`,
      'When truncated is true the full output is kept for 1 hour: read it with read_tool_output(runId), filtering with pattern instead of paging through everything.',
      'Params: tool (slug), target, optional configProfileId.',
      'Tools:',
      catalog,
    ].join('\n'),
    inputSchema,
    execute: async (
      params: z.infer<typeof inputSchema>,
      options: ToolCallOptions,
    ) => {
      const { tool: slug, target, configProfileId } = params;
      const entry = deps.connectorRegistry.getConnector(slug);
      // Tool.name IS the connector slug; getToolById sets isInstalled from
      // an enabled workspace_tools row, so a connector of another workspace
      // (or one disabled here) cannot run.
      const [toolRow] = await deps.toolsService.getToolByNames({
        names: [slug],
      });
      const installed = toolRow?.id
        ? await deps.toolsService.getToolById(toolRow.id, workspaceId)
        : null;
      if (!entry?.image || !installed?.isInstalled) {
        return { error: `Tool ${slug} is not installed in this workspace.` };
      }

      const pick = await deps.remoteExecuteSubscribe.pickConversationWorker(
        conversationId,
        workspaceId,
      );
      if (!pick) {
        return {
          error:
            'No worker available for this workspace. Select a workspace worker for this conversation.',
        };
      }

      let config: Record<string, unknown> | undefined;
      try {
        config = await deps.toolConfigProfiles.resolveConfigForJob(
          workspaceId,
          installed.id!,
          { configProfileId },
        );
      } catch (error) {
        return { error: errorMessage(error) };
      }
      const missing = missingRequiredConfig(entry.configSchema, config);
      if (missing.length > 0) {
        return {
          error: `Tool ${slug} needs configuration (${missing.join(', ')}). Add a config profile for it in this workspace.`,
        };
      }

      const limits = deps.connectorRegistry.getResourceDefaults(slug);
      // The worker kills the run when core stops waiting, so the manifest
      // timeout only ever shortens the budget.
      const budgetSeconds = AGENT_TOOL_RUN_TIMEOUT_MS / 1000;
      const timeoutSeconds = Math.min(
        limits.timeoutSeconds || budgetSeconds,
        budgetSeconds,
      );
      const runId = randomUUID();
      let result: Awaited<ReturnType<RemoteExecuteService['waitForToolRun']>>;
      try {
        // No live stream: the chat renders no terminal for run_tool_connector, so
        // per-chunk events only cost re-renders.
        result = await deps.remoteExecuteService.waitForToolRun(
          pick.workerId,
          {
            tool: slug,
            image: entry.image,
            target,
            configJson:
              config && Object.keys(config).length > 0
                ? JSON.stringify(config)
                : '',
            cpu: limits.cpu,
            memory: limits.memory,
            timeoutSeconds,
          },
          runId,
          timeoutSeconds * 1000 + AGENT_TOOL_RESULT_GRACE_MS,
          {
            abortSignal: options.abortSignal,
            maxOutputChars: AGENT_TOOL_OUTPUT_STORE_MAX,
            onPushed: pick.pin
              ? () =>
                  deps.remoteExecuteSubscribe.pinConversationWorker(
                    conversationId,
                    pick.workerId,
                  )
              : undefined,
          },
        );
      } catch (error) {
        // The worker stream closed between resolving and pushing.
        return { error: errorMessage(error) };
      }
      // stdout is already capped at AGENT_TOOL_OUTPUT_STORE_MAX, so
      // totalLines matches what read_tool_output pages over.
      const page = await pageForModel(deps, conversationId, runId, result.stdout);
      return {
        tool: slug,
        target,
        stdout: page.stdout,
        exitCode: result.exitCode,
        error: result.error,
        timedOut: result.timedOut,
        truncated: page.truncated,
        totalLines: page.totalLines,
        ...(page.runId ? { runId: page.runId } : {}),
        ...(result.stdoutTruncated
          ? { note: 'Output over 10MB: only the first 10MB is kept.' }
          : {}),
      };
    },
  });
}

const readToolOutputSchema = z.object({
  runId: z
    .string()
    .uuid()
    .describe('runId returned by run_tool_connector or execute_remote_command'),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Line to start from (into the matching lines with pattern)'),
  limit: z.number().int().min(1).max(1000).optional(),
  pattern: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe('Keep only lines containing this text (case-insensitive)'),
  fields: z
    .array(z.string().min(1).max(100))
    .min(1)
    .max(20)
    .optional()
    .describe(
      'For JSON lines: keep only these top-level keys (e.g. ["name","severity","matched_at"])',
    ),
});

/** Pages through a tool output kept in Redis for this conversation. */
export function readToolOutputTool(
  deps: Deps<'redisService'>,
  conversationId: string,
): Tool {
  return defineTool({
    description: [
      'Read the full output of a run_tool_connector or execute_remote_command call that came back truncated.',
      `Returns at most ${AGENT_TOOL_OUTPUT_PAGE / 1024}KB per call, lines numbered as in the full output; continue from nextOffset.`,
      'Prefer pattern (e.g. "200", "admin") to pull only the relevant lines.',
      'When each line is a JSON record (e.g. nuclei findings), pass fields to keep only the keys you need: far fewer calls than paging whole records.',
      'Params: runId, optional offset (default 0), limit (default 200), pattern, fields.',
    ].join('\n'),
    inputSchema: readToolOutputSchema,
    execute: async (params: z.infer<typeof readToolOutputSchema>) => {
      const raw = await deps.redisService.get(
        toolOutputKey(conversationId, params.runId),
      );
      if (raw === null) {
        return {
          error:
            'No stored output for this runId (expired after 1 hour or unknown). Run the tool again.',
        };
      }
      return {
        runId: params.runId,
        ...pageToolOutput(raw, {
          offset: params.offset ?? 0,
          limit: params.limit ?? 200,
          pattern: params.pattern,
          fields: params.fields,
        }),
      };
    },
  });
}
