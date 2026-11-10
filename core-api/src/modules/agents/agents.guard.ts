import type { UserContextPayload } from '@/common/interfaces/app.interface';
import { ProjectScopeRuleMode, ProjectScopeRuleType } from '@/common/enums/enum';
import { WorkspacesService } from '@/modules/workspaces/workspaces.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { CreateToolRuleDto, UpdateToolRuleDto } from './dto/tool-rule.dto';
import { AgentToolRule } from './entities/agent-tool-rule.entity';
import { AgentToolRuleAction } from './enums/agent.enums';
import { matchBuiltinDeny } from './guard/command-deny';
import {
  entriesFor,
  hostsInCommand,
  parseScopeTarget,
  scopeVerdict,
  type ScopeEntry,
} from './guard/target-scope';
import { matchToolRule } from './guard/tool-rules';
import { stableStringify } from './tools/helpers';

/** Why the guard decided a call; stored in the tool call's result. */
export interface ToolPolicy {
  decision: 'deny' | 'ask' | 'allow';
  source: 'builtin' | 'rule' | 'scope';
  ruleId?: string;
  reason: string;
}

export type GuardVerdict =
  | { action: 'deny'; policy: ToolPolicy; message: string }
  | { action: 'ask' | 'allow'; policy: ToolPolicy }
  | { action: 'default' };

export interface GuardCall {
  tool: string;
  input: unknown;
  workspaceId: string;
  conversationId: string;
  /** Run the built-in deny list on the input (commands, external MCP tools) */
  builtin?: boolean;
}

/** Tools whose input names targets in a structured field: out of scope is refused. */
const STRUCTURED_TARGETS: Record<string, (input: Record<string, unknown>) => unknown[]> = {
  run_tool_connector: (i) => [i.target],
  dispatch_subagent: (i) => (Array.isArray(i.targets) ? (i.targets as unknown[]) : []),
};

const RULES_TTL_MS = 30_000;

/**
 * The approval-meta part of a verdict: `ask` forces the prompt (even in AUTO)
 * with the reason in front of the description; `allow` skips it.
 */
export function guardApprovalMeta(
  verdict: GuardVerdict,
  description: unknown,
): { escalate?: boolean; preApproved?: boolean; description?: string } {
  const text = typeof description === 'string' ? description : undefined;
  if (verdict.action === 'ask') {
    return {
      escalate: true,
      description: `Needs approval: ${verdict.policy.reason}.${text ? ` ${text}` : ''}`,
    };
  }
  return { description: text, ...(verdict.action === 'allow' ? { preApproved: true } : {}) };
}

export const platformRefusal = (ruleId: string, reason: string) =>
  `Blocked by OASM platform policy [${ruleId}]: ${reason}. This is a fixed safety rule the platform enforces on every agent run, not a firewall or filter on the target, so rewording, encoding, splitting or chaining the command will not get past it and must not be attempted. Do not retry; continue with a non-destructive approach, or tell the user this has to be done outside OASM.`;

/**
 * Code-enforced checks on agent tool calls, run before the approval flow in
 * every mode: the built-in deny list, the workspace tool rules, and the scope
 * gate (targets must be inside the workspace targets or the project scope).
 */
@Injectable()
export class AgentsGuardService {
  private readonly rulesCache = new Map<string, { at: number; rules: AgentToolRule[] }>();

  constructor(
    @InjectRepository(AgentToolRule)
    private readonly ruleRepo: Repository<AgentToolRule>,
    private readonly dataSource: DataSource,
    private readonly workspacesService: WorkspacesService,
  ) {}

  async evaluate(call: GuardCall): Promise<GuardVerdict> {
    const input = (call.input ?? {}) as Record<string, unknown>;
    const command =
      call.tool === 'execute_remote_command' ? typeof input.command === 'string' ? input.command : '' : null;
    const subject = command ?? stableStringify(call.input);

    const builtin = call.builtin ? matchBuiltinDeny(subject) : null;
    if (builtin) {
      return {
        action: 'deny',
        policy: { decision: 'deny', source: 'builtin', ...builtin },
        message: platformRefusal(builtin.ruleId, builtin.reason),
      };
    }

    const rule = matchToolRule(await this.rulesFor(call.workspaceId), call.tool, subject);
    if (rule?.action === AgentToolRuleAction.DENY) {
      const reason = rule.description || 'denied by a workspace tool rule';
      return {
        action: 'deny',
        policy: { decision: 'deny', source: 'rule', ruleId: rule.id, reason },
        message: `Blocked by a tool rule of this workspace [${rule.id}]: ${reason}. The workspace administrators set it; do not retry or work around it. Continue another way, or tell the user.`,
      };
    }

    const structured = STRUCTURED_TARGETS[call.tool]?.(input);
    const scope = await this.checkScope(call, structured, command);
    if (scope) {
      if (scope.action !== 'ask' || rule?.action !== AgentToolRuleAction.ALLOW) {
        return scope;
      }
    }
    if (rule) {
      const decision = rule.action === AgentToolRuleAction.ASK ? 'ask' : 'allow';
      return {
        action: decision,
        policy: {
          decision,
          source: 'rule',
          ruleId: rule.id,
          reason: rule.description || `workspace tool rule (${decision})`,
        },
      };
    }
    return { action: 'default' };
  }

  /**
   * Structured targets outside scope are refused; hosts read from a shell
   * command (best effort) ask instead, even in AUTO. Excluded ones are refused.
   */
  private async checkScope(
    call: GuardCall,
    structured: unknown[] | undefined,
    command: string | null,
  ): Promise<GuardVerdict | null> {
    const raw = structured ?? [];
    const targets = structured
      ? raw.map((t) => (typeof t === 'string' ? parseScopeTarget(t) : null))
      : command
        ? hostsInCommand(command)
        : [];
    if (targets.length === 0) return null;
    const scope = await this.scopeOf(
      call.workspaceId,
      call.conversationId,
      targets.flatMap((t) => (t ? [t.value] : [])),
    );
    const blocked: string[] = [];
    const outside: string[] = [];
    targets.forEach((t, i) => {
      const verdict = t ? scopeVerdict(t, scope.entries, scope.known) : 'outside';
      const label = t?.value ?? String(raw[i]);
      if (verdict === 'blocked') blocked.push(label);
      else if (verdict === 'outside') outside.push(label);
    });
    const where = scope.project ? "the project's scope" : 'the workspace targets';
    if (blocked.length > 0 || (structured && outside.length > 0)) {
      const names = [...blocked, ...outside].join(', ');
      const reason = blocked.length
        ? `${names} is excluded from ${where}`
        : `${names} is outside ${where}`;
      return {
        action: 'deny',
        policy: { decision: 'deny', source: 'scope', reason },
        message: `Not executed: ${reason}. Only targets in ${where} may be tested. This is a platform rule, not a network filter: do not try to reach it another way. If it should be tested, ask the user to add it to ${where}.`,
      };
    }
    if (outside.length > 0) {
      return {
        action: 'ask',
        policy: { decision: 'ask', source: 'scope', reason: `${outside.join(', ')} may be outside ${where}` },
      };
    }
    return null;
  }

  /**
   * The conversation's scope: its project's rules when the project has an
   * include rule, else the workspace targets (plus the project's excludes).
   * `known` holds those of `values` that are assets of that scope.
   */
  private async scopeOf(
    workspaceId: string,
    conversationId: string,
    values: string[],
  ): Promise<{ entries: ScopeEntry[]; known: Set<string>; project: boolean }> {
    const [conversation] = await this.dataSource.query<Array<{ projectId: string | null }>>(
      `SELECT "projectId" FROM agent_conversations WHERE id = $1 AND "workspaceId" = $2`,
      [conversationId, workspaceId],
    );
    const projectId = conversation?.projectId ?? null;
    const rules = projectId
      ? await this.dataSource.query<
          Array<{ mode: ProjectScopeRuleMode; type: ProjectScopeRuleType; value: string; resolved: string | null }>
        >(
          `SELECT r.mode, r.type, r.value, COALESCE(t.value, a.value) AS resolved
           FROM project_scope_rules r
           LEFT JOIN targets t ON r.type = 'target' AND t.id::text = r.value
           LEFT JOIN assets a ON r.type = 'asset' AND a.id::text = r.value
           WHERE r."projectId" = $1`,
          [projectId],
        )
      : [];
    const entries = rules.flatMap((r) =>
      entriesFor(
        r.resolved ?? r.value,
        r.mode === ProjectScopeRuleMode.EXCLUDE,
        r.type === ProjectScopeRuleType.TARGET,
      ),
    );
    const project = rules.some((r) => r.mode === ProjectScopeRuleMode.INCLUDE);
    if (!project) {
      const targets = await this.dataSource.query<Array<{ value: string }>>(
        `SELECT value FROM targets WHERE "workspaceId" = $1 AND type IN ('DOMAIN', 'IP', 'CIDR')`,
        [workspaceId],
      );
      entries.push(...targets.flatMap((t) => entriesFor(t.value, false)));
    }
    const known = values.length
      ? await this.dataSource.query<Array<{ value: string }>>(
          project
            ? `SELECT a.value FROM project_assets pa JOIN assets a ON a.id = pa."assetId" WHERE pa."projectId" = $1 AND a.value = ANY($2)`
            : `SELECT a.value FROM assets a JOIN targets t ON t.id = a."targetId" WHERE t."workspaceId" = $1 AND a.value = ANY($2)`,
          [project ? projectId : workspaceId, values],
        )
      : [];
    return { entries, known: new Set(known.map((k) => k.value.toLowerCase())), project };
  }

  private async rulesFor(workspaceId: string): Promise<AgentToolRule[]> {
    const hit = this.rulesCache.get(workspaceId);
    if (hit && Date.now() - hit.at < RULES_TTL_MS) return hit.rules;
    const rules = await this.ruleRepo.find({ where: { workspaceId, enabled: true } });
    this.rulesCache.set(workspaceId, { at: Date.now(), rules });
    return rules;
  }

  // ---- CRUD (workspace owner only for writes, like skills) ----

  listRules(workspaceId: string): Promise<AgentToolRule[]> {
    return this.ruleRepo.find({
      where: { workspaceId },
      order: { priority: 'DESC', createdAt: 'ASC' },
    });
  }

  async createRule(workspaceId: string, userId: string, dto: CreateToolRuleDto) {
    await this.assertOwner(workspaceId, userId);
    const saved = await this.ruleRepo.save(
      this.ruleRepo.create({ ...dto, workspaceId, createdBy: userId }),
    );
    this.rulesCache.delete(workspaceId);
    return saved;
  }

  async updateRule(workspaceId: string, userId: string, id: string, dto: UpdateToolRuleDto) {
    await this.assertOwner(workspaceId, userId);
    const rule = await this.findRule(workspaceId, id);
    Object.assign(rule, dto);
    const saved = await this.ruleRepo.save(rule);
    this.rulesCache.delete(workspaceId);
    return saved;
  }

  async deleteRule(workspaceId: string, userId: string, id: string): Promise<void> {
    await this.assertOwner(workspaceId, userId);
    await this.ruleRepo.remove(await this.findRule(workspaceId, id));
    this.rulesCache.delete(workspaceId);
  }

  private async findRule(workspaceId: string, id: string): Promise<AgentToolRule> {
    const rule = await this.ruleRepo.findOne({ where: { id, workspaceId } });
    if (!rule) throw new NotFoundException('Tool rule not found');
    return rule;
  }

  private assertOwner(workspaceId: string, userId: string) {
    return this.workspacesService.getWorkspaceByIdAndOwner(workspaceId, {
      id: userId,
    } as UserContextPayload);
  }
}
