import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { AttackSurfaceQueryService } from '@/modules/attack-surface-query/attack-surface-query.service';
import { CATALOG, catalogCheatSheet } from '@/modules/attack-surface-query/catalog/catalog';
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
  "The only tool for the workspace's attack surface: targets, hosts, services (open ports), HTTP responses, technologies, TLS certificates, URLs, IPs, DNS records, findings (vulnerabilities) and counts (rollups). Use it for every question about them (lists, lookups, filters, counts); never answer one from memory or from earlier messages.",
  'Rules: (1) use only the resource and field names listed below, unknown names are errors; (2) answer the whole question in one call, up to 5 named queries; (3) select = fields of the row or of a related row ("host.value", "http.title"); lists (technologies, services, vulnerabilities…) go in include or where, never in select; (4) no window = all time, "window": { "since": "now-7d" } = recent only (on firstSeen); (5) limit ≤ 200, include limit ≤ 20, keep limit × include limit small; (6) on an error, read every issue (it lists the valid names) and resend the whole call fixed, once.',
  'Shape: { "queries": { "<name>": { "from": "<resource>", "select": [...], "where": { "logic": "and", "items": [ { "field": "port", "op": "in", "value": ["80", "443"] } ] }, "include": { "<list>": { "select": [...], "limit": 5 } }, "orderBy": [ { "field": "firstSeen", "dir": "desc" } ], "limit": 50 } } }. Count: { "from": "services", "groupBy": ["port"], "aggregate": { "n": { "fn": "count" } } }. Values are strings; times are now, now-<n><m|h|d|w> or ISO 8601 with an offset. More rows: resend the same query with "cursor": <nextCursor>.',
  'Resources (name:type, text when no type; every row also has id; related: select "<relation>.<field>"; lists: include or where):',
  ...catalogCheatSheet(CATALOG),
  'Operators per type, aggregates, paging and ready-made queries: load_skill "attack-surface-query". projectId restricts every query to that project\'s assets.',
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
