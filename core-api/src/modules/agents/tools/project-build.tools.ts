import type { Tool } from 'ai';
import { z } from 'zod';

import {
  AuditActorType,
  AuditOutcome,
  ProjectChange,
  ProjectScopeRuleMode,
  ProjectScopeRuleType,
  ProjectTriggerEvent,
  ProjectTriggerType,
  TargetType,
} from '@/common/enums/enum';
import type { UserContextPayload } from '@/common/interfaces/app.interface';
import { SortOrder } from '@/common/dtos/get-many-base.dto';
import { getManyBaseRequestSchema } from '@/mcp/mcp.schema';
import { EVENT_CATALOG } from '@/modules/event-bridge/contracts/event-catalog';

import { defineTool, pageOf, projectFor, projectIdInput } from './helpers';
import type { Deps, ToolScope } from './types';

// Tools that build and change projects: Agent mode only, each call behind
// approval, and each checks the member's workspace permission like the API.

const denied = (key: string) =>
  `Not executed: you lack the "${key}" workspace permission for this.`;
const NO_USER = 'Not executed: no user for this run.';
const NO_PROJECT =
  'Not executed: no project given. Pass projectId (call list_projects to find it).';

type PermissionKey = 'project.write' | 'target.write' | 'workspace.write';

/** Same rule as WorkspacePermissionGuard: the key, or `*`. */
async function hasPermission(
  deps: Deps<'workspacesService'>,
  workspaceId: string,
  userId: string,
  key: PermissionKey,
): Promise<boolean> {
  const { permissionKeys } =
    await deps.workspacesService.getMembershipWithPermissions(workspaceId, userId);
  return permissionKeys.includes('*') || permissionKeys.includes(key);
}

/** The first missing permission as the model's answer, or null when all are held. */
async function missing(
  deps: Deps<'workspacesService'>,
  workspaceId: string,
  scope: ToolScope,
  keys: PermissionKey[],
): Promise<string | null> {
  if (!scope.userId) return NO_USER;
  for (const key of keys) {
    if (!(await hasPermission(deps, workspaceId, scope.userId, key))) {
      return denied(key);
    }
  }
  return null;
}

/** Records a change the way the project controller's audit does, by the agent. */
function publishProject(
  deps: Deps<'eventBridge'>,
  workspaceId: string,
  scope: ToolScope,
  projectId: string,
  event: 'created' | 'updated',
  metadata: Record<string, string | number | boolean | string[]> = {},
) {
  return deps.eventBridge.publishSafely(
    EVENT_CATALOG.project[event],
    {
      workspaceId,
      actor: {
        type: AuditActorType.Agent,
        ...(scope.userId ? { id: scope.userId } : {}),
      },
      outcome: AuditOutcome.Success,
      resourceType: 'project',
      resourceId: projectId,
      metadata,
    },
    { subject: `workspace:${workspaceId}/project:${projectId}` },
  );
}

const targetInput = z.object({
  value: z
    .string()
    .min(1)
    .max(255)
    .describe('A root domain (example.com), an IP (1.2.3.4) or a CIDR (10.0.0.0/24).'),
  type: z.enum([TargetType.DOMAIN, TargetType.IP, TargetType.CIDR]),
});

const ruleInput = z.object({
  mode: z.enum([ProjectScopeRuleMode.INCLUDE, ProjectScopeRuleMode.EXCLUDE]),
  type: z
    .enum([
      ProjectScopeRuleType.TARGET,
      ProjectScopeRuleType.HOSTNAME,
      ProjectScopeRuleType.CIDR,
      ProjectScopeRuleType.ASSET,
    ])
    .describe(
      'target: a target id (everything found under it); hostname: a host or wildcard (*.example.com); cidr: an IP range; asset: an asset id.',
    ),
  value: z.string().min(1).max(255),
});

const pipelineInput = {
  template: z
    .string()
    .optional()
    .describe('A workflow template filePath from list_workflow_templates.'),
  toolIds: z
    .array(z.string().uuid())
    .max(20)
    .optional()
    .describe(
      'Tools of the pipeline, in order (ids from list_pipeline_tools); missing ones are installed. Instead of template.',
    ),
  workflowName: z.string().max(120).optional(),
  schedule: z
    .string()
    .max(100)
    .optional()
    .describe('Cron expression to run it on (e.g. "0 2 * * *"). Leave out to run by hand only.'),
};

/**
 * Creates the targets that do not exist yet and returns the ids of all of
 * them, for `target` scope rules.
 */
async function ensureTargets(
  deps: Deps<'targetsService' | 'conversationRepository'>,
  workspaceId: string,
  userId: string,
  targets: z.infer<typeof targetInput>[],
): Promise<{ ids: string[]; created: string[]; existing: string[] }> {
  const result = await deps.targetsService.createMultipleTargets(
    { targets: targets.map((t) => ({ value: t.value, type: t.type })) },
    workspaceId,
    { id: userId } as UserContextPayload,
  );
  const found: Array<{ id: string }> = result.skipped.length
    ? await deps.conversationRepository.manager.query(
        `SELECT id FROM targets WHERE "workspaceId" = $1 AND lower(value) = ANY($2::text[])`,
        [workspaceId, result.skipped.map((v) => v.toLowerCase())],
      )
    : [];
  return {
    ids: [...result.created.map((t) => t.id), ...found.map((t) => t.id)],
    created: result.created.map((t) => t.value),
    existing: result.skipped,
  };
}

/** Installs the pipeline tools the workspace does not have yet, audited like the API. */
async function ensureTools(
  deps: Deps<'toolsService' | 'eventBridge'>,
  workspaceId: string,
  scope: ToolScope,
  toolIds: string[],
): Promise<string[]> {
  const { data } = await deps.toolsService.getInstalledTools({}, workspaceId);
  const installed = new Set(data.map((tool) => tool.id));
  const installedNow: string[] = [];
  for (const toolId of toolIds) {
    if (installed.has(toolId)) continue;
    const entry = await deps.toolsService.installTool({ toolId }, workspaceId);
    installedNow.push(entry.tool.name);
    await deps.eventBridge.publishSafely(
      EVENT_CATALOG.tool.installed,
      {
        workspaceId,
        actor: {
          type: AuditActorType.Agent,
          ...(scope.userId ? { id: scope.userId } : {}),
        },
        outcome: AuditOutcome.Success,
        resourceType: 'tool',
        resourceId: toolId,
        changes: { tool: { after: entry.tool.name } },
      },
      { subject: `workspace:${workspaceId}/tool:${toolId}` },
    );
  }
  return installedNow;
}

const pipelineOf = (params: { template?: string; toolIds?: string[] }) =>
  params.toolIds?.length
    ? { tools: params.toolIds.map((toolId) => ({ toolId })) }
    : params.template
      ? { template: params.template }
      : {};

// ─── Read ─────────────────────────────────────────────────────────────────

const templatesInput = z.object({});

export function listWorkflowTemplatesTool(
  deps: Deps<'projectWorkflowsService'>,
  workspaceId: string,
): Tool {
  return defineTool({
    description:
      'List the workflow templates a project can run (e.g. discovery, web scan): filePath (pass it as template), name and the jobs of each. No params.',
    inputSchema: templatesInput,
    execute: () => deps.projectWorkflowsService.listTemplates(workspaceId),
  });
}

const pipelineToolsInput = z
  .object({ search: z.string().optional().describe('Filter by tool name.') })
  .extend(getManyBaseRequestSchema.shape);

export function listPipelineToolsTool(
  deps: Deps<'toolsService'>,
  workspaceId: string,
): Tool {
  return defineTool({
    description:
      'List the scanning tools a project workflow can use: id (pass it in toolIds), name, categories, whether the workspace has it installed. Params: search, page, limit.',
    inputSchema: pipelineToolsInput,
    execute: async (params: z.infer<typeof pipelineToolsInput>) => {
      const response = await deps.toolsService.getManyTools(
        {
          ...pageOf(params),
          sortBy: 'name',
          sortOrder: SortOrder.ASC,
          search: params.search,
        },
        workspaceId,
      );
      return {
        ...response,
        data: response.data.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          categories: (t.categories ?? []).map((c) => c.name),
          isInstalled: !!t.isInstalled,
        })),
      };
    },
  });
}

// ─── Write ────────────────────────────────────────────────────────────────

const createProjectInput = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  instruction: z
    .string()
    .max(2000)
    .optional()
    .describe('How an agent must work on the project; read by every chat about it.'),
  targets: z
    .array(targetInput)
    .max(50)
    .optional()
    .describe('Targets the project covers; created in the workspace when new and included in the scope.'),
  scopeRules: z
    .array(ruleInput)
    .max(100)
    .optional()
    .describe('Further include/exclude rules (hostnames, CIDRs, assets).'),
  ...pipelineInput,
  runNow: z
    .boolean()
    .optional()
    .describe('Start the workflow on the scope right away (needs assets in it).'),
});

export function createProjectTool(
  deps: Deps<
    | 'workspacesService'
    | 'targetsService'
    | 'toolsService'
    | 'projectsService'
    | 'conversationRepository'
    | 'eventBridge'
  >,
  workspaceId: string,
  scope: ToolScope = {},
): Tool {
  return defineTool({
    description: [
      'Create a project in one go: its targets (created when new) and scope rules, the instruction, a workflow (template or tools, installing missing tools), its schedule, and optionally a first run.',
      "This conversation then belongs to the new project: from the user's next message every tool is locked to it. Until then pass the returned projectId.",
      'Params: name, description, instruction, targets, scopeRules, template | toolIds, workflowName, schedule, runNow.',
    ].join('\n'),
    inputSchema: createProjectInput,
    execute: async (params: z.infer<typeof createProjectInput>) => {
      if (scope.projectId) {
        return 'Not executed: this conversation already belongs to a project; change that one or start a new chat.';
      }
      const keys: PermissionKey[] = ['project.write'];
      if (params.targets?.length) keys.push('target.write');
      if (params.toolIds?.length) keys.push('workspace.write');
      const refused = await missing(deps, workspaceId, scope, keys);
      if (refused) return refused;
      const userId = scope.userId!;

      const targets = params.targets?.length
        ? await ensureTargets(deps, workspaceId, userId, params.targets)
        : { ids: [], created: [], existing: [] };
      const installedTools = params.toolIds?.length
        ? await ensureTools(deps, workspaceId, scope, params.toolIds)
        : [];

      const project = await deps.projectsService.create(
        {
          name: params.name,
          description: params.description,
          scopeRules: [
            ...targets.ids.map((id) => ({
              mode: ProjectScopeRuleMode.INCLUDE,
              type: ProjectScopeRuleType.TARGET,
              value: id,
            })),
            ...(params.scopeRules ?? []),
          ],
          ...pipelineOf(params),
          workflowName: params.workflowName,
          schedule: params.schedule,
          runNow: params.runNow,
        },
        workspaceId,
      );
      if (params.instruction?.trim()) {
        await deps.projectsService.update(
          project.id,
          { instruction: params.instruction },
          workspaceId,
        );
      }
      await publishProject(deps, workspaceId, scope, project.id, 'created', {
        added: project.totalAssets ?? 0,
      });
      if (scope.conversationId) {
        await deps.conversationRepository.update(
          { id: scope.conversationId, workspaceId },
          { projectId: project.id },
        );
      }
      return {
        projectId: project.id,
        name: project.name,
        totalAssets: project.totalAssets,
        targetsCreated: targets.created,
        targetsExisting: targets.existing,
        toolsInstalled: installedTools,
        conversationLinked: !!scope.conversationId,
        note: 'New targets start their discovery scans now; their assets join the project as they are found.',
      };
    },
  });
}

const addTargetsInput = z
  .object({
    targets: z.array(targetInput).min(1).max(50),
    addToScope: z
      .boolean()
      .optional()
      .describe('Also include them in the project scope (default true when there is a project).'),
  })
  .extend(projectIdInput);

export function addTargetsTool(
  deps: Deps<
    | 'workspacesService'
    | 'targetsService'
    | 'conversationRepository'
    | 'projectsService'
    | 'projectScopeService'
    | 'eventBridge'
  >,
  workspaceId: string,
  scope: ToolScope = {},
): Tool {
  return defineTool({
    description:
      "Add scan targets (domains, IPs, CIDRs) to the workspace, which starts their discovery, and include them in a project's scope. Params: targets, projectId, addToScope.",
    inputSchema: addTargetsInput,
    execute: async (params: z.infer<typeof addTargetsInput>) => {
      const projectId = projectFor(scope, params);
      const toScope = !!projectId && params.addToScope !== false;
      const refused = await missing(deps, workspaceId, scope, [
        'target.write',
        ...(toScope ? (['project.write'] as const) : []),
      ]);
      if (refused) return refused;
      const targets = await ensureTargets(
        deps,
        workspaceId,
        scope.userId!,
        params.targets,
      );
      if (toScope && projectId) {
        await changeScope(deps, workspaceId, scope, projectId, {
          add: targets.ids.map((id) => ({
            mode: ProjectScopeRuleMode.INCLUDE,
            type: ProjectScopeRuleType.TARGET,
            value: id,
          })),
        });
      }
      return {
        created: targets.created,
        existing: targets.existing,
        addedToProject: toScope ? projectId : null,
      };
    },
  });
}

/** Adds and removes rules on the saved ones, then syncs the project's assets. */
async function changeScope(
  deps: Deps<'projectsService' | 'projectScopeService' | 'eventBridge'>,
  workspaceId: string,
  scope: ToolScope,
  projectId: string,
  change: {
    add?: z.infer<typeof ruleInput>[];
    removeRuleIds?: string[];
    autoAddAssets?: boolean;
  },
) {
  const current = await deps.projectScopeService.getScope(projectId, workspaceId);
  const removed = new Set(change.removeRuleIds ?? []);
  const rules = [
    ...current.rules
      .filter((rule) => !removed.has(rule.id))
      .map(({ mode, type, value }) => ({ mode, type, value })),
    ...(change.add ?? []),
  ];
  const result = await deps.projectsService.replaceScope(
    projectId,
    workspaceId,
    rules,
    change.autoAddAssets,
  );
  await publishProject(deps, workspaceId, scope, projectId, 'updated', {
    change: ProjectChange.SCOPE,
  });
  return result;
}

const updateScopeInput = z
  .object({
    add: z.array(ruleInput).max(100).optional(),
    removeRuleIds: z
      .array(z.string().uuid())
      .optional()
      .describe('Rule ids from inspect_project scope.rules.'),
    autoAddAssets: z
      .boolean()
      .optional()
      .describe('Whether assets found later join when they match a rule.'),
  })
  .extend(projectIdInput);

export function updateProjectScopeTool(
  deps: Deps<
    'workspacesService' | 'projectsService' | 'projectScopeService' | 'eventBridge'
  >,
  workspaceId: string,
  scope: ToolScope = {},
): Tool {
  return defineTool({
    description:
      "Change a project's scope: add include/exclude rules, remove rules by id, switch auto-adding of new assets. The project's assets follow at once. Params: projectId, add, removeRuleIds, autoAddAssets.",
    inputSchema: updateScopeInput,
    execute: async (params: z.infer<typeof updateScopeInput>) => {
      const projectId = projectFor(scope, params);
      if (!projectId) return NO_PROJECT;
      const refused = await missing(deps, workspaceId, scope, ['project.write']);
      if (refused) return refused;
      return changeScope(deps, workspaceId, scope, projectId, params);
    },
  });
}

const addWorkflowInput = z.object(pipelineInput).extend(projectIdInput);

export function addProjectWorkflowTool(
  deps: Deps<
    | 'workspacesService'
    | 'toolsService'
    | 'projectsService'
    | 'projectTriggersService'
    | 'eventBridge'
  >,
  workspaceId: string,
  scope: ToolScope = {},
): Tool {
  return defineTool({
    description:
      'Add a workflow to a project from a template or a list of tools (installing missing tools), optionally on a cron schedule. Params: projectId, template | toolIds, workflowName, schedule.',
    inputSchema: addWorkflowInput,
    execute: async (params: z.infer<typeof addWorkflowInput>) => {
      const projectId = projectFor(scope, params);
      if (!projectId) return NO_PROJECT;
      if (!params.template && !params.toolIds?.length) {
        return 'Not executed: pass template or toolIds.';
      }
      const refused = await missing(deps, workspaceId, scope, [
        'project.write',
        ...(params.toolIds?.length ? (['workspace.write'] as const) : []),
      ]);
      if (refused) return refused;
      const toolsInstalled = params.toolIds?.length
        ? await ensureTools(deps, workspaceId, scope, params.toolIds)
        : [];
      const binding = await deps.projectsService.addWorkflow(projectId, workspaceId, {
        name: params.workflowName,
        ...pipelineOf(params),
      });
      if (params.schedule) {
        await deps.projectTriggersService.create(projectId, workspaceId, {
          projectWorkflowId: binding.id,
          type: ProjectTriggerType.CRON,
          cron: params.schedule,
        });
      }
      await publishProject(deps, workspaceId, scope, projectId, 'updated', {
        change: ProjectChange.WORKFLOW_ADDED,
      });
      return { projectWorkflowId: binding.id, toolsInstalled };
    },
  });
}

const workflowRefInput = z
  .object({
    projectWorkflowId: z
      .string()
      .uuid()
      .describe('The workflow binding id (workflows[].id from inspect_project).'),
  })
  .extend(projectIdInput);

export function removeProjectWorkflowTool(
  deps: Deps<'workspacesService' | 'projectsService' | 'eventBridge'>,
  workspaceId: string,
  scope: ToolScope = {},
): Tool {
  return defineTool({
    description:
      'Remove a workflow from a project, with its triggers and run history. Params: projectId, projectWorkflowId.',
    inputSchema: workflowRefInput,
    execute: async (params: z.infer<typeof workflowRefInput>) => {
      const projectId = projectFor(scope, params);
      if (!projectId) return NO_PROJECT;
      const refused = await missing(deps, workspaceId, scope, ['project.write']);
      if (refused) return refused;
      const result = await deps.projectsService.removeWorkflow(
        projectId,
        workspaceId,
        params.projectWorkflowId,
      );
      await publishProject(deps, workspaceId, scope, projectId, 'updated', {
        change: ProjectChange.WORKFLOW_REMOVED,
      });
      return result;
    },
  });
}

const addTriggerInput = z
  .object({
    projectWorkflowId: z.string().uuid(),
    type: z.enum([ProjectTriggerType.CRON, ProjectTriggerType.EVENT]),
    cron: z.string().max(100).optional().describe('For type cron, e.g. "0 2 * * 1".'),
    event: z
      .enum([
        ProjectTriggerEvent.ASSETS_ADDED,
        ProjectTriggerEvent.RUN_COMPLETED,
        ProjectTriggerEvent.VULNERABILITY_DETECTED,
      ])
      .optional()
      .describe(
        'For type event: new assets joined, another workflow run finished, or new vulnerabilities were found.',
      ),
  })
  .extend(projectIdInput);

export function addProjectTriggerTool(
  deps: Deps<'workspacesService' | 'projectTriggersService' | 'eventBridge'>,
  workspaceId: string,
  scope: ToolScope = {},
): Tool {
  return defineTool({
    description:
      'Make a project workflow run on a cron schedule or on an event. Params: projectId, projectWorkflowId, type, cron | event.',
    inputSchema: addTriggerInput,
    execute: async (params: z.infer<typeof addTriggerInput>) => {
      const projectId = projectFor(scope, params);
      if (!projectId) return NO_PROJECT;
      const refused = await missing(deps, workspaceId, scope, ['project.write']);
      if (refused) return refused;
      const trigger = await deps.projectTriggersService.create(projectId, workspaceId, {
        projectWorkflowId: params.projectWorkflowId,
        type: params.type,
        cron: params.cron,
        event: params.event,
      });
      await publishProject(deps, workspaceId, scope, projectId, 'updated', {
        change: ProjectChange.TRIGGERS,
      });
      return trigger;
    },
  });
}

const triggerRefInput = z
  .object({
    triggerId: z
      .string()
      .uuid()
      .describe('workflows[].triggers[].id from inspect_project.'),
  })
  .extend(projectIdInput);

export function removeProjectTriggerTool(
  deps: Deps<'workspacesService' | 'projectTriggersService' | 'eventBridge'>,
  workspaceId: string,
  scope: ToolScope = {},
): Tool {
  return defineTool({
    description: 'Remove a schedule or event trigger of a project workflow. Params: projectId, triggerId.',
    inputSchema: triggerRefInput,
    execute: async (params: z.infer<typeof triggerRefInput>) => {
      const projectId = projectFor(scope, params);
      if (!projectId) return NO_PROJECT;
      const refused = await missing(deps, workspaceId, scope, ['project.write']);
      if (refused) return refused;
      await deps.projectTriggersService.remove(projectId, workspaceId, params.triggerId);
      await publishProject(deps, workspaceId, scope, projectId, 'updated', {
        change: ProjectChange.TRIGGERS,
      });
      return { removed: params.triggerId };
    },
  });
}

const installToolInput = z.object({
  toolId: z.string().uuid().describe('From list_pipeline_tools.'),
});

export function installToolTool(
  deps: Deps<'workspacesService' | 'toolsService' | 'eventBridge'>,
  workspaceId: string,
  scope: ToolScope = {},
): Tool {
  return defineTool({
    description: 'Install a scanning tool in the workspace so workflows can use it. Params: toolId.',
    inputSchema: installToolInput,
    execute: async (params: z.infer<typeof installToolInput>) => {
      const refused = await missing(deps, workspaceId, scope, ['workspace.write']);
      if (refused) return refused;
      const installed = await ensureTools(deps, workspaceId, scope, [params.toolId]);
      return { toolId: params.toolId, installed: installed.length > 0 };
    },
  });
}

const instructionInput = z
  .object({ instruction: z.string().max(2000).describe('Empty clears it.') })
  .extend(projectIdInput);

export function updateProjectInstructionTool(
  deps: Deps<'workspacesService' | 'projectsService' | 'eventBridge'>,
  workspaceId: string,
  scope: ToolScope = {},
): Tool {
  return defineTool({
    description:
      "Replace a project's instruction (how an agent must work on it, read by every chat about it). Params: projectId, instruction.",
    inputSchema: instructionInput,
    execute: async (params: z.infer<typeof instructionInput>) => {
      const projectId = projectFor(scope, params);
      if (!projectId) return NO_PROJECT;
      const refused = await missing(deps, workspaceId, scope, ['project.write']);
      if (refused) return refused;
      const project = await deps.projectsService.update(
        projectId,
        { instruction: params.instruction },
        workspaceId,
      );
      await publishProject(deps, workspaceId, scope, projectId, 'updated', {
        change: ProjectChange.SETTINGS,
      });
      return { projectId, instruction: project.instruction };
    },
  });
}

/** For the existing project actions, so they check the same permission. */
export const requireProjectWrite = (
  deps: Deps<'workspacesService'>,
  workspaceId: string,
  scope: ToolScope,
) => missing(deps, workspaceId, scope, ['project.write']);
