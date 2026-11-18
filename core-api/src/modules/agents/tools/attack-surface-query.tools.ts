import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { AttackSurfaceQueryService } from '@/modules/attack-surface-query/attack-surface-query.service';
import { AsqError } from '@/modules/attack-surface-query/domain/query-errors';
import type { QueryScope } from '@/modules/attack-surface-query/domain/query.types';
import { WorkspacesService } from '@/modules/workspaces/workspaces.service';

import { AgentFunction } from './agent-function';
import type { AgentFunctionContext } from './types';

/** What the OASM MCP server (API key, no member) may read. */
const MCP_PERMISSIONS = ['asset.read', 'vulnerability.read', 'target.read'] as const;

const queryInput = z.object({
  queries: z
    .record(z.string(), z.unknown())
    .describe('Named queries: { "<name>": { from, select?, include?, where?, window?, groupBy?, aggregate?, orderBy?, limit?, cursor? } }'),
  window: z
    .object({ since: z.string(), until: z.string().optional() })
    .optional()
    .describe('Default time window of every query, e.g. { "since": "now-5d" }'),
});

const QUERY_DESCRIPTION = [
  'Query the attack surface of the workspace with a JSON query batch (call describe_attack_surface first for resources and fields).',
  'Each query: from (resource), select (fields; dot paths reach a related row: "host.value", "http.title"), include (lists of related rows: { "technologies": { "select": ["name"], "limit": 5 } }),',
  'where ({ "logic": "and"|"or", "items": [ { "field", "op": eq|neq|contains|notContains|in|notIn|inSubnet|gt|gte|lt|lte, "value": string | string[] } ] }; "technologies.name" in where means "has a related row"),',
  'window ({ "since": "now-5d" } on firstSeen), groupBy + aggregate ({ "n": { "fn": "count" } }, countDistinct/min/max/avg), orderBy, limit (max 200), cursor (from nextCursor).',
  'Times: now, now-<n><m|h|d|w>, or ISO 8601 with an offset. Errors come back with the path of each problem: fix the query and call again.',
  'Example: { "window": { "since": "now-5d" }, "queries": { "newPorts": { "from": "services", "select": ["port", "host.value", "http.title"] }, "byPort": { "from": "services", "groupBy": ["port"], "aggregate": { "hosts": { "fn": "countDistinct", "field": "host.id" } } } } }',
];

/**
 * Attack surface queries for the agent and the OASM MCP server: the schema of
 * the query language, and running a batch. Read-only; the workspace (and the
 * conversation's project) come from the run, never from the model's input.
 */
@Injectable()
export class AttackSurfaceQueryTools {
  constructor(
    readonly attackSurfaceQuery: AttackSurfaceQueryService,
    readonly workspacesService: WorkspacesService,
  ) {}

  /** The caller of a run: the member's keys, or the fixed MCP read set. */
  private async scopeOf(ctx: AgentFunctionContext): Promise<QueryScope> {
    if (!ctx.userId) {
      return { workspaceId: ctx.workspaceId, permissions: MCP_PERMISSIONS, caller: 'mcp', projectId: ctx.projectId };
    }
    const { permissionKeys } = await this.workspacesService.getMembershipWithPermissions(ctx.workspaceId, ctx.userId);
    return {
      workspaceId: ctx.workspaceId,
      permissions: permissionKeys,
      caller: 'agent',
      projectId: ctx.projectId,
      abortSignal: ctx.abortSignal,
    };
  }

  @AgentFunction({
    name: 'describe_attack_surface',
    description:
      'List the resources (hosts, services, technologies, tls, urls, ips, dnsRecords, vulnerabilities, targets, rollups), their fields, operators and relations that query_attack_surface accepts.',
    permissions: ['asset.read'],
    readOnly: true,
    mcp: true,
  })
  async describe(_input: Record<string, never>, ctx: AgentFunctionContext) {
    const scope = await this.scopeOf(ctx);
    return { resources: this.attackSurfaceQuery.describe(scope, { compact: true }) };
  }

  @AgentFunction({
    name: 'query_attack_surface',
    description: QUERY_DESCRIPTION,
    inputSchema: queryInput,
    permissions: ['asset.read'],
    readOnly: true,
    mcp: true,
  })
  async query(input: z.infer<typeof queryInput>, ctx: AgentFunctionContext) {
    try {
      const scope = await this.scopeOf(ctx);
      return await this.attackSurfaceQuery.run(scope, input);
    } catch (err) {
      if (err instanceof AsqError) return { error: err.toJSON() };
      throw err;
    }
  }
}
