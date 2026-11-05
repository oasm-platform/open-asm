import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { Readable } from 'node:stream';

import { ProjectFilesService, PROJECT_FILE_LIMIT } from './project-files.service';

const P1 = 'p1';
const W1 = 'w1';

function setup(opts: { linked?: number; archived?: boolean } = {}) {
  const projectRepo = {
    findOne: jest.fn().mockResolvedValue({
      id: P1,
      archivedAt: opts.archived ? new Date() : null,
    }),
  };
  const linkRepo = {
    count: jest.fn().mockResolvedValue(opts.linked ?? 0),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
  };
  const execute = jest.fn();
  const manager = {
    query: jest.fn(),
    count: jest.fn().mockResolvedValue(opts.linked ?? 0),
    createQueryBuilder: () => ({
      insert: () => ({ into: () => ({ values: () => ({ orIgnore: () => ({ execute }) }) }) }),
    }),
  };
  const dataSource = {
    query: jest.fn().mockResolvedValue([]),
    transaction: jest.fn((fn: (m: typeof manager) => unknown) => fn(manager)),
  };
  const artifacts = {
    presignUpload: jest.fn().mockResolvedValue({ artifact: { id: 'a1' }, upload: {} }),
    completeUpload: jest.fn().mockResolvedValue({ id: 'a1' }),
  };
  const storage = { getFile: jest.fn() };
  const service = new ProjectFilesService(
    projectRepo as never,
    linkRepo as never,
    dataSource as never,
    artifacts as never,
    storage as never,
  );
  return { service, artifacts, linkRepo, storage, execute };
}

const fileBody = (text: string) => ({
  file: { getStream: () => Readable.from([Buffer.from(text)]) },
});

describe('ProjectFilesService', () => {
  it('presigns a markdown file with its type from the extension', async () => {
    const { service, artifacts } = setup();

    await service.presign(P1, W1, 'u1', { fileName: 'Scope.MD', sizeBytes: 10 });

    expect(artifacts.presignUpload).toHaveBeenCalledWith(W1, 'u1', {
      fileName: 'Scope.MD',
      sizeBytes: 10,
      contentType: 'text/markdown',
    });
  });

  it.each(['report.pdf', 'sheet.xlsx', 'notes'])('refuses %s', async (fileName) => {
    const { service, artifacts } = setup();

    await expect(
      service.presign(P1, W1, 'u1', { fileName, sizeBytes: 10 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(artifacts.presignUpload).not.toHaveBeenCalled();
  });

  it('refuses a file over 10 MB', async () => {
    const { service } = setup();

    await expect(
      service.presign(P1, W1, 'u1', { fileName: 'a.txt', sizeBytes: 10 * 1024 * 1024 + 1 }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
  });

  it(`refuses a ${PROJECT_FILE_LIMIT + 1}th file at presign and at attach`, async () => {
    const { service, artifacts, execute } = setup({ linked: PROJECT_FILE_LIMIT });

    await expect(
      service.presign(P1, W1, 'u1', { fileName: 'a.csv', sizeBytes: 10 }),
    ).rejects.toThrow(`at most ${PROJECT_FILE_LIMIT} files`);
    await expect(service.complete(P1, W1, 'u1', 'a1')).rejects.toThrow(
      `at most ${PROJECT_FILE_LIMIT} files`,
    );
    expect(artifacts.presignUpload).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('attaches a finished upload', async () => {
    const { service, artifacts, execute } = setup({ linked: 2 });

    await service.complete(P1, W1, 'u1', 'a1');

    expect(artifacts.completeUpload).toHaveBeenCalledWith(W1, 'u1', 'a1');
    expect(execute).toHaveBeenCalled();
  });

  it('changes nothing on an archived project', async () => {
    const { service, linkRepo } = setup({ archived: true });

    await expect(service.remove(P1, W1, 'a1')).rejects.toThrow('archived');
    expect(linkRepo.delete).not.toHaveBeenCalled();
  });

  it('only detaches a removed file', async () => {
    const { service, linkRepo } = setup();

    await service.remove(P1, W1, 'a1');

    expect(linkRepo.delete).toHaveBeenCalledWith({ projectId: P1, artifactId: 'a1' });
  });

  it('cuts prompt files to their share of the budget', async () => {
    const { service, linkRepo, storage } = setup();
    linkRepo.find.mockResolvedValue([
      { artifact: { id: 'a1', name: 'one.md', objectKey: 'k1', bucket: 'artifacts' } },
      { artifact: { id: 'a2', name: 'two.md', objectKey: 'k2', bucket: 'artifacts' } },
    ]);
    storage.getFile
      .mockResolvedValueOnce(fileBody('x'.repeat(50)))
      .mockResolvedValueOnce(fileBody('y'.repeat(50)));

    const files = await service.contextFiles(P1, { perFile: 40, total: 60 });

    expect(files.map((f) => [f.content.length, f.totalChars])).toEqual([
      [40, 50],
      [20, 50],
    ]);
  });
});
