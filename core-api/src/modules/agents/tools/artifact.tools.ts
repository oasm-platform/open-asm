import type { Tool } from 'ai';
import { z } from 'zod';

import { ArtifactSource, AuditActorType } from '@/common/enums/enum';
import { defineTool, failSoft } from './helpers';
import type { Deps } from './types';

/**
 * Lets the agent hand the user a file (report, CSV, script output) and save
 * nuclei templates into the workspace templates folder. Both are owned by the
 * requesting user and counted against the workspace quota.
 */
export function artifactTools(
  deps: Deps<'artifactsService' | 'workspacesService' | 'templatesService'>,
  workspaceId: string,
  userId: string,
  conversationId: string,
): Record<string, Tool> {
  // Saving needs artifact.write; chat itself needs no permission.
  const canWrite = async (): Promise<boolean> => {
    const { permissionKeys } =
      await deps.workspacesService.getMembershipWithPermissions(workspaceId, userId);
    return permissionKeys.includes('*') || permissionKeys.includes('artifact.write');
  };

  const saveFile = defineTool({
    description:
      'Save text content as a file in the user\'s workspace Files (private to the user). ' +
      'Use this when the user asks for a downloadable deliverable such as a report, CSV or script. ' +
      'For nuclei templates use save_template instead.',
    inputSchema: z.object({
      fileName: z
        .string()
        .min(1)
        .max(255)
        .describe('File name with extension, e.g. "scan-summary.md"'),
      content: z.string().describe('Full file content'),
      mimeType: z
        .string()
        .regex(/^[\w.+-]+\/[\w.+-]+$/)
        .default('text/plain')
        .describe('MIME type, e.g. "text/markdown" or "text/csv"'),
    }),
    execute: (params: { fileName: string; content: string; mimeType: string }) =>
      failSoft('save file', async () => {
        if (!(await canWrite())) {
          return {
            success: false,
            message:
              'The user lacks the artifact.write permission in this workspace, so the file was not saved.',
          };
        }
        const file = await deps.artifactsService.createFromBuffer({
          workspaceId,
          userId,
          source: ArtifactSource.AGENT,
          name: params.fileName,
          mimeType: params.mimeType,
          buffer: Buffer.from(params.content, 'utf8'),
          metadata: { conversationId },
        });
        return {
          success: true,
          id: file.id,
          name: file.name,
          sizeBytes: file.sizeBytes,
          message: `Saved "${file.name}" to the user's Files.`,
        };
      }),
  });

  const saveTemplate = defineTool({
    description:
      'Save a nuclei template (YAML) as a custom template of the workspace (Settings → Templates, ' +
      'the custom-templates folder), where the user can edit and run it. The YAML is validated: it ' +
      'must parse and have a string "id"; on failure fix the reported error and call again. ' +
      'Pass templateId (from an earlier save_template result) to overwrite that template instead of creating a new one.',
    inputSchema: z.object({
      fileName: z
        .string()
        .min(1)
        .max(200)
        .regex(/\.ya?ml$/i, 'must end in .yaml or .yml')
        .describe('Template file name, normally "<template id>.yaml"'),
      content: z.string().min(1).describe('Full nuclei template YAML'),
      templateId: z
        .string()
        .uuid()
        .optional()
        .describe('Overwrite this template (one the user owns) instead of creating a new one'),
    }),
    execute: (params: { fileName: string; content: string; templateId?: string }) =>
      failSoft('save template', async () => {
        if (!(await canWrite())) {
          return {
            success: false,
            message:
              'The user lacks the artifact.write permission in this workspace, so the template was not saved.',
          };
        }
        const template = params.templateId
          ? await deps.templatesService.saveContent(workspaceId, userId, params.templateId, {
              content: params.content,
            })
          : await deps.templatesService.create(
              workspaceId,
              userId,
              { name: params.fileName, content: params.content },
              { actorType: AuditActorType.Agent, metadata: { conversationId } },
            );
        return {
          success: true,
          id: template.id,
          name: template.name,
          sizeBytes: template.sizeBytes,
          message: `Saved "${template.name}" to the workspace templates (Settings → Templates).`,
        };
      }),
  });

  return { save_file: saveFile, save_template: saveTemplate };
}
