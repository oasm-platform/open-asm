import { SortOrder } from '@/common/dtos/get-many-base.dto';
import type { User } from '@/modules/auth/entities/user.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { getManyResponse } from '@/utils/getManyResponse';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AdminWorkspaceDto,
  AdminWorkspaceUserDto,
  GetManyAdminWorkspacesDto,
  UpdateAdminWorkspaceDto,
} from './dto/admin-workspaces.dto';

// Injection-safe sort column lookup: sortBy becomes a bare identifier.
const SORT_COLUMNS: Record<string, string> = {
  name: 'name',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  archivedAt: 'archivedAt',
};

interface WorkspaceCounts {
  targetCount: number;
  memberCount: number;
}

const NO_COUNTS: WorkspaceCounts = { targetCount: 0, memberCount: 0 };

function toAdminWorkspaceUserDto(
  user: User | null | undefined,
): AdminWorkspaceUserDto | null {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image ?? null,
  };
}

/**
 * Picks the admin-visible fields. The entity also carries secrets (the
 * encrypted DEK, the API key relation) that must never leave the server.
 */
function toAdminWorkspaceDto(
  workspace: Workspace,
  counts: WorkspaceCounts,
): AdminWorkspaceDto {
  return {
    id: workspace.id,
    name: workspace.name,
    description: workspace.description ?? null,
    owner: toAdminWorkspaceUserDto(workspace.owner),
    isAssetsDiscovery: workspace.isAssetsDiscovery,
    isAutoEnableAssetAfterDiscovered:
      workspace.isAutoEnableAssetAfterDiscovered,
    targetCount: counts.targetCount,
    memberCount: counts.memberCount,
    archivedAt: workspace.archivedAt ?? null,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  };
}

@Injectable()
export class AdminWorkspacesService {
  constructor(
    @InjectRepository(Workspace)
    private readonly workspacesRepository: Repository<Workspace>,
  ) {}

  /** Lists every workspace on the platform, regardless of membership. */
  public async getWorkspaces(query: GetManyAdminWorkspacesDto) {
    const { page, limit, sortOrder, search, isArchived } = query;
    const sortBy = SORT_COLUMNS[query.sortBy] ?? 'createdAt';

    const queryBuilder = this.workspacesRepository
      .createQueryBuilder('workspace')
      .leftJoinAndSelect('workspace.owner', 'owner')
      .orderBy(
        `workspace.${sortBy}`,
        sortOrder === SortOrder.DESC ? 'DESC' : 'ASC',
      )
      .skip((page - 1) * limit)
      .take(limit);

    if (search?.trim()) {
      queryBuilder.andWhere(
        '(workspace.name ILIKE :search OR owner.name ILIKE :search OR owner.email ILIKE :search)',
        { search: `%${search.trim()}%` },
      );
    }

    if (isArchived === true) {
      queryBuilder.andWhere('workspace.archivedAt IS NOT NULL');
    } else if (isArchived === false) {
      queryBuilder.andWhere('workspace.archivedAt IS NULL');
    }

    const [workspaces, total] = await queryBuilder.getManyAndCount();
    const counts = await this.getCounts(workspaces.map((w) => w.id));

    return getManyResponse({
      query,
      data: workspaces.map((workspace) =>
        toAdminWorkspaceDto(workspace, counts.get(workspace.id) ?? NO_COUNTS),
      ),
      total,
    });
  }

  /**
   * Returns one workspace with its owner and counts. Members are paginated
   * separately through GET /admin/users?workspaceId=.
   */
  public async getWorkspace(id: string): Promise<AdminWorkspaceDto> {
    const workspace = await this.workspacesRepository.findOne({
      where: { id },
      relations: { owner: true },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const counts = await this.getCounts([workspace.id]);
    return toAdminWorkspaceDto(
      workspace,
      counts.get(workspace.id) ?? NO_COUNTS,
    );
  }

  /** Applies the admin's changes and returns the updated workspace. */
  public async updateWorkspace(
    id: string,
    dto: UpdateAdminWorkspaceDto,
  ): Promise<AdminWorkspaceDto> {
    await this.findWorkspaceOrFail(id);

    // Only fields the admin actually sent; an empty update is a no-op.
    const changes = Object.fromEntries(
      Object.entries({
        name: dto.name,
        description: dto.description,
        isAssetsDiscovery: dto.isAssetsDiscovery,
        isAutoEnableAssetAfterDiscovered: dto.isAutoEnableAssetAfterDiscovered,
      }).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(changes).length > 0) {
      await this.workspacesRepository.update({ id }, changes);
    }

    return this.getWorkspace(id);
  }

  /**
   * Archives (deactivates) or restores a workspace. Re-archiving keeps the
   * original archivedAt instead of moving it forward.
   */
  public async setArchived(
    id: string,
    isArchived: boolean,
  ): Promise<AdminWorkspaceDto> {
    const workspace = await this.findWorkspaceOrFail(id);

    if (isArchived !== !!workspace.archivedAt) {
      await this.workspacesRepository.update(
        { id },
        { archivedAt: isArchived ? new Date() : null },
      );
    }

    return this.getWorkspace(id);
  }

  /** Soft-deleted workspaces are excluded, so they read as not found. */
  private async findWorkspaceOrFail(id: string): Promise<Workspace> {
    const workspace = await this.workspacesRepository.findOneBy({ id });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }
    return workspace;
  }

  /** Target and member counts for a page of workspaces, in one round-trip. */
  private async getCounts(
    workspaceIds: string[],
  ): Promise<Map<string, WorkspaceCounts>> {
    if (workspaceIds.length === 0) return new Map();

    const rows: Array<{ id: string } & WorkspaceCounts> =
      await this.workspacesRepository.query(
        `
        SELECT
          w.id,
          (SELECT COUNT(*) FROM targets t WHERE t."workspaceId" = w.id)::integer AS "targetCount",
          (SELECT COUNT(*) FROM workspace_members wm WHERE wm."workspaceId" = w.id)::integer AS "memberCount"
        FROM workspaces w
        WHERE w.id = ANY($1::uuid[])
        `,
        [workspaceIds],
      );

    return new Map(
      rows.map(({ id, targetCount, memberCount }) => [
        id,
        { targetCount, memberCount },
      ]),
    );
  }
}
