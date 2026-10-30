import {
  ArtifactShareType,
  ArtifactSource,
  ArtifactStatus,
  AuditActorType,
} from '@/common/enums/enum';
import type { StorageService } from '@/modules/storage/storage.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { DataSource, Repository } from 'typeorm';
import type { EventBridgeService } from '../event-bridge/publishing/event-bridge.service';
import type { ArtifactQuotaService } from './artifact-quota.service';
import {
  ArtifactsService,
  PENDING_PURGE_GRACE_MS,
  PENDING_UPLOAD_TTL_SECONDS,
  toObjectKey,
} from './artifacts.service';
import type { ArtifactFolder } from './entities/artifact-folder.entity';
import type { ArtifactShare } from './entities/artifact-share.entity';
import type { Artifact } from './entities/artifact.entity';

const WS = '11111111-1111-4111-8111-111111111111';
const OWNER = 'owner-id';
const OTHER = 'other-id';

const makeArtifact = (overrides: Partial<Artifact> = {}): Artifact =>
  ({
    id: 'artifact-1',
    workspaceId: WS,
    createdByUserId: OWNER,
    createdBy: { id: OWNER, name: 'Owner', image: null, email: 'o@x.io' },
    source: ArtifactSource.UPLOAD,
    name: 'report.pdf',
    bucket: 'artifacts',
    objectKey: `workspaces/${WS}/artifact-1/report.pdf`,
    mimeType: 'application/pdf',
    sizeBytes: 100,
    shareType: ArtifactShareType.PRIVATE,
    status: ArtifactStatus.READY,
    metadata: {},
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as Artifact;

describe('ArtifactsService', () => {
  let service: ArtifactsService;
  let manager: Record<string, jest.Mock>;
  let artifactRepo: Record<string, jest.Mock>;
  let shareRepo: Record<string, jest.Mock>;
  let shareInsert: Record<string, jest.Mock>;
  let folderRepo: { findOneBy: jest.Mock };
  let membersRepo: { find: jest.Mock };
  let storage: Record<string, jest.Mock>;
  let quota: Record<string, jest.Mock>;
  let eventBridge: { publishSafely: jest.Mock };

  beforeEach(() => {
    manager = {
      findOne: jest.fn(),
      create: jest.fn((_entity, value: unknown) => value),
      save: jest.fn((value: unknown) => Promise.resolve(value)),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn(),
      insert: jest.fn(),
    };
    artifactRepo = {
      findOne: jest.fn(),
      findOneBy: jest.fn(),
      update: jest.fn(),
    };
    shareInsert = {
      insert: jest.fn(() => shareInsert),
      values: jest.fn(() => shareInsert),
      orIgnore: jest.fn(() => shareInsert),
      execute: jest.fn(),
    };
    shareRepo = {
      existsBy: jest.fn(),
      find: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(() => shareInsert),
    };
    membersRepo = { find: jest.fn() };
    folderRepo = { findOneBy: jest.fn() };
    storage = {
      getPresignedPost: jest.fn().mockResolvedValue({
        url: '/api/storage/artifacts',
        fields: { key: 'k' },
        expiresAt: new Date(),
      }),
      headObject: jest.fn(),
      deleteFile: jest.fn().mockResolvedValue(undefined),
      deleteByPrefix: jest.fn().mockResolvedValue({ deleted: 0, failed: 0 }),
      uploadFile: jest.fn(),
      getPresignedDownloadUrl: jest
        .fn()
        .mockResolvedValue({ url: 'signed', expiresIn: 300 }),
    };
    quota = {
      assertFileSize: jest.fn(),
      reserve: jest.fn(),
      commit: jest.fn(),
      releaseReserved: jest.fn().mockResolvedValue(undefined),
      releaseUsed: jest.fn(),
    };
    eventBridge = { publishSafely: jest.fn() };
    const dataSource = {
      transaction: jest.fn((cb: (m: unknown) => unknown) => cb(manager)),
      getRepository: jest.fn(() => membersRepo),
    };

    service = new ArtifactsService(
      artifactRepo as unknown as Repository<Artifact>,
      shareRepo as unknown as Repository<ArtifactShare>,
      folderRepo as unknown as Repository<ArtifactFolder>,
      dataSource as unknown as DataSource,
      storage as unknown as StorageService,
      quota as unknown as ArtifactQuotaService,
      eventBridge as unknown as EventBridgeService,
    );
  });

  describe('toObjectKey', () => {
    it('scopes keys by workspace and artifact and strips unsafe characters', () => {
      expect(toObjectKey('w', 'a', '../bá o?.txt')).toBe('workspaces/w/a/b__o_.txt');
      expect(toObjectKey('w', 'a', '...')).toBe('workspaces/w/a/file');
    });

    it('collapses consecutive dots, which storage rejects in a key', () => {
      expect(toObjectKey('w', 'a', 'v2..final...pdf')).toBe('workspaces/w/a/v2.final.pdf');
    });
  });

  describe('presignUpload', () => {
    it('reserves quota, records a pending file and pins the POST policy', async () => {
      const result = await service.presignUpload(WS, OWNER, {
        fileName: 'report.pdf',
        sizeBytes: 100,
        contentType: 'application/pdf',
      });

      expect(quota.reserve).toHaveBeenCalledWith(manager, WS, 100);
      const saved = manager.save.mock.calls[0][0] as Artifact;
      expect(saved).toMatchObject({
        workspaceId: WS,
        createdByUserId: OWNER,
        status: ArtifactStatus.PENDING,
        bucket: 'artifacts',
        sizeBytes: 100,
      });
      expect(saved.objectKey).toBe(`workspaces/${WS}/${saved.id}/report.pdf`);
      expect(storage.getPresignedPost).toHaveBeenCalledWith({
        bucket: 'artifacts',
        key: saved.objectKey,
        contentType: 'application/pdf',
        sizeBytes: 100,
        expiresIn: PENDING_UPLOAD_TTL_SECONDS,
      });
      expect(result.artifact).toMatchObject({ isOwner: true, status: 'pending' });
    });

    it('uploads into an owned folder and rejects anyone else\'s', async () => {
      folderRepo.findOneBy.mockResolvedValueOnce({ id: 'folder-1' });
      await service.presignUpload(WS, OWNER, {
        fileName: 'a.txt',
        sizeBytes: 1,
        contentType: 'text/plain',
        parentFolderId: 'folder-1',
      });
      expect((manager.save.mock.calls[0][0] as Artifact).parentFolderId).toBe(
        'folder-1',
      );

      folderRepo.findOneBy.mockResolvedValueOnce(null);
      await expect(
        service.presignUpload(WS, OWNER, {
          fileName: 'a.txt',
          sizeBytes: 1,
          contentType: 'text/plain',
          parentFolderId: 'folder-x',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(quota.reserve).toHaveBeenCalledTimes(1);
    });

    it('rejects files over the per-file limit before reserving', async () => {
      quota.assertFileSize.mockImplementation(() => {
        throw new PayloadTooLargeException();
      });
      await expect(
        service.presignUpload(WS, OWNER, {
          fileName: 'big.bin',
          sizeBytes: 1e12,
          contentType: 'application/octet-stream',
        }),
      ).rejects.toThrow(PayloadTooLargeException);
      expect(quota.reserve).not.toHaveBeenCalled();
    });
  });

  describe('completeUpload', () => {
    const pending = () =>
      makeArtifact({ status: ArtifactStatus.PENDING, expiresAt: new Date() });

    it('commits the reservation and marks the file ready', async () => {
      manager.findOne.mockResolvedValue(pending());
      storage.headObject.mockResolvedValue({ contentLength: 100 });
      artifactRepo.findOne.mockResolvedValue(makeArtifact());

      await expect(service.completeUpload(WS, OWNER, 'artifact-1')).resolves.toMatchObject({
        id: 'artifact-1',
        status: 'ready',
      });
      expect(quota.commit).toHaveBeenCalledWith(manager, WS, 100);
      expect(manager.update).toHaveBeenCalledWith(
        expect.anything(),
        { id: 'artifact-1', status: ArtifactStatus.PENDING },
        { status: ArtifactStatus.READY },
      );
    });

    it('deletes the object and releases the reservation on a size mismatch', async () => {
      manager.findOne.mockResolvedValue(pending());
      storage.headObject.mockResolvedValue({ contentLength: 999 });

      await expect(service.completeUpload(WS, OWNER, 'artifact-1')).rejects.toThrow(
        ConflictException,
      );
      expect(storage.deleteFile).toHaveBeenCalledWith(pending().objectKey, 'artifacts');
      expect(quota.releaseReserved).toHaveBeenCalledWith(manager, WS, 100);
      expect(manager.delete).toHaveBeenCalled();
      expect(quota.commit).not.toHaveBeenCalled();
    });

    it('returns 400 when nothing was uploaded yet', async () => {
      manager.findOne.mockResolvedValue(pending());
      storage.headObject.mockRejectedValue(new NotFoundException());

      await expect(service.completeUpload(WS, OWNER, 'artifact-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(quota.commit).not.toHaveBeenCalled();
    });

    it('returns 404 for a file the caller did not create', async () => {
      manager.findOne.mockResolvedValue(null);
      await expect(service.completeUpload(WS, OTHER, 'artifact-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('visibility', () => {
    it('hides a private file from other members', async () => {
      artifactRepo.findOne.mockResolvedValue(makeArtifact());
      await expect(service.getDownloadUrl(WS, OTHER, 'artifact-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lets a member the file is shared with download it as an opaque attachment', async () => {
      artifactRepo.findOne.mockResolvedValue(
        makeArtifact({ shareType: ArtifactShareType.SHARED, mimeType: 'text/javascript' }),
      );
      shareRepo.existsBy.mockResolvedValue(true);

      await expect(service.getDownloadUrl(WS, OTHER, 'artifact-1')).resolves.toEqual({
        url: 'signed',
        expiresIn: 300,
      });
      expect(storage.getPresignedDownloadUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: 'report.pdf',
          contentType: 'application/octet-stream',
          expiresIn: 300,
        }),
      );
    });

    it('hides a shared file from members not on the share list', async () => {
      artifactRepo.findOne.mockResolvedValue(
        makeArtifact({ shareType: ArtifactShareType.SHARED }),
      );
      shareRepo.existsBy.mockResolvedValue(false);
      await expect(service.getDownloadUrl(WS, OTHER, 'artifact-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('gives artifact.manage metadata but not content of a private file', async () => {
      artifactRepo.findOne.mockResolvedValue(makeArtifact());

      await expect(
        service.getById(WS, OTHER, 'artifact-1', ['artifact.manage']),
      ).resolves.toMatchObject({ id: 'artifact-1', isOwner: false });
      await expect(service.getDownloadUrl(WS, OTHER, 'artifact-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('exposes only id, name and image of the creator', async () => {
      artifactRepo.findOne.mockResolvedValue(makeArtifact());
      const dto = await service.getById(WS, OWNER, 'artifact-1', []);
      expect(dto.createdBy).toEqual({ id: OWNER, name: 'Owner', image: null });
    });

    it('serves public downloads only for public ready files', async () => {
      artifactRepo.findOneBy.mockResolvedValue(null);
      await expect(service.getPublicDownloadUrl('artifact-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(artifactRepo.findOneBy).toHaveBeenCalledWith({
        id: 'artifact-1',
        status: ArtifactStatus.READY,
        shareType: ArtifactShareType.PUBLIC,
      });
    });
  });

  describe('update', () => {
    it('refuses changes from a member who is not the owner', async () => {
      artifactRepo.findOne.mockResolvedValue(
        makeArtifact({ shareType: ArtifactShareType.PUBLIC }),
      );
      await expect(
        service.update(WS, OTHER, 'artifact-1', { shareType: ArtifactShareType.PRIVATE }),
      ).rejects.toThrow(ForbiddenException);
      expect(artifactRepo.update).not.toHaveBeenCalled();
    });

    it('moves a file into one of the owner\'s folders, or back to the root', async () => {
      artifactRepo.findOne.mockResolvedValue(makeArtifact());
      folderRepo.findOneBy.mockResolvedValue({ id: 'folder-1' });

      await service.update(WS, OWNER, 'artifact-1', { parentFolderId: 'folder-1' });
      expect(folderRepo.findOneBy).toHaveBeenCalledWith({
        id: 'folder-1',
        workspaceId: WS,
        createdByUserId: OWNER,
      });
      expect(artifactRepo.update).toHaveBeenLastCalledWith('artifact-1', {
        parentFolderId: 'folder-1',
      });

      await service.update(WS, OWNER, 'artifact-1', { parentFolderId: null });
      expect(artifactRepo.update).toHaveBeenLastCalledWith('artifact-1', {
        parentFolderId: null,
      });
    });

    it('refuses to move a file into a folder the caller does not own', async () => {
      artifactRepo.findOne.mockResolvedValue(makeArtifact());
      folderRepo.findOneBy.mockResolvedValue(null);

      await expect(
        service.update(WS, OWNER, 'artifact-1', { parentFolderId: 'folder-x' }),
      ).rejects.toThrow(NotFoundException);
      expect(artifactRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('addShares', () => {
    it('shares only with workspace members and never with the owner', async () => {
      artifactRepo.findOne.mockResolvedValue(makeArtifact());
      membersRepo.find.mockResolvedValue([
        { user: { id: 'member-1', email: 'a@x.io' } },
        { user: { id: OWNER, email: 'o@x.io' } },
      ]);

      const result = await service.addShares(WS, OWNER, 'artifact-1', [
        'A@x.io',
        'a@x.io',
        'o@x.io',
        'outsider@y.io',
      ]);

      expect(membersRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspace: { id: WS } }),
        }),
      );
      expect(shareInsert.values).toHaveBeenCalledWith([
        { artifactId: 'artifact-1', userId: 'member-1' },
      ]);
      expect(shareInsert.orIgnore).toHaveBeenCalled();
      expect(result).toEqual({ shared: 1, skipped: 2 });
    });
  });

  describe('remove', () => {
    it('refuses members who neither own the file nor hold artifact.manage', async () => {
      artifactRepo.findOne.mockResolvedValue(
        makeArtifact({ shareType: ArtifactShareType.PUBLIC }),
      );
      await expect(
        service.remove(WS, OTHER, 'artifact-1', ['artifact.write']),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses the owner without artifact.write', async () => {
      artifactRepo.findOne.mockResolvedValue(makeArtifact());
      await expect(
        service.remove(WS, OWNER, 'artifact-1', ['artifact.read']),
      ).rejects.toThrow(ForbiddenException);
      expect(artifactRepo.update).not.toHaveBeenCalled();
    });

    it('lets the owner with artifact.write delete', async () => {
      artifactRepo.findOne.mockResolvedValue(makeArtifact());
      manager.findOne.mockResolvedValue(
        makeArtifact({ status: ArtifactStatus.DELETED, source: ArtifactSource.AGENT }),
      );

      await expect(
        service.remove(WS, OWNER, 'artifact-1', ['artifact.read', 'artifact.write']),
      ).resolves.toEqual({ message: 'File deleted' });
      expect(quota.releaseUsed).toHaveBeenCalledWith(manager, WS, 100);
    });

    it('lets artifact.manage delete and releases used bytes after the object is gone', async () => {
      artifactRepo.findOne.mockResolvedValue(makeArtifact());
      manager.findOne.mockResolvedValue(makeArtifact({ status: ArtifactStatus.DELETED }));

      await expect(
        service.remove(WS, OTHER, 'artifact-1', ['artifact.manage']),
      ).resolves.toEqual({ message: 'File deleted' });
      expect(artifactRepo.update).toHaveBeenCalledWith(
        { id: 'artifact-1', status: ArtifactStatus.READY },
        { status: ArtifactStatus.DELETED },
      );
      expect(storage.deleteFile).toHaveBeenCalled();
      expect(quota.releaseUsed).toHaveBeenCalledWith(manager, WS, 100);
      expect(manager.delete).toHaveBeenCalled();
    });
  });

  describe('purgeStale', () => {
    it('takes the oldest rows first and moves a failing one to the back', async () => {
      const qb: Record<string, jest.Mock> = {};
      for (const method of ['select', 'where', 'andWhere', 'orderBy', 'limit']) {
        qb[method] = jest.fn(() => qb);
      }
      qb.getMany = jest.fn().mockResolvedValue([{ id: 'bad' }, { id: 'good' }]);
      artifactRepo.createQueryBuilder = jest.fn(() => qb);
      manager.findOne.mockImplementation((_entity, { where }: { where: { id: string } }) =>
        Promise.resolve(makeArtifact({ id: where.id, status: ArtifactStatus.DELETED })),
      );
      storage.deleteFile.mockRejectedValueOnce(new InternalServerErrorException());

      await expect(service.purgeStale()).resolves.toBe(1);
      expect(qb.orderBy).toHaveBeenCalledWith('artifact.updatedAt', 'ASC');
      expect(artifactRepo.update).toHaveBeenCalledTimes(1);
      expect(artifactRepo.update).toHaveBeenCalledWith('bad', {
        updatedAt: expect.any(Function),
      });
    });
  });

  describe('purge', () => {
    it('keeps the row and the usage when the object delete fails', async () => {
      manager.findOne.mockResolvedValue(makeArtifact({ status: ArtifactStatus.DELETED }));
      storage.deleteFile.mockRejectedValue(new InternalServerErrorException());

      await expect(service.purge('artifact-1')).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(quota.releaseUsed).not.toHaveBeenCalled();
      expect(manager.delete).not.toHaveBeenCalled();
    });

    it('treats an already missing object as deleted', async () => {
      manager.findOne.mockResolvedValue(
        makeArtifact({ status: ArtifactStatus.PENDING }),
      );
      storage.deleteFile.mockRejectedValue(new NotFoundException());

      await service.purge('artifact-1');
      expect(quota.releaseReserved).toHaveBeenCalledWith(manager, WS, 100);
      expect(manager.delete).toHaveBeenCalled();
    });

    it('keeps a deleted row while its upload form could still recreate the object', async () => {
      manager.findOne.mockResolvedValue(
        makeArtifact({ status: ArtifactStatus.DELETED, expiresAt: new Date() }),
      );
      await service.purge('artifact-1');
      expect(storage.deleteFile).not.toHaveBeenCalled();
      expect(quota.releaseUsed).not.toHaveBeenCalled();
      expect(manager.delete).not.toHaveBeenCalled();
    });

    it('purges a deleted agent file at once: it never had an upload form', async () => {
      manager.findOne.mockResolvedValue(
        makeArtifact({
          status: ArtifactStatus.DELETED,
          source: ArtifactSource.AGENT,
          expiresAt: new Date(),
        }),
      );
      await service.purge('artifact-1');
      expect(storage.deleteFile).toHaveBeenCalled();
      expect(quota.releaseUsed).toHaveBeenCalledWith(manager, WS, 100);
      expect(manager.delete).toHaveBeenCalled();
    });

    it('purges a deleted row once its upload form has expired', async () => {
      manager.findOne.mockResolvedValue(
        makeArtifact({
          status: ArtifactStatus.DELETED,
          expiresAt: new Date(Date.now() - PENDING_PURGE_GRACE_MS - 1000),
        }),
      );
      await service.purge('artifact-1');
      expect(storage.deleteFile).toHaveBeenCalled();
      expect(quota.releaseUsed).toHaveBeenCalledWith(manager, WS, 100);
      expect(manager.delete).toHaveBeenCalled();
    });

    it('leaves a file that became ready alone', async () => {
      manager.findOne.mockResolvedValue(makeArtifact());
      await service.purge('artifact-1');
      expect(storage.deleteFile).not.toHaveBeenCalled();
      expect(manager.delete).not.toHaveBeenCalled();
    });
  });

  describe('createFromBuffer', () => {
    it('uploads, commits usage, records the agent source and audits the save', async () => {
      const dto = await service.createFromBuffer({
        workspaceId: WS,
        userId: OWNER,
        source: ArtifactSource.AGENT,
        name: 'notes.md',
        mimeType: 'text/markdown',
        buffer: Buffer.from('hello'),
        metadata: { conversationId: 'c-1' },
      });

      expect(quota.reserve).toHaveBeenCalledWith(manager, WS, 5);
      expect(storage.uploadFile).toHaveBeenCalledWith(
        expect.stringMatching(/notes\.md$/),
        Buffer.from('hello'),
        'artifacts',
        'text/markdown',
      );
      expect(quota.commit).toHaveBeenCalledWith(manager, WS, 5);
      expect(dto).toMatchObject({ source: 'agent', status: 'ready', sizeBytes: 5 });
      expect(eventBridge.publishSafely).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'artifact.created' }),
        expect.objectContaining({
          workspaceId: WS,
          actor: { type: AuditActorType.Agent, id: OWNER },
          resourceType: 'artifact',
          resourceId: dto.id,
        }),
        { subject: `workspace:${WS}/artifact:${dto.id}` },
      );
    });

    it('releases the reservation when the upload fails', async () => {
      storage.uploadFile.mockRejectedValue(new Error('s3 down'));
      manager.findOne.mockResolvedValue(
        makeArtifact({ status: ArtifactStatus.PENDING, sizeBytes: 5 }),
      );

      await expect(
        service.createFromBuffer({
          workspaceId: WS,
          userId: OWNER,
          source: ArtifactSource.AGENT,
          name: 'notes.md',
          mimeType: 'text/markdown',
          buffer: Buffer.from('hello'),
        }),
      ).rejects.toThrow('s3 down');
      expect(quota.releaseReserved).toHaveBeenCalledWith(manager, WS, 5);
      expect(quota.commit).not.toHaveBeenCalled();
      expect(eventBridge.publishSafely).not.toHaveBeenCalled();
    });

    it('deletes the object when the row went away during the upload', async () => {
      // Workspace deleted mid-upload: the row cascaded, so nothing turns ready.
      manager.update.mockResolvedValue({ affected: 0 });
      manager.findOne.mockResolvedValue(null);

      await expect(
        service.createFromBuffer({
          workspaceId: WS,
          userId: OWNER,
          source: ArtifactSource.AGENT,
          name: 'notes.md',
          mimeType: 'text/markdown',
          buffer: Buffer.from('hello'),
        }),
      ).rejects.toThrow(NotFoundException);
      expect(quota.commit).not.toHaveBeenCalled();
      expect(storage.deleteFile).toHaveBeenCalledWith(
        expect.stringMatching(/notes\.md$/),
        'artifacts',
      );
    });

    it('places the file in parentFolderId', async () => {
      await service.createFromBuffer({
        workspaceId: WS,
        userId: OWNER,
        source: ArtifactSource.TEMPLATE,
        name: 't.yaml',
        mimeType: 'application/yaml',
        buffer: Buffer.from('id: x'),
        parentFolderId: 'folder-1',
      });
      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({ parentFolderId: 'folder-1' }),
      );
    });

    it('publishes created with the given actor type', async () => {
      await service.createFromBuffer({
        workspaceId: WS,
        userId: OWNER,
        source: ArtifactSource.TEMPLATE,
        name: 't.yaml',
        mimeType: 'application/yaml',
        buffer: Buffer.from('id: x'),
        actorType: AuditActorType.User,
      });
      expect(eventBridge.publishSafely).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ actor: { type: 'user', id: OWNER } }),
        expect.anything(),
      );
    });
  });

  describe('replaceContent', () => {
    const buffer = Buffer.alloc(25);
    const row = (o: Partial<Artifact> = {}) =>
      makeArtifact({
        sizeBytes: 10,
        mimeType: 'application/yaml',
        objectKey: 'k.yaml',
        ...o,
      });
    beforeEach(() => artifactRepo.findOne.mockResolvedValue(row({ sizeBytes: 25 })));

    it('swaps usage from old to new size', async () => {
      manager.findOne.mockResolvedValue(row());
      const order: string[] = [];
      for (const [name, fn] of [
        ['releaseUsed', quota.releaseUsed],
        ['reserve', quota.reserve],
        ['upload', storage.uploadFile],
        ['commit', quota.commit],
      ] as const) {
        fn.mockImplementation(() => {
          order.push(name);
        });
      }

      await service.replaceContent(WS, OWNER, 'artifact-1', buffer);

      expect(manager.findOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
      expect(quota.assertFileSize).toHaveBeenCalledWith(25);
      expect(quota.reserve).toHaveBeenCalledWith(manager, WS, 25);
      expect(storage.uploadFile).toHaveBeenCalledWith('k.yaml', buffer, 'artifacts', 'application/yaml');
      expect(quota.releaseUsed).toHaveBeenCalledWith(manager, WS, 10);
      expect(quota.commit).toHaveBeenCalledWith(manager, WS, 25);
      expect(order).toEqual(['releaseUsed', 'reserve', 'upload', 'commit']);
      expect(manager.save).toHaveBeenCalledWith(expect.objectContaining({ sizeBytes: 25 }));
    });

    it('rejects a non-owner', async () => {
      manager.findOne.mockResolvedValue(row({ createdByUserId: OTHER }));
      await expect(service.replaceContent(WS, OWNER, 'artifact-1', buffer)).rejects.toThrow(
        ForbiddenException,
      );
      expect(quota.reserve).not.toHaveBeenCalled();
      expect(storage.uploadFile).not.toHaveBeenCalled();
    });

    it('404s for missing or non-ready rows', async () => {
      manager.findOne.mockResolvedValue(null);
      await expect(service.replaceContent(WS, OWNER, 'artifact-1', buffer)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('leaves object and usage untouched when quota is full', async () => {
      manager.findOne.mockResolvedValue(row());
      quota.reserve.mockRejectedValue(new ConflictException('full'));
      await expect(service.replaceContent(WS, OWNER, 'artifact-1', buffer)).rejects.toThrow(
        ConflictException,
      );
      // releaseUsed runs first but shares the transaction, so the rollback undoes it.
      expect(storage.uploadFile).not.toHaveBeenCalled();
      expect(quota.commit).not.toHaveBeenCalled();
    });

    it('lets a full workspace shrink a file', async () => {
      manager.findOne.mockResolvedValue(row());
      await service.replaceContent(WS, OWNER, 'artifact-1', Buffer.alloc(5));
      expect(quota.releaseUsed).toHaveBeenCalledWith(manager, WS, 10);
      expect(quota.reserve).toHaveBeenCalledWith(manager, WS, 5);
      expect(quota.releaseUsed.mock.invocationCallOrder[0]).toBeLessThan(
        quota.reserve.mock.invocationCallOrder[0],
      );
    });

    it('releases the reservation when upload fails', async () => {
      manager.findOne.mockResolvedValue(row());
      storage.uploadFile.mockRejectedValue(new Error('s3 down'));
      await expect(service.replaceContent(WS, OWNER, 'artifact-1', buffer)).rejects.toThrow(
        's3 down',
      );
      expect(quota.releaseReserved).toHaveBeenCalledWith(manager, WS, 25);
      expect(quota.commit).not.toHaveBeenCalled();
    });
  });

  describe('deleteWorkspaceObjects', () => {
    it('deletes everything under the workspace prefix', async () => {
      await service.deleteWorkspaceObjects(WS);
      expect(storage.deleteByPrefix).toHaveBeenCalledWith('artifacts', `workspaces/${WS}/`);
    });

    it('never throws: the workspace is already gone', async () => {
      storage.deleteByPrefix.mockRejectedValue(new Error('s3 down'));
      await expect(service.deleteWorkspaceObjects(WS)).resolves.toBeUndefined();
    });
  });
});
