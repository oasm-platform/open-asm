import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { ArtifactSource, AuditActorType } from '@/common/enums/enum';
import { ArtifactsService } from '@/modules/artifacts/artifacts.service';
import { TemplatesService } from '@/modules/templates/templates.service';
import { WorkspacesService } from '@/modules/workspaces/workspaces.service';

import { AgentFunction } from './agent-function';
import { failSoft } from './helpers';
import type { AgentFunctionContext } from './types';

const saveFileInput = z.object({
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
});

const saveTemplateInput = z.object({
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
});

/**
 * Lets the agent hand the user a file (report, CSV, script output) and save
 * nuclei templates into the workspace templates folder. Both are owned by the
 * requesting user and counted against the workspace quota. Chat itself needs
 * no permission: each save checks artifact.write itself.
 */
@Injectable()
export class ArtifactTools {
  constructor(
    readonly artifactsService: ArtifactsService,
    readonly workspacesService: WorkspacesService,
    readonly templatesService: TemplatesService,
  ) {}

  /** Saving needs artifact.write. */
  private async canWrite(ctx: AgentFunctionContext): Promise<boolean> {
    const { permissionKeys } =
      await this.workspacesService.getMembershipWithPermissions(
        ctx.workspaceId,
        ctx.userId ?? '',
      );
    return permissionKeys.includes('*') || permissionKeys.includes('artifact.write');
  }

  @AgentFunction({
    name: 'save_file',
    description:
      'Save text content as a file in the user\'s workspace Files (private to the user). ' +
      'Use this when the user asks for a downloadable deliverable such as a report, CSV or script. ' +
      'For nuclei templates use save_template instead.',
    inputSchema: saveFileInput,
    permissions: 'ungated',
    gate: 'none',
  })
  saveFile(params: z.infer<typeof saveFileInput>, ctx: AgentFunctionContext) {
    return failSoft('save file', async () => {
      if (!(await this.canWrite(ctx))) {
        return {
          success: false,
          message:
            'The user lacks the artifact.write permission in this workspace, so the file was not saved.',
        };
      }
      const file = await this.artifactsService.createFromBuffer({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId ?? '',
        source: ArtifactSource.AGENT,
        name: params.fileName,
        mimeType: params.mimeType,
        buffer: Buffer.from(params.content, 'utf8'),
        metadata: { conversationId: ctx.conversationId ?? '' },
      });
      return {
        success: true,
        id: file.id,
        name: file.name,
        sizeBytes: file.sizeBytes,
        message: `Saved "${file.name}" to the user's Files.`,
      };
    });
  }

  @AgentFunction({
    name: 'save_template',
    description:
      'Save a nuclei template (YAML) as a custom template of the workspace (Settings → Templates, ' +
      'the custom-templates folder), where the user can edit and run it. The YAML is validated: it ' +
      'must parse and have a string "id"; on failure fix the reported error and call again. ' +
      'Pass templateId (from an earlier save_template result) to overwrite that template instead of creating a new one.',
    inputSchema: saveTemplateInput,
    permissions: 'ungated',
    gate: 'none',
  })
  saveTemplate(
    params: z.infer<typeof saveTemplateInput>,
    ctx: AgentFunctionContext,
  ) {
    const { workspaceId } = ctx;
    const userId = ctx.userId ?? '';
    return failSoft('save template', async () => {
      if (!(await this.canWrite(ctx))) {
        return {
          success: false,
          message:
            'The user lacks the artifact.write permission in this workspace, so the template was not saved.',
        };
      }
      const template = params.templateId
        ? await this.templatesService.saveContent(workspaceId, userId, params.templateId, {
            content: params.content,
          })
        : await this.templatesService.create(
            workspaceId,
            userId,
            { name: params.fileName, content: params.content },
            {
              actorType: AuditActorType.Agent,
              metadata: { conversationId: ctx.conversationId ?? '' },
            },
          );
      return {
        success: true,
        id: template.id,
        name: template.name,
        sizeBytes: template.sizeBytes,
        message: `Saved "${template.name}" to the workspace templates (Settings → Templates).`,
      };
    });
  }
}
