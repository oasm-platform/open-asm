import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { AgentsMemoriesService } from '../agents.memories';
import type { AgentWorkspaceMemory } from '../entities/agent-workspace-memory.entity';
import { AgentFunction } from './agent-function';
import { failSoft, pageOf } from './helpers';
import type { AgentFunctionContext } from './types';

const toMemory = (r: AgentWorkspaceMemory) => ({
  id: r.id,
  content: r.content,
  updatedAt: r.updatedAt,
});

const stmWriteInput = z.object({
  key: z
    .string()
    .min(1)
    .describe('Memory key (e.g. "target_info", "open_ports", "scan_results")'),
  value: z.string().min(1).describe('Memory value to store'),
});

const stmReadInput = z.object({
  key: z.string().describe('Memory key to read'),
});

const ltmWriteInput = z.object({
  content: z.string().min(1).describe('Content to store in long-term memory'),
  id: z
    .string()
    .uuid()
    .optional()
    .describe('ID of the memory to replace; omit to save a new one'),
});

const ltmReadInput = z.object({
  id: z.string().uuid().optional().describe('Memory ID; omit to list'),
  page: z.number().int().min(1).optional().describe('Page of the list'),
});

const ltmDeleteInput = z.object({
  id: z.string().uuid().describe('Memory ID to delete'),
});

/**
 * Short-term memory (stm_*) lives with the conversation; long-term memory
 * (ltm_*) with the user in the workspace, across conversations, one record
 * per memory. The run's own memory: ungated.
 */
@Injectable()
export class MemoryTools {
  constructor(readonly agentsMemories: AgentsMemoriesService) {}

  @AgentFunction({
    name: 'stm_write',
    description:
      'Save a key-value pair to short-term memory (conversation scope). ' +
      'Use this to remember important findings during execution (e.g., discovered IPs, scan results, target info).',
    inputSchema: stmWriteInput,
    permissions: 'ungated',
    gate: 'none',
  })
  stmWrite(params: z.infer<typeof stmWriteInput>, ctx: AgentFunctionContext) {
    return failSoft('store memory', async () => {
      await this.agentsMemories.stmSet(
        ctx.conversationId ?? '',
        params.key,
        params.value,
      );
      return {
        success: true,
        message: `Stored "${params.key}" in short-term memory.`,
      };
    });
  }

  @AgentFunction({
    name: 'stm_read',
    description: 'Read a value from short-term memory by key.',
    inputSchema: stmReadInput,
    permissions: 'ungated',
    gate: 'none',
  })
  stmRead(params: z.infer<typeof stmReadInput>, ctx: AgentFunctionContext) {
    return failSoft('read memory', async () => {
      const entry = await this.agentsMemories.stmGet(
        ctx.conversationId ?? '',
        params.key,
      );
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
    });
  }

  @AgentFunction({
    name: 'stm_list',
    description: 'List all short-term memory entries for this conversation.',
    permissions: 'ungated',
    gate: 'none',
  })
  stmList(_params: Record<string, never>, ctx: AgentFunctionContext) {
    return failSoft('list memories', async () => {
      const entries = await this.agentsMemories.stmGetAll(
        ctx.conversationId ?? '',
      );
      return {
        count: entries.length,
        entries: entries.map((e) => ({
          key: e.key,
          value: e.value,
          updatedAt: e.updatedAt,
        })),
      };
    });
  }

  @AgentFunction({
    name: 'ltm_write',
    description:
      'Save one piece of knowledge to long-term memory (workspace scope, persists across conversations) as its own record; earlier memories are kept. ' +
      'Use this for persistent knowledge like target profiles, known vulnerabilities, organizational policies. ' +
      'Pass id (from ltm_read) to replace that memory instead, e.g. when it is outdated.',
    inputSchema: ltmWriteInput,
    permissions: 'ungated',
    gate: 'none',
  })
  ltmWrite(params: z.infer<typeof ltmWriteInput>, ctx: AgentFunctionContext) {
    const { workspaceId } = ctx;
    const userId = ctx.userId ?? '';
    return failSoft('save LTM', async () => {
      const record = params.id
        ? await this.agentsMemories.ltmUpdate(
            params.id,
            workspaceId,
            userId,
            params.content,
          )
        : await this.agentsMemories.ltmCreate(
            workspaceId,
            userId,
            params.content,
          );
      return {
        success: true,
        id: record.id,
        message: params.id
          ? 'Updated long-term memory.'
          : 'Saved to long-term memory.',
      };
    });
  }

  @AgentFunction({
    name: 'ltm_read',
    description:
      'List long-term memories with their IDs, newest first (100 per page), or read one by id.',
    inputSchema: ltmReadInput,
    permissions: 'ungated',
    gate: 'none',
  })
  ltmRead(params: z.infer<typeof ltmReadInput>, ctx: AgentFunctionContext) {
    const { workspaceId } = ctx;
    const userId = ctx.userId ?? '';
    return failSoft('read LTM', async () => {
      if (params.id) {
        const record = await this.agentsMemories.ltmGetById(
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
      const { data, total } = await this.agentsMemories.ltmGetAllPaginated(
        workspaceId,
        userId,
        pageOf(params),
      );
      return { total, memories: data.map(toMemory) };
    });
  }

  @AgentFunction({
    name: 'ltm_delete',
    description:
      'Delete one long-term memory by id (from ltm_read), e.g. when it is wrong or no longer relevant.',
    inputSchema: ltmDeleteInput,
    permissions: 'ungated',
    gate: 'none',
  })
  ltmDelete(params: z.infer<typeof ltmDeleteInput>, ctx: AgentFunctionContext) {
    return failSoft('delete LTM', async () => {
      await this.agentsMemories.ltmDeleteById(
        params.id,
        ctx.workspaceId,
        ctx.userId ?? '',
      );
      return { success: true, message: 'Deleted from long-term memory.' };
    });
  }
}
