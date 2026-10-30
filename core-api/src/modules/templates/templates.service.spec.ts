import {
  ArtifactShareType,
  ArtifactSource,
  ArtifactStatus,
  AuditActorType,
} from '@/common/enums/enum';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Readable } from 'stream';
import type { ArtifactFoldersService } from '../artifacts/artifact-folders.service';
import type { ArtifactsService } from '../artifacts/artifacts.service';
import type { StorageService } from '../storage/storage.service';
import { TemplatesService } from './templates.service';
import type { Artifact } from '../artifacts/entities/artifact.entity';
import type { Repository } from 'typeorm';

const WS = 'ws-1';
const ME = 'me';
const FOLDER = 'folder-1';

const row = (o: Partial<Artifact> = {}) =>
  ({
    id: 'a1',
    workspaceId: WS,
    createdByUserId: ME,
    parentFolderId: FOLDER,
    status: ArtifactStatus.READY,
    shareType: ArtifactShareType.PRIVATE,
    bucket: 'artifacts',
    objectKey: 'k/a.yaml',
    ...o,
  }) as Artifact;

describe('TemplatesService', () => {
  let service: TemplatesService;
  let artifacts: Record<string, jest.Mock>;
  let folders: { ensureTemplatesFolder: jest.Mock };
  let storage: { getFile: jest.Mock };
  let repo: { findOne: jest.Mock; createQueryBuilder: jest.Mock };
  let qb: Record<string, jest.Mock>;

  beforeEach(() => {
    artifacts = {
      createFromBuffer: jest.fn().mockResolvedValue({ id: 'a1' }),
      replaceContent: jest.fn().mockResolvedValue({ id: 'a1' }),
      update: jest.fn().mockResolvedValue({ id: 'a1' }),
      canRead: jest.fn().mockResolvedValue(true),
      toDto: jest.fn((r: Artifact) => ({ id: r.id })),
    };
    folders = {
      ensureTemplatesFolder: jest.fn().mockResolvedValue({ id: FOLDER }),
    };
    storage = {
      getFile: jest.fn().mockResolvedValue({
        file: { getStream: () => Readable.from([Buffer.from('id: a')]) },
      }),
    };
    qb = {};
    for (const m of [
      'leftJoinAndSelect',
      'where',
      'andWhere',
      'orderBy',
      'skip',
      'take',
    ]) {
      qb[m] = jest.fn(() => qb);
    }
    qb.getManyAndCount = jest.fn().mockResolvedValue([[row()], 1]);
    repo = {
      findOne: jest.fn().mockResolvedValue(row()),
      createQueryBuilder: jest.fn(() => qb),
    };
    service = new TemplatesService(
      repo as unknown as Repository<Artifact>,
      artifacts as unknown as ArtifactsService,
      folders as unknown as ArtifactFoldersService,
      storage as unknown as StorageService,
    );
  });

  describe('create', () => {
    it('create stores YAML in the templates folder', async () => {
      await service.create(WS, ME, { name: 'a.yaml', content: 'id: a' });
      expect(artifacts.createFromBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: WS,
          userId: ME,
          source: ArtifactSource.TEMPLATE,
          mimeType: 'application/yaml',
          parentFolderId: FOLDER,
          actorType: AuditActorType.User,
          name: 'a.yaml',
          buffer: Buffer.from('id: a'),
        }),
      );
    });

    it('rejects bad extension', async () => {
      await expect(
        service.create(WS, ME, { name: 'a.txt', content: 'id: a' }),
      ).rejects.toThrow(BadRequestException);
      expect(artifacts.createFromBuffer).not.toHaveBeenCalled();
    });

    it('rejects invalid YAML with line', async () => {
      await expect(
        service.create(WS, ME, { name: 'a.yaml', content: 'id: [x' }),
      ).rejects.toThrow(/line/);
    });

    it('rejects YAML without string id', async () => {
      await expect(
        service.create(WS, ME, { name: 'a.yaml', content: 'info: {}' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects content over 256 KB', async () => {
      await expect(
        service.create(WS, ME, {
          name: 'a.yaml',
          content: 'id: a\n' + 'x'.repeat(256 * 1024),
        }),
      ).rejects.toThrow(PayloadTooLargeException);
    });
  });

  describe('outside the templates folder', () => {
    it('404s for artifact outside templates folder', async () => {
      repo.findOne.mockResolvedValue(row({ parentFolderId: 'other' }));
      await expect(service.getContent(WS, ME, 'a1')).rejects.toThrow(
        NotFoundException,
      );
      await expect(
        service.saveContent(WS, ME, 'a1', { content: 'id: a' }),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.rename(WS, ME, 'a1', { name: 'b.yaml' }),
      ).rejects.toThrow(NotFoundException);
      expect(artifacts.replaceContent).not.toHaveBeenCalled();
      expect(artifacts.update).not.toHaveBeenCalled();
    });
  });

  describe('saveContent / rename', () => {
    it('rejects save by non-owner', async () => {
      artifacts.replaceContent.mockRejectedValue(new ForbiddenException());
      await expect(
        service.saveContent(WS, 'other', 'a1', { content: 'id: a' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('404s save and rename for a template the user cannot read', async () => {
      artifacts.canRead.mockResolvedValue(false);
      await expect(
        service.saveContent(WS, 'other', 'a1', { content: 'id: a' }),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.rename(WS, 'other', 'a1', { name: 'b.yaml' }),
      ).rejects.toThrow(NotFoundException);
      expect(artifacts.replaceContent).not.toHaveBeenCalled();
      expect(artifacts.update).not.toHaveBeenCalled();
    });

    it('rename changes only name and keeps objectKey', async () => {
      await service.rename(WS, ME, 'a1', { name: ' b.yml ' });
      expect(artifacts.update).toHaveBeenCalledWith(WS, ME, 'a1', { name: 'b.yml' });
    });

    it('rename by non-owner', async () => {
      artifacts.update.mockRejectedValue(new ForbiddenException());
      await expect(
        service.rename(WS, 'other', 'a1', { name: 'b.yaml' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getContent', () => {
    it('getContent returns text for a readable template', async () => {
      const res = await service.getContent(WS, ME, 'a1');
      expect(res.content).toBe('id: a');
      expect(storage.getFile).toHaveBeenCalledWith('k/a.yaml', 'artifacts');
    });

    it('404s for a template the user cannot read', async () => {
      artifacts.canRead.mockResolvedValue(false);
      await expect(service.getContent(WS, 'other', 'a1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('does not let artifact.manage read a private template', async () => {
      artifacts.canRead.mockResolvedValue(false);
      await expect(service.getContent(WS, 'other', 'a1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getMany', () => {
    const q = (scope: 'mine' | 'shared') =>
      ({ scope, page: 1, limit: 10, sortOrder: 'DESC' }) as never;
    const wheres = () => qb.andWhere.mock.calls.map((c) => c[0] as string);

    it('getMany mine filters by creator and folder', async () => {
      const res = await service.getMany(WS, ME, q('mine'));
      expect(wheres()).toEqual(
        expect.arrayContaining([
          'artifact.parentFolderId = :folderId',
          'artifact.createdByUserId = :userId',
        ]),
      );
      expect(res.data).toEqual([{ id: 'a1' }]);
    });

    it('getMany shared returns public or explicitly shared templates not owned by me', async () => {
      await service.getMany(WS, ME, q('shared'));
      const w = wheres().join('\n');
      expect(w).toContain('artifact.parentFolderId = :folderId');
      expect(w).toContain('artifact.createdByUserId IS NULL');
      expect(w).toContain(`artifact.shareType = 'public'`);
      expect(w).toContain('artifact_shares');
    });
  });
});
