import { ArtifactStatus } from '@/common/enums/enum';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IsNull, type DataSource, type Repository } from 'typeorm';
import { ArtifactFoldersService } from './artifact-folders.service';
import type { ArtifactsService } from './artifacts.service';
import type { ArtifactFolder } from './entities/artifact-folder.entity';

const WS = 'ws-1';
const OWNER = 'owner-id';

const folder = (overrides: Partial<ArtifactFolder> = {}) =>
  ({
    id: 'f-1',
    workspaceId: WS,
    createdByUserId: OWNER,
    name: 'Reports',
    parentFolderId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as ArtifactFolder;

describe('ArtifactFoldersService', () => {
  let service: ArtifactFoldersService;
  let folderRepo: Record<string, jest.Mock>;
  let manager: Record<string, jest.Mock>;
  let dataSource: { query: jest.Mock; transaction: jest.Mock };
  let artifacts: { findOwnedFolder: jest.Mock; findReadableFolder: jest.Mock };

  beforeEach(() => {
    folderRepo = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((value: unknown) => value),
      save: jest.fn((value: ArtifactFolder) => Promise.resolve({ ...folder(), ...value })),
    };
    manager = {
      query: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn((value: ArtifactFolder) => Promise.resolve(value)),
      update: jest.fn(),
      delete: jest.fn(),
    };
    dataSource = {
      query: jest.fn(),
      transaction: jest.fn((cb: (m: unknown) => unknown) => cb(manager)),
    };
    artifacts = {
      findOwnedFolder: jest.fn().mockResolvedValue(folder()),
      findReadableFolder: jest.fn().mockResolvedValue(folder()),
    };
    service = new ArtifactFoldersService(
      folderRepo as unknown as Repository<ArtifactFolder>,
      dataSource as unknown as DataSource,
      artifacts as unknown as ArtifactsService,
    );
  });

  it('lists only the caller\'s folders under a parent they own', async () => {
    await service.getMany(WS, OWNER, 'f-1');
    expect(artifacts.findOwnedFolder).toHaveBeenCalledWith(WS, OWNER, 'f-1');
    expect(folderRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: WS,
          createdByUserId: OWNER,
          parentFolderId: 'f-1',
        }),
      }),
    );

    artifacts.findOwnedFolder.mockRejectedValue(new NotFoundException());
    await expect(service.getMany(WS, 'someone-else', 'f-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  const TEMPLATES = {
    workspaceId: WS,
    parentFolderId: IsNull(),
    createdByUserId: IsNull(),
    name: 'custom-templates',
  };

  it('ensureTemplatesFolder takes the advisory lock then returns the existing folder', async () => {
    const existing = folder({ name: 'custom-templates', createdByUserId: null });
    manager.findOne.mockResolvedValue(existing);
    await expect(service.ensureTemplatesFolder(WS)).resolves.toBe(existing);
    expect(manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['artifact-folders:templates:ws-1'],
    );
    expect(manager.query.mock.invocationCallOrder[0]).toBeLessThan(
      manager.findOne.mock.invocationCallOrder[0],
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('ensureTemplatesFolder creates it when missing', async () => {
    manager.findOne.mockResolvedValue(null);
    await service.ensureTemplatesFolder(WS);
    expect(manager.save).toHaveBeenCalledWith({
      workspaceId: WS,
      createdByUserId: null,
      parentFolderId: null,
      name: 'custom-templates',
    });
  });

  it('ensureTemplatesFolder looks up the oldest match', async () => {
    manager.findOne.mockResolvedValue(folder());
    await service.ensureTemplatesFolder(WS);
    expect(manager.findOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ where: TEMPLATES, order: { createdAt: 'ASC' } }),
    );
  });

  it('root listing includes the workspace templates folder', async () => {
    manager.findOne.mockResolvedValue(folder());
    await service.getMany(WS, OWNER);
    expect(folderRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: [
          { workspaceId: WS, createdByUserId: OWNER, parentFolderId: IsNull() },
          TEMPLATES,
        ],
      }),
    );
  });

  it('getById resolves through findReadableFolder', async () => {
    dataSource.query.mockResolvedValue([]);
    await service.getById(WS, OWNER, 'f-1');
    expect(artifacts.findReadableFolder).toHaveBeenCalledWith(WS, OWNER, 'f-1');
    expect(artifacts.findOwnedFolder).not.toHaveBeenCalled();
  });

  it('update and remove still require ownership', async () => {
    manager.query.mockResolvedValue([]);
    dataSource.query.mockResolvedValue([{ id: 'f-1' }]);
    await service.update(WS, OWNER, 'f-1', { name: 'x' });
    await service.remove(WS, OWNER, 'f-1');
    expect(artifacts.findOwnedFolder).toHaveBeenCalledTimes(2);
    expect(artifacts.findReadableFolder).not.toHaveBeenCalled();
  });

  it('returns the breadcrumb path with the folder', async () => {
    dataSource.query.mockResolvedValue([
      { id: 'root', name: 'Root' },
      { id: 'f-1', name: 'Reports' },
    ]);
    await expect(service.getById(WS, OWNER, 'f-1')).resolves.toMatchObject({
      id: 'f-1',
      path: [
        { id: 'root', name: 'Root' },
        { id: 'f-1', name: 'Reports' },
      ],
    });
  });

  const subtree = (rows: { id: string }[]) => (sql: string) =>
    Promise.resolve(sql.includes('pg_advisory_xact_lock') ? [] : rows);

  it('refuses to move a folder into its own subtree', async () => {
    manager.query.mockImplementation(subtree([{ id: 'f-1' }, { id: 'f-child' }]));

    await expect(
      service.update(WS, OWNER, 'f-1', { parentFolderId: 'f-child' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.update(WS, OWNER, 'f-1', { parentFolderId: 'f-1' }),
    ).rejects.toThrow(BadRequestException);
    expect(folderRepo.save).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('checks and saves a move under a per-user lock', async () => {
    manager.query.mockImplementation(subtree([{ id: 'f-1' }]));

    await expect(
      service.update(WS, OWNER, 'f-1', { parentFolderId: 'f-other' }),
    ).resolves.toMatchObject({ parentFolderId: 'f-other' });
    expect(manager.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('pg_advisory_xact_lock'),
      [`artifact-folders:${WS}:${OWNER}`],
    );
    expect(manager.save).toHaveBeenCalled();
  });

  it('renames and moves a folder to the root', async () => {
    await expect(
      service.update(WS, OWNER, 'f-1', { name: 'Q4', parentFolderId: null }),
    ).resolves.toMatchObject({ name: 'Q4', parentFolderId: null });
  });

  it('deletes the subtree and marks its files deleted for the sweep', async () => {
    dataSource.query.mockResolvedValue([{ id: 'f-1' }, { id: 'f-child' }]);

    await expect(service.remove(WS, OWNER, 'f-1')).resolves.toEqual({
      message: 'Folder deleted',
    });

    expect(manager.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: ArtifactStatus.READY }),
      { status: ArtifactStatus.DELETED, parentFolderId: null },
    );
    expect(manager.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.not.objectContaining({ status: expect.anything() }),
      { parentFolderId: null },
    );
    expect(manager.delete).toHaveBeenCalled();
  });
});
