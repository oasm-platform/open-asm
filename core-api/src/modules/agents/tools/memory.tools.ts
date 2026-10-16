import type { Tool } from 'ai';
import { z } from 'zod';

import { defineTool, failSoft } from './helpers';
import type { Deps } from './types';

/**
 * Short-term memory (stm_*) lives with the conversation; long-term memory
 * (ltm_*) with the user in the workspace, across conversations.
 */
export function memoryTools(
  deps: Deps<'agentsMemories'>,
  workspaceId: string,
  userId: string,
  conversationId: string,
): Record<string, Tool> {
  const memories = deps.agentsMemories;

  const stmWrite = defineTool({
    description:
      'Save a key-value pair to short-term memory (conversation scope). ' +
      'Use this to remember important findings during execution (e.g., discovered IPs, scan results, target info).',
    inputSchema: z.object({
      key: z
        .string()
        .min(1)
        .describe(
          'Memory key (e.g. "target_info", "open_ports", "scan_results")',
        ),
      value: z.string().min(1).describe('Memory value to store'),
    }),
    execute: (params: { key: string; value: string }) =>
      failSoft('store memory', async () => {
        await memories.stmSet(conversationId, params.key, params.value);
        return {
          success: true,
          message: `Stored "${params.key}" in short-term memory.`,
        };
      }),
  });

  const stmRead = defineTool({
    description: 'Read a value from short-term memory by key.',
    inputSchema: z.object({
      key: z.string().describe('Memory key to read'),
    }),
    execute: (params: { key: string }) =>
      failSoft('read memory', async () => {
        const entry = await memories.stmGet(conversationId, params.key);
        if (!entry) {
          return {
            found: false,
            message: `No memory found for key "${params.key}".`,
          };
        }
        return {
          found: true,
          key: entry.key,
          value: entry.value,
          updatedAt: entry.updatedAt,
        };
      }),
  });

  const stmList = defineTool({
    description: 'List all short-term memory entries for this conversation.',
    inputSchema: z.object({}),
    execute: () =>
      failSoft('list memories', async () => {
        const entries = await memories.stmGetAll(conversationId);
        return {
          count: entries.length,
          entries: entries.map((e) => ({
            key: e.key,
            value: e.value,
            updatedAt: e.updatedAt,
          })),
        };
      }),
  });

  const ltmWrite = defineTool({
    description:
      'Save important information to long-term memory (workspace scope, persists across conversations). ' +
      'Use this for persistent knowledge like target profiles, known vulnerabilities, organizational policies.',
    inputSchema: z.object({
      content: z
        .string()
        .min(1)
        .describe('Content to store in long-term memory'),
    }),
    execute: (params: { content: string }) =>
      failSoft('save LTM', async () => {
        await memories.ltmSet(workspaceId, userId, params.content);
        return { success: true, message: 'Saved to long-term memory.' };
      }),
  });

  const ltmAppend = defineTool({
    description:
      'Append information to existing long-term memory (keeps previous content).',
    inputSchema: z.object({
      content: z
        .string()
        .min(1)
        .describe('Content to append to existing long-term memory'),
    }),
    execute: (params: { content: string }) =>
      failSoft('append LTM', async () => {
        const existing = await memories.ltmGet(workspaceId, userId);
        const newContent = existing?.content
          ? `${existing.content}\n\n${params.content}`
          : params.content;
        await memories.ltmSet(workspaceId, userId, newContent);
        return { success: true, message: 'Appended to long-term memory.' };
      }),
  });

  const ltmRead = defineTool({
    description: 'Read the current long-term memory content.',
    inputSchema: z.object({}),
    execute: () =>
      failSoft('read LTM', async () => {
        const record = await memories.ltmGet(workspaceId, userId);
        return { content: record?.content || '(empty)' };
      }),
  });

  return {
    stm_write: stmWrite,
    stm_read: stmRead,
    stm_list: stmList,
    ltm_write: ltmWrite,
    ltm_append: ltmAppend,
    ltm_read: ltmRead,
  };
}
