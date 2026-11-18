import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { AttackSurfaceQueryService } from '@/modules/attack-surface-query/attack-surface-query.service';
import { AsqError } from '@/modules/attack-surface-query/domain/query-errors';
import type { QueryScope } from '@/modules/attack-surface-query/domain/query.types';
import { WorkspacesService } from '@/modules/workspaces/workspaces.service';

import { AgentFunction } from './agent-function';
import { projectFor, projectIdInput } from './helpers';
import type { AgentFunctionContext } from './types';

/** What the OASM MCP server (API key, no member) may read. */
const MCP_PERMISSIONS = ['asset.read', 'vulnerability.read', 'target.read'] as const;

const queryInput = z.object({
  queries: z
    .record(z.string(), z.unknown())
    .describe('Named queries: { "<name>": { from, select?, include?, where?, window?, windowField?, groupBy?, aggregate?, orderBy?, limit?, cursor?, withTotal? } }'),
  window: z
    .object({ since: z.string(), until: z.string().optional() })
    .optional()
    .describe('Default time window of every query, e.g. { "since": "now-5d" }'),
  ...projectIdInput,
});

const QUERY_DESCRIPTION = [
  "Read the workspace's attack surface: targets, hosts, services (open ports), the latest HTTP response, technologies, TLS certificates, discovered URLs, IPs, DNS records, findings (vulnerabilities) and pre-computed counts (rollups). Use it for every listing, filter, lookup by id and count of these.",
  'Load the attack-surface-query skill (load_skill) before the first query of a task: it explains the language and has ready-made queries. describe_attack_surface lists every resource, field and operator you may use.',
  'Each query: from (resource), select (fields; dot paths reach a related row: "host.value", "http.title"), include (lists of related rows: { "technologies": { "select": ["name"], "limit": 5 } }),',
  'where ({ "logic": "and"|"or", "items": [ { "field", "op": eq|neq|contains|notContains|in|notIn|inSubnet|gt|gte|lt|lte, "value": string | string[] } ] }; "technologies.name" in where means "has a related row"),',
  'window ({ "since": "now-5d" } on firstSeen; "window": null for all time), groupBy + aggregate ({ "n": { "fn": "count" } }, countDistinct/min/max/avg), orderBy, limit (max 200), cursor (from nextCursor).',
  'Times: now, now-<n><m|h|d|w>, or ISO 8601 with an offset. projectId restricts every query to that project\'s assets. Errors come back as { error: { code, issues: [{ path, message }] } }: fix the query and call again.',
  'Example: { "window": { "since": "now-5d" }, "queries": { "newPorts": { "from": "services", "select": ["port", "host.value", "http.title"] }, "byPort": { "from": "services", "groupBy": ["port"], "aggregate": { "hosts": { "fn": "countDistinct", "field": "host.id" } } } } }',
];

/**
 * Attack surface queries for the agent and the OASM MCP server: the schema of
 * the query language, and running a batch. Read-only; the workspace (and the
 * conversation's project) come from the run, never from the model's input.
 * The tools only require membership: the engine checks the read permission
 * of every resource a query touches (asset.read, vulnerability.read,
 * target.read).
 */
@Injectable()
export class AttackSurfaceQueryTools {
  constructor(
    readonly attackSurfaceQuery: AttackSurfaceQueryService,
    readonly workspacesService: WorkspacesService,
  ) {}

  /** The caller of a run: the member's keys, or the fixed MCP read set. */
  private async scopeOf(ctx: AgentFunctionContext, projectId?: string): Promise<QueryScope> {
    if (!ctx.userId) {
      return { workspaceId: ctx.workspaceId, permissions: MCP_PERMISSIONS, caller: 'mcp', projectId };
    }
    const { permissionKeys } = await this.workspacesService.getMembershipWithPermissions(ctx.workspaceId, ctx.userId);
    return {
      workspaceId: ctx.workspaceId,
      permissions: permissionKeys,
      caller: 'agent',
      projectId,
      abortSignal: ctx.abortSignal,
    };
  }

  @AgentFunction({
    name: 'describe_attack_surface',
    description:
      'List the resources (targets, hosts, services, technologies, tls, urls, ips, dnsRecords, vulnerabilities, rollups), their fields, operators and relations that query_attack_surface accepts. Only resources you may read are listed.',
    permissions: [],
    readOnly: true,
    mcp: true,
  })
  async describe(_input: Record<string, never>, ctx: AgentFunctionContext) {
    const scope = await this.scopeOf(ctx, ctx.projectId ?? undefined);
    return { resources: this.attackSurfaceQuery.describe(scope, { compact: true }) };
  }

  @AgentFunction({
    name: 'query_attack_surface',
    description: QUERY_DESCRIPTION,
    inputSchema: queryInput,
    permissions: [],
    readOnly: true,
    mcp: true,
  })
  async query(input: z.infer<typeof queryInput>, ctx: AgentFunctionContext) {
    // The conversation's project wins over the model's projectId (projectFor).
    const { projectId, ...batch } = input;
    try {
      const scope = await this.scopeOf(ctx, projectFor(ctx, { projectId }));
      return await this.attackSurfaceQuery.run(scope, batch);
    } catch (err) {
      if (err instanceof AsqError) return { error: err.toJSON() };
      throw err;
    }
  }
}
