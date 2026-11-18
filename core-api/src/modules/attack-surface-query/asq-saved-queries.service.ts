import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AttackSurfaceQueryService } from './attack-surface-query.service';
import { AsqError } from './domain/query-errors';
import type { QueryScope } from './domain/query.types';
import type { CreateSavedQueryDto, UpdateSavedQueryDto } from './dto/attack-surface-query.dto';
import { AsqSavedQuery } from './entities/asq-saved-query.entity';

/** Unique (workspaceId, name) violation. */
const isDuplicate = (err: unknown) => (err as { code?: string })?.code === '23505';

/**
 * Named query batches of a workspace. A spec is validated against the
 * catalog and the author's permissions when saved, and again on every run.
 */
@Injectable()
export class AsqSavedQueriesService {
  constructor(
    @InjectRepository(AsqSavedQuery)
    private readonly repo: Repository<AsqSavedQuery>,
    private readonly attackSurfaceQuery: AttackSurfaceQueryService,
  ) {}

  list(workspaceId: string): Promise<AsqSavedQuery[]> {
    return this.repo.find({ where: { workspaceId }, order: { name: 'ASC' } });
  }

  /** NOT_FOUND for an id of another workspace, never a 403. */
  async get(workspaceId: string, id: string): Promise<AsqSavedQuery> {
    const row = await this.repo.findOne({ where: { id, workspaceId } });
    if (!row) throw new AsqError('NOT_FOUND', 'Saved query not found');
    return row;
  }

  async create(scope: QueryScope, userId: string, dto: CreateSavedQueryDto): Promise<AsqSavedQuery> {
    this.attackSurfaceQuery.validate(scope, dto.spec);
    try {
      return await this.repo.save(
        this.repo.create({
          workspaceId: scope.workspaceId,
          name: dto.name.trim(),
          description: dto.description ?? null,
          spec: dto.spec,
          createdBy: userId,
        }),
      );
    } catch (err) {
      if (isDuplicate(err)) throw new AsqError('INVALID_QUERY', `A saved query named "${dto.name}" already exists`);
      throw err;
    }
  }

  async update(scope: QueryScope, id: string, dto: UpdateSavedQueryDto): Promise<AsqSavedQuery> {
    const row = await this.get(scope.workspaceId, id);
    if (dto.spec) this.attackSurfaceQuery.validate(scope, dto.spec);
    if (dto.name !== undefined) row.name = dto.name.trim();
    if (dto.description !== undefined) row.description = dto.description;
    if (dto.spec !== undefined) row.spec = dto.spec;
    try {
      return await this.repo.save(row);
    } catch (err) {
      if (isDuplicate(err)) throw new AsqError('INVALID_QUERY', `A saved query named "${row.name}" already exists`);
      throw err;
    }
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const row = await this.get(workspaceId, id);
    await this.repo.delete({ id: row.id, workspaceId });
  }

  /** Runs a saved batch as the caller (their permissions, now). */
  async run(scope: QueryScope, id: string) {
    const row = await this.get(scope.workspaceId, id);
    return this.attackSurfaceQuery.run(scope, row.spec);
  }

  /** Runs a (saved, possibly adjusted) spec as the caller: query reports. */
  runSpec(scope: QueryScope, spec: Record<string, unknown>) {
    return this.attackSurfaceQuery.run(scope, spec);
  }
}
