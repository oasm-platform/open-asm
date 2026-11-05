import type { Tool } from 'ai';
import { z } from 'zod';

import { getManyBaseRequestSchema } from '@/mcp/mcp.schema';
import type { ProjectStatusFilter } from '@/modules/projects/dto/get-projects.dto';

import {
  NEWEST_FIRST,
  defineTool,
  pageOf,
  projectFor,
  projectIdInput,
} from './helpers';
import { requireProjectWrite } from './project-build.tools';
import type { Deps, ToolScope } from './types';

// Tools over the workspace's projects: what each one scans, what it found,
// and (Agent mode, behind approval) changing its assets or starting a run.

const NO_PROJECT =
  'Not executed: no project given. Pass projectId (call list_projects to find it).';

/** The project a call is about, or the message telling the model to pick one. */
function requireProject(
  scope: ToolScope,
  params: { projectId?: string },
): { projectId: string } | { error: string } {
  const projectId = projectFor(scope, params);
  return projectId ? { projectId } : { error: NO_PROJECT };
}

const listProjectsInput = z
  .object({
    search: z.string().optional().describe('Filter projects by name.'),
    status: z
      .enum(['active', 'archived', 'all'])
      .optional()
      .describe('active (default), archived or all.'),
  })
  .extend(getManyBaseRequestSchema.shape);

const projectInput = z.object(projectIdInput);

const projectAssetsInput = z
  .object({
    search: z.string().optional().describe('Filter assets by value.'),
    candidates: z
      .boolean()
      .optional()
      .describe(
        'true: the workspace assets NOT in the project yet (to pick for add_assets_to_project).',
      ),
  })
  .extend(projectIdInput)
  .extend(getManyBaseRequestSchema.shape);

const projectRunsInput = z
  .object(projectIdInput)
  .extend(getManyBaseRequestSchema.shape);

const assetIdsInput = z
  .object({
    assetIds: z
      .array(z.string().uuid())
      .min(1)
      .max(500)
      .describe('Asset ids from list_project_assets.'),
  })
  .extend(projectIdInput);

/** Characters of a project file one read_project_file call returns. */
const FILE_PAGE_CHARS = 20_000;

const readFileInput = z
  .object({
    fileId: z
      .string()
      .uuid()
      .describe('The file id (from the project prompt or inspect_project files).'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Character to start from (nextOffset of the previous call).'),
  })
  .extend(projectIdInput);

const runWorkflowInput = z
  .object({
    projectWorkflowId: z
      .string()
      .uuid()
      .describe('The workflow binding id (workflows[].id from inspect_project).'),
    assetIds: z
      .array(z.string().uuid())
      .optional()
      .describe('Only scan these project assets; leave out to scan the whole scope.'),
  })
  .extend(projectIdInput);

export function listProjectsTool(
  deps: Deps<'projectsService'>,
  workspaceId: string,
  scope: ToolScope = {},
): Tool {
  return defineTool({
    description:
      'List the projects of the workspace: id, name, description, asset and workflow counts, last run, open vulnerabilities by severity. Params: page, limit, search, status. In a conversation about a project, only that project.',
    inputSchema: listProjectsInput,
    execute: async (params: z.infer<typeof listProjectsInput>) => {
      if (scope.projectId) {
        return deps.projectsService.getById(scope.projectId, workspaceId);
      }
      return deps.projectsService.getMany(
        {
          ...pageOf(params),
          ...NEWEST_FIRST,
          search: params.search ?? '',
          status: params.status as ProjectStatusFilter | undefined,
        },
        workspaceId,
      );
    },
  });
}

export function inspectProjectTool(
  deps: Deps<'projectsService' | 'projectScopeService' | 'projectFilesService'>,
  workspaceId: string,
  scope: ToolScope = {},
): Tool {
  return defineTool({
    description:
      "Get one project: name, description, the members' instruction, archived state, asset count, scope rules (which assets it includes or excludes), its attached files, and its workflows with their triggers and last run. Params: projectId.",
    inputSchema: projectInput,
    execute: async (params: z.infer<typeof projectInput>) => {
      const target = requireProject(scope, params);
      if ('error' in target) return target.error;
      const [project, projectScope, files] = await Promise.all([
        deps.projectsService.getById(target.projectId, workspaceId),
        deps.projectScopeService.getScope(target.projectId, workspaceId),
        deps.projectFilesService.list(target.projectId, workspaceId),
      ]);
      return {
        id: project.id,
        name: project.name,
        description: project.description,
        instruction: project.instruction,
        files: files.map((file) => ({
          id: file.id,
          name: file.name,
          sizeBytes: file.sizeBytes,
        })),
        archived: !!project.archivedAt,
        totalAssets: project.totalAssets,
        lastRunAt: project.lastRunAt ?? null,
        scope: projectScope,
        workflows: (project.projectWorkflows ?? []).map((binding) => ({
          id: binding.id,
          workflowId: binding.workflowId,
          name: binding.workflow?.name,
          triggers: (binding.triggers ?? []).map((t) => ({
            id: t.id,
            type: t.type,
          })),
          lastRun: binding.lastRun ?? null,
        })),
      };
    },
  });
}

export function readProjectFileTool(
  deps: Deps<'projectFilesService'>,
  workspaceId: string,
  scope: ToolScope = {},
): Tool {
  return defineTool({
    description: `Read a file attached to a project (.md, .txt, .csv), ${FILE_PAGE_CHARS} characters at a time. Follow nextOffset until it is null. Params: projectId, fileId, offset.`,
    inputSchema: readFileInput,
    execute: async (params: z.infer<typeof readFileInput>) => {
      const target = requireProject(scope, params);
      if ('error' in target) return target.error;
      const file = await deps.projectFilesService.readText(
        target.projectId,
        workspaceId,
        params.fileId,
      );
      const offset = params.offset ?? 0;
      const end = offset + FILE_PAGE_CHARS;
      return {
        id: file.id,
        name: file.name,
        totalChars: file.totalChars,
        offset,
        content: file.content.slice(offset, end),
        nextOffset: end < file.totalChars ? end : null,
      };
    },
  });
}

export function listProjectAssetsTool(
  deps: Deps<'projectAssetsService'>,
  workspaceId: string,
  scope: ToolScope = {},
): Tool {
  return defineTool({
    description:
      'List the assets of a project with why each is in it (scope rule or picked by hand) and its open vulnerabilities; with candidates=true, the workspace assets not in it yet. Params: projectId, search, candidates, page, limit.',
    inputSchema: projectAssetsInput,
    execute: async (params: z.infer<typeof projectAssetsInput>) => {
      const target = requireProject(scope, params);
      if ('error' in target) return target.error;
      const query = {
        ...pageOf(params),
        ...NEWEST_FIRST,
        search: params.search ?? '',
      };
      if (!params.candidates) {
        return deps.projectAssetsService.list(
          target.projectId,
          workspaceId,
          query,
        );
      }
      const response = await deps.projectAssetsService.candidates(
        target.projectId,
        workspaceId,
        query,
      );
      return {
        ...response,
        data: response.data.map((a) => ({ id: a.id, value: a.value })),
      };
    },
  });
}

export function listProjectRunsTool(
  deps: Deps<'projectResultsService'>,
  workspaceId: string,
  scope: ToolScope = {},
): Tool {
  return defineTool({
    description:
      'List the workflow runs of a project, newest first, with status and the vulnerabilities each found. Params: projectId, page, limit.',
    inputSchema: projectRunsInput,
    execute: async (params: z.infer<typeof projectRunsInput>) => {
      const target = requireProject(scope, params);
      if ('error' in target) return target.error;
      return deps.projectResultsService.runs(target.projectId, workspaceId, {
        ...pageOf(params),
        ...NEWEST_FIRST,
        search: '',
      });
    },
  });
}

export function addAssetsToProjectTool(
  deps: Deps<'projectsService' | 'workspacesService'>,
  workspaceId: string,
  scope: ToolScope = {},
): Tool {
  return defineTool({
    description:
      'Add workspace assets to a project by hand (ids from list_project_assets with candidates=true). Params: projectId, assetIds.',
    inputSchema: assetIdsInput,
    execute: async (params: z.infer<typeof assetIdsInput>) => {
      const target = requireProject(scope, params);
      if ('error' in target) return target.error;
      const refused = await requireProjectWrite(deps, workspaceId, scope);
      if (refused) return refused;
      return deps.projectsService.addAssets(
        target.projectId,
        workspaceId,
        params.assetIds,
      );
    },
  });
}

export function removeAssetsFromProjectTool(
  deps: Deps<'projectsService' | 'workspacesService'>,
  workspaceId: string,
  scope: ToolScope = {},
): Tool {
  return defineTool({
    description:
      'Remove assets from a project (ids from list_project_assets). An asset a scope rule still matches comes back on the next rule sync. Params: projectId, assetIds.',
    inputSchema: assetIdsInput,
    execute: async (params: z.infer<typeof assetIdsInput>) => {
      const target = requireProject(scope, params);
      if ('error' in target) return target.error;
      const refused = await requireProjectWrite(deps, workspaceId, scope);
      if (refused) return refused;
      return deps.projectsService.removeAssets(
        target.projectId,
        workspaceId,
        params.assetIds,
      );
    },
  });
}

export function runProjectWorkflowTool(
  deps: Deps<'projectsService' | 'workspacesService'>,
  workspaceId: string,
  scope: ToolScope = {},
): Tool {
  return defineTool({
    description:
      "Start a manual run of one of the project's workflows on its whole scope or on some of its assets. Follow it with list_project_runs. Params: projectId, projectWorkflowId, assetIds.",
    inputSchema: runWorkflowInput,
    execute: async (params: z.infer<typeof runWorkflowInput>) => {
      const target = requireProject(scope, params);
      if ('error' in target) return target.error;
      const refused = await requireProjectWrite(deps, workspaceId, scope);
      if (refused) return refused;
      return deps.projectsService.runWorkflow(
        target.projectId,
        workspaceId,
        params.projectWorkflowId,
        params.assetIds,
      );
    },
  });
}
