import { ArtifactSource } from '@/common/enums/enum';
import type { ArtifactsService } from '@/modules/artifacts/artifacts.service';
import type { WorkspacesService } from '@/modules/workspaces/workspaces.service';
import { artifactTools } from './artifact.tools';

describe('artifactTools save_file', () => {
  const run = (createFromBuffer: jest.Mock, permissionKeys = ['artifact.write']) => {
    const { save_file } = artifactTools(
      {
        artifactsService: { createFromBuffer } as unknown as ArtifactsService,
        workspacesService: {
          getMembershipWithPermissions: jest.fn().mockResolvedValue({ permissionKeys }),
        } as unknown as WorkspacesService,
      },
      'ws-1',
      'user-1',
      'conv-1',
    );
    return (
      save_file.execute as (params: unknown, options: unknown) => Promise<unknown>
    )(
      { fileName: 'report.md', content: 'héllo', mimeType: 'text/markdown' },
      { toolCallId: 't', messages: [] },
    );
  };

  it('saves the content as the user\'s private agent file', async () => {
    const createFromBuffer = jest
      .fn()
      .mockResolvedValue({ id: 'a-1', name: 'report.md', sizeBytes: 6 });

    await expect(run(createFromBuffer)).resolves.toMatchObject({
      success: true,
      id: 'a-1',
      sizeBytes: 6,
    });
    expect(createFromBuffer).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      userId: 'user-1',
      source: ArtifactSource.AGENT,
      name: 'report.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('héllo', 'utf8'),
      metadata: { conversationId: 'conv-1' },
    });
  });

  it('refuses a member without artifact.write', async () => {
    const createFromBuffer = jest.fn();

    await expect(run(createFromBuffer, ['artifact.read'])).resolves.toMatchObject({
      success: false,
      message: expect.stringContaining('artifact.write'),
    });
    expect(createFromBuffer).not.toHaveBeenCalled();
  });

  it('allows the wildcard permission', async () => {
    const createFromBuffer = jest
      .fn()
      .mockResolvedValue({ id: 'a-1', name: 'report.md', sizeBytes: 6 });

    await expect(run(createFromBuffer, ['*'])).resolves.toMatchObject({ success: true });
  });

  it('reports a quota error to the model instead of throwing', async () => {
    const createFromBuffer = jest
      .fn()
      .mockRejectedValue(new Error('Workspace storage quota exceeded'));

    await expect(run(createFromBuffer)).resolves.toMatchObject({
      success: false,
      message: expect.stringContaining('quota exceeded'),
    });
  });
});
