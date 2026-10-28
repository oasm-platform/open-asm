import type { Tool } from 'ai';
import { z } from 'zod';

import { ArtifactSource } from '@/common/enums/enum';
import { defineTool, failSoft } from './helpers';
import type { Deps } from './types';

/**
 * Lets the agent hand the user a file (report, CSV, script output). Saved as
 * the requesting user's private file and counted against the workspace quota.
 */
export function artifactTools(
  deps: Deps<'artifactsService' | 'workspacesService'>,
  workspaceId: string,
  userId: string,
  conversationId: string,
): Record<string, Tool> {
  const saveFile = defineTool({
    description:
      'Save text content as a file in the user\'s workspace Files (private to the user). ' +
      'Use this when the user asks for a downloadable deliverable such as a report, CSV or script.',
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
        // Same rule as POST /artifacts/presign; chat itself needs no permission.
        const { permissionKeys } =
          await deps.workspacesService.getMembershipWithPermissions(workspaceId, userId);
        if (!permissionKeys.includes('*') && !permissionKeys.includes('artifact.write')) {
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

  return { save_file: saveFile };
}
