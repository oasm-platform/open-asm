import { BadRequestException } from '@nestjs/common';

import { ArtifactSource, AuditActorType } from '@/common/enums/enum';
import type { ArtifactsService } from '@/modules/artifacts/artifacts.service';
import type { TemplatesService } from '@/modules/templates/templates.service';
import type { WorkspacesService } from '@/modules/workspaces/workspaces.service';
import { artifactTools } from './artifact.tools';

const membership = (permissionKeys: string[]) =>
  ({
    getMembershipWithPermissions: jest.fn().mockResolvedValue({ permissionKeys }),
  }) as unknown as WorkspacesService;

describe('artifactTools save_file', () => {
  const run = (createFromBuffer: jest.Mock, permissionKeys = ['artifact.write']) => {
    const { save_file } = artifactTools(
      {
        artifactsService: { createFromBuffer } as unknown as ArtifactsService,
        workspacesService: membership(permissionKeys),
        templatesService: {} as TemplatesService,
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

describe('artifactTools save_template', () => {
  const YAML = 'id: exposed-git-config\ninfo:\n  name: Exposed Git Config\n';
  const saved = { id: 't-1', name: 'exposed-git-config.yaml', sizeBytes: 42 };

  const setup = (permissionKeys = ['artifact.write']) => {
    const templatesService = {
      create: jest.fn().mockResolvedValue(saved),
      saveContent: jest.fn().mockResolvedValue(saved),
    };
    const { save_template } = artifactTools(
      {
        artifactsService: {} as ArtifactsService,
        workspacesService: membership(permissionKeys),
        templatesService: templatesService as unknown as TemplatesService,
      },
      'ws-1',
      'user-1',
      'conv-1',
    );
    const run = (params: Record<string, unknown>) =>
      (save_template.execute as (params: unknown, options: unknown) => Promise<unknown>)(
        params,
        { toolCallId: 't', messages: [] },
      );
    return { templatesService, run };
  };

  it('creates a workspace template as the agent, tagged with the conversation', async () => {
    const { templatesService, run } = setup();

    await expect(
      run({ fileName: 'exposed-git-config.yaml', content: YAML }),
    ).resolves.toMatchObject({ success: true, id: 't-1', name: 'exposed-git-config.yaml' });
    expect(templatesService.create).toHaveBeenCalledWith(
      'ws-1',
      'user-1',
      { name: 'exposed-git-config.yaml', content: YAML },
      { actorType: AuditActorType.Agent, metadata: { conversationId: 'conv-1' } },
    );
    expect(templatesService.saveContent).not.toHaveBeenCalled();
  });

  it('overwrites the given template instead of creating another', async () => {
    const { templatesService, run } = setup();

    await run({
      fileName: 'exposed-git-config.yaml',
      content: YAML,
      templateId: '0f8b7c1e-2a3d-4e5f-8a9b-0c1d2e3f4a5b',
    });
    expect(templatesService.saveContent).toHaveBeenCalledWith(
      'ws-1',
      'user-1',
      '0f8b7c1e-2a3d-4e5f-8a9b-0c1d2e3f4a5b',
      { content: YAML },
    );
    expect(templatesService.create).not.toHaveBeenCalled();
  });

  it('hands a validation error back to the model so it can fix the YAML', async () => {
    const { templatesService, run } = setup();
    templatesService.create.mockRejectedValue(
      new BadRequestException('Invalid YAML at line 3: bad indentation'),
    );

    await expect(run({ fileName: 'x.yaml', content: 'id: [' })).resolves.toMatchObject({
      success: false,
      message: expect.stringContaining('Invalid YAML at line 3'),
    });
  });

  it('refuses a member without artifact.write', async () => {
    const { templatesService, run } = setup(['artifact.read']);

    await expect(run({ fileName: 'x.yaml', content: YAML })).resolves.toMatchObject({
      success: false,
      message: expect.stringContaining('artifact.write'),
    });
    expect(templatesService.create).not.toHaveBeenCalled();
  });
});
