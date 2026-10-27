import type { Tool } from 'ai';
import { z } from 'zod';

import type { AgentWorkspaceMemory } from '../entities/agent-workspace-memory.entity';
import { defineTool, failSoft, pageOf } from './helpers';
import type { Deps } from './types';

const toMemory = (r: AgentWorkspaceMemory) => ({
  id: r.id,
  content: r.content,
  updatedAt: r.updatedAt,
});

/**
 * Short-term memory (stm_*) lives with the conversation; long-term memory
 * (ltm_*) with the user in the workspace, across conversations, one record
 * per memory.
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
      'Save one piece of knowledge to long-term memory (workspace scope, persists across conversations) as its own record; earlier memories are kept. ' +
      'Use this for persistent knowledge like target profiles, known vulnerabilities, organizational policies. ' +
      'Pass id (from ltm_read) to replace that memory instead, e.g. when it is outdated.',
    inputSchema: z.object({
      content: z
        .string()
        .min(1)
        .describe('Content to store in long-term memory'),
      id: z
        .string()
        .uuid()
        .optional()
        .describe('ID of the memory to replace; omit to save a new one'),
    }),
    execute: (params: { content: string; id?: string }) =>
      failSoft('save LTM', async () => {
        const record = params.id
          ? await memories.ltmUpdate(
              params.id,
              workspaceId,
              userId,
              params.content,
            )
          : await memories.ltmCreate(workspaceId, userId, params.content);
        return {
          success: true,
          id: record.id,
          message: params.id
            ? 'Updated long-term memory.'
            : 'Saved to long-term memory.',
        };
      }),
  });

  const ltmRead = defineTool({
    description:
      'List long-term memories with their IDs, newest first (100 per page), or read one by id.',
    inputSchema: z.object({
      id: z.string().uuid().optional().describe('Memory ID; omit to list'),
      page: z.number().int().min(1).optional().describe('Page of the list'),
    }),
    execute: (params: { id?: string; page?: number }) =>
      failSoft('read LTM', async () => {
        if (params.id) {
          const record = await memories.ltmGetById(
            params.id,
            workspaceId,
            userId,
          );
          if (!record) {
            return {
              found: false,
              message: `No memory found with id "${params.id}".`,
            };
          }
          return { found: true, ...toMemory(record) };
        }
        const { data, total } = await memories.ltmGetAllPaginated(
          workspaceId,
          userId,
          pageOf(params),
        );
        return { total, memories: data.map(toMemory) };
      }),
  });

  const ltmDelete = defineTool({
    description:
      'Delete one long-term memory by id (from ltm_read), e.g. when it is wrong or no longer relevant.',
    inputSchema: z.object({
      id: z.string().uuid().describe('Memory ID to delete'),
    }),
    execute: (params: { id: string }) =>
      failSoft('delete LTM', async () => {
        await memories.ltmDeleteById(params.id, workspaceId, userId);
        return { success: true, message: 'Deleted from long-term memory.' };
      }),
  });

  return {
    stm_write: stmWrite,
    stm_read: stmRead,
    stm_list: stmList,
    ltm_write: ltmWrite,
    ltm_read: ltmRead,
    ltm_delete: ltmDelete,
  };
}
