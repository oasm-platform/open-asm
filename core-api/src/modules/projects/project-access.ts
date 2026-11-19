
import type { Repository } from 'typeorm';
import type { Project } from './entities/project.entity';
import { InvalidInputError, NotFoundError } from '@/common/errors/domain.errors';

/**
 * Loads a project of the workspace or throws 404. With `writable`, an
 * archived project is refused: archive makes every tab read-only until the
 * project is reopened.
 */
export async function findProjectOrFail(
  repo: Repository<Project>,
  id: string,
  workspaceId: string,
  opts: { writable?: boolean } = {},
): Promise<Project> {
  const project = await repo.findOne({
    where: { id, workspace: { id: workspaceId } },
  });
  if (!project) {
    throw new NotFoundError(`Project "${id}" not found`);
  }
  if (opts.writable && project.archivedAt) {
    throw new InvalidInputError(
      'The project is archived; reopen it to make changes',
    );
  }
  return project;
}
