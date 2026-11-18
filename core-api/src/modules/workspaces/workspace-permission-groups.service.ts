import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { AuditOutcome } from '@/common/enums/enum';
import { ForbiddenError, InvalidInputError, NotFoundError } from '@/common/errors/domain.errors';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { AuditContext, AuditService } from '../audit/audit.service';
import {
  CreatePermissionGroupDto,
  PermissionCatalogResourceDto,
  UpdatePermissionGroupDto,
} from './dto/workspace-access.dto';
import { WorkspaceMemberPermission } from './entities/workspace-member-permission.entity';
import { WorkspaceMembers } from './entities/workspace-members.entity';
import { WorkspacePermission } from './entities/workspace-permission.entity';
import { WorkspaceMembershipService } from './workspace-membership.service';

// Retired with the move of templates onto artifacts; stripped so groups that still hold them stay editable.
const RETIRED_PERMISSION_KEYS = new Set(['template.read', 'template.write']);
/** Name of the system permission group granted to the workspace creator */
export const OWNER_PERMISSION_GROUP_NAME = 'Admin';
/** Wildcard permission key that grants every action */
export const WILDCARD_PERMISSION = '*';

/**
 * Permission groups of a workspace: the catalog of valid keys, group CRUD,
 * the system Admin group seeded at creation, and the no-escalation checks
 * (`assertCanGrantPermissionKeys`, `assertCanGrantGroups`) that members and
 * invitations share.
 */
@Injectable()
export class WorkspacePermissionGroupsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(WorkspacePermission)
    private readonly permissionRepository: Repository<WorkspacePermission>,
    @InjectRepository(WorkspaceMembers)
    private readonly workspaceMembersRepository: Repository<WorkspaceMembers>,
    @InjectRepository(WorkspaceMemberPermission)
    private readonly memberPermissionRepository: Repository<WorkspaceMemberPermission>,
    private readonly auditService: AuditService,
    private readonly membership: WorkspaceMembershipService,
  ) {}

  /**
   * Seeds the system Admin permission group for a newly created workspace and
   * assigns it to the creator. Idempotent: safe to re-run after a partial
   * failure (skips rows that already exist instead of throwing).
   * @param workspaceId - The ID of the workspace.
   * @param creatorId - The ID of the workspace creator (member row owner).
   * @param manager - Optional transactional manager to join the workspace
   *   creation transaction.
   */
  public async seedOwnerPermissionGroup(
    workspaceId: string,
    creatorId: string,
    manager?: EntityManager,
  ): Promise<WorkspacePermission> {
    const permissionRepo = manager
      ? manager.getRepository(WorkspacePermission)
      : this.permissionRepository;
    const memberRepo = manager
      ? manager.getRepository(WorkspaceMembers)
      : this.workspaceMembersRepository;
    const memberPermissionRepo = manager
      ? manager.getRepository(WorkspaceMemberPermission)
      : this.memberPermissionRepository;

    let ownerGroup = await permissionRepo.findOne({
      where: { workspace: { id: workspaceId }, name: OWNER_PERMISSION_GROUP_NAME },
    });
    if (!ownerGroup) {
      ownerGroup = await permissionRepo.save({
        workspace: { id: workspaceId },
        name: OWNER_PERMISSION_GROUP_NAME,
        permissions: [WILDCARD_PERMISSION],
        isSystem: true,
      });
    }

    let member = await memberRepo.findOne({
      where: { workspace: { id: workspaceId }, user: { id: creatorId } },
    });
    if (!member) {
      member = await memberRepo.save({
        workspace: { id: workspaceId },
        user: { id: creatorId },
      });
    }

    const existingAssignment = await memberPermissionRepo.findOne({
      where: { member: { id: member.id }, permission: { id: ownerGroup.id } },
    });
    if (!existingAssignment) {
      await memberPermissionRepo.save({
        member: { id: member.id },
        permission: { id: ownerGroup.id },
      });
    }

    return ownerGroup;
  }

  /**
   * Returns the permission catalog: every resource with its selectable
   * actions and human-readable labels. Drives the permission group editor.
   */
  public getPermissionCatalog(): PermissionCatalogResourceDto[] {
    // Loaded at call time so both ts-node (src/) and the compiled dist/ run.
    const catalogPath = resolve(__dirname, 'permission-catalog.json');
    const raw = readFileSync(catalogPath, 'utf8');
    return JSON.parse(raw) as PermissionCatalogResourceDto[];
  }

  public async getPermissionGroups(
    workspaceId: string,
  ): Promise<WorkspacePermission[]> {
    return this.permissionRepository.find({
      where: { workspace: { id: workspaceId } },
      order: { createdAt: 'ASC' },
    });
  }

  public async createPermissionGroup(
    workspaceId: string,
    dto: CreatePermissionGroupDto,
    creatorId: string,
    auditContext?: AuditContext,
  ): Promise<WorkspacePermission> {
    if (dto.permissions.includes(WILDCARD_PERMISSION)) {
      throw new InvalidInputError(
        'Wildcard "*" is reserved for the system Admin group',
      );
    }

    dto.permissions = dto.permissions.filter(
      (key) => !RETIRED_PERMISSION_KEYS.has(key),
    );
    this.assertPermissionKeysValid(dto.permissions);
    await this.assertCanGrantPermissionKeys(workspaceId, creatorId, dto.permissions);

    const existing = await this.findPermissionGroupByNameCI(workspaceId, dto.name);
    if (existing) {
      throw new InvalidInputError(
        'A permission group with this name already exists',
      );
    }

    try {
      // Group insert + audit row (event 10, explicit) commit atomically.
      return await this.dataSource.transaction(async (manager) => {
        const group = await manager.save(WorkspacePermission, {
          workspace: { id: workspaceId },
          name: dto.name,
          permissions: dto.permissions,
          isSystem: false,
        });
        if (auditContext) {
          await this.auditService.recordInTx(manager, {
            workspaceId,
            ...auditContext,
            action: 'permission_group.created',
            resourceType: 'permission_group',
            resourceId: group.id,
            changes: {
              name: { after: group.name },
              permissions: { after: group.permissions },
            },
            outcome: AuditOutcome.Success,
          });
        }
        return group;
      });
    } catch (error) {
      // Concurrent insert raced the unique (workspace, name) constraint.
      if ((error as { code?: string })?.code === '23505') {
        throw new InvalidInputError(
          'A permission group with this name already exists',
        );
      }
      throw error;
    }
  }

  public async updatePermissionGroup(
    workspaceId: string,
    permissionId: string,
    dto: UpdatePermissionGroupDto,
    updaterId: string,
    auditContext?: AuditContext,
  ): Promise<WorkspacePermission> {
    const group = await this.getPermissionGroupInWorkspace(
      workspaceId,
      permissionId,
    );

    if (group.isSystem) {
      throw new ForbiddenError('System permission groups cannot be modified');
    }
    if (dto.permissions?.includes(WILDCARD_PERMISSION)) {
      throw new InvalidInputError(
        'Wildcard "*" is reserved for the system Admin group',
      );
    }

    // Reject an empty PATCH body instead of silently succeeding.
    if (dto.name === undefined && dto.permissions === undefined) {
      throw new InvalidInputError('Nothing to update');
    }

    if (dto.permissions !== undefined) {
      dto.permissions = dto.permissions.filter(
        (key) => !RETIRED_PERMISSION_KEYS.has(key),
      );
      this.assertPermissionKeysValid(dto.permissions);
      await this.assertCanGrantPermissionKeys(workspaceId, updaterId, dto.permissions);
    }

    // Diff source for the audit row (event 11, explicit): permissions BEFORE
    // this change, captured before the group object is mutated.
    const beforePermissions = [...group.permissions];

    if (dto.name !== undefined && dto.name !== group.name) {
      const duplicate = await this.findPermissionGroupByNameCI(workspaceId, dto.name);
      if (duplicate && duplicate.id !== permissionId) {
        throw new InvalidInputError(
          'A permission group with this name already exists',
        );
      }
      group.name = dto.name;
    }
    if (dto.permissions !== undefined) {
      group.permissions = dto.permissions;
    }

    try {
      // Save + audit row commit atomically.
      return await this.dataSource.transaction(async (manager) => {
        const saved = await manager.save(WorkspacePermission, group);
        if (auditContext) {
          await this.auditService.recordInTx(manager, {
            workspaceId,
            ...auditContext,
            action: 'permission_group.updated',
            resourceType: 'permission_group',
            resourceId: permissionId,
            changes: {
              permissions: { before: beforePermissions, after: group.permissions },
            },
            outcome: AuditOutcome.Success,
          });
        }
        return saved;
      });
    } catch (error) {
      if ((error as { code?: string })?.code === '23505') {
        throw new InvalidInputError(
          'A permission group with this name already exists',
        );
      }
      throw error;
    }
  }

  public async deletePermissionGroup(
    workspaceId: string,
    permissionId: string,
    auditContext?: AuditContext,
  ): Promise<DefaultMessageResponseDto> {
    const group = await this.getPermissionGroupInWorkspace(
      workspaceId,
      permissionId,
    );

    if (group.isSystem) {
      throw new ForbiddenError('System permission groups cannot be deleted');
    }

    // Delete + audit row (event 12, explicit) commit atomically.
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(WorkspacePermission, {
        id: permissionId,
        workspace: { id: workspaceId },
      });
      if (auditContext) {
        await this.auditService.recordInTx(manager, {
          workspaceId,
          ...auditContext,
          action: 'permission_group.deleted',
          resourceType: 'permission_group',
          resourceId: permissionId,
          // `group.name` is the state BEFORE the delete — label it `before`.
          changes: { name: { before: group.name } },
          outcome: AuditOutcome.Success,
        });
      }
    });

    return { message: 'Permission group deleted successfully' };
  }

  private async getPermissionGroupInWorkspace(
    workspaceId: string,
    permissionId: string,
  ): Promise<WorkspacePermission> {
    const group = await this.permissionRepository.findOne({
      where: { id: permissionId, workspace: { id: workspaceId } },
    });
    if (!group) {
      throw new NotFoundError('Permission group not found');
    }
    return group;
  }

  /**
   * Case-insensitive group name lookup so "Viewer" and "viewer" collide.
   */
  private async findPermissionGroupByNameCI(
    workspaceId: string,
    name: string,
  ): Promise<WorkspacePermission | null> {
    const groups = await this.permissionRepository.find({
      where: { workspace: { id: workspaceId } },
    });
    const normalized = name.toLowerCase();
    return groups.find((group) => group.name.toLowerCase() === normalized) ?? null;
  }

  /**
   * Flattens permission-catalog.json into the set of valid `domain.action`
   * keys. Anything not in the catalog is rejected on group create/update.
   */
  private getAllPermissionKeys(): Set<string> {
    const catalog = this.getPermissionCatalog();
    const keys = new Set<string>();
    for (const resource of catalog) {
      for (const action of resource.actions) {
        keys.add(`${resource.resource}.${action.action}`);
      }
    }
    return keys;
  }

  private assertPermissionKeysValid(keys: string[]): void {
    const valid = this.getAllPermissionKeys();
    const unknown = [...new Set(keys)].filter((key) => !valid.has(key));
    if (unknown.length > 0) {
      throw new InvalidInputError(
        `Unknown permission key(s): ${unknown.join(', ')}`,
      );
    }
  }

  /**
   * Privilege-escalation guard: a user may only create/update groups whose
   * permission keys they already hold. A holder of the "*" wildcard can grant
   * anything.
   */
  private async assertCanGrantPermissionKeys(
    workspaceId: string,
    userId: string,
    keys: string[],
  ): Promise<void> {
    if (keys.length === 0) {
      return;
    }
    const { permissionKeys } = await this.membership.getMembershipWithPermissions(
      workspaceId,
      userId,
    );
    if (permissionKeys.includes(WILDCARD_PERMISSION)) {
      return;
    }
    const holderKeys = new Set(permissionKeys);
    const missing = [...new Set(keys)].filter((key) => !holderKeys.has(key));
    if (missing.length > 0) {
      throw new InvalidInputError(
        `You can only grant permission keys you already hold. Missing: ${missing.join(', ')}`,
      );
    }
  }

  /**
   * Group-level variant used when assigning whole permission groups to
   * members/invitees: every key of every assigned group must be held.
   */
  assertCanGrantGroups(
    holderKeys: string[],
    groups: WorkspacePermission[],
  ): void {
    if (holderKeys.includes(WILDCARD_PERMISSION)) {
      return;
    }
    const holderKeySet = new Set(holderKeys);
    const offending = groups.filter((group) =>
      (group.permissions ?? []).some(
        (key) => !RETIRED_PERMISSION_KEYS.has(key) && !holderKeySet.has(key),
      ),
    );
    if (offending.length > 0) {
      throw new InvalidInputError(
        `You can only grant permission groups whose keys you hold. Offending group(s): ${offending.map((group) => group.name).join(', ')}`,
      );
    }
  }

  /**
   * Returns the non-system permission groups matching the given ids.
   * System groups (Admin) are never assignable through invitation flows.
   */
  async findValidPermissionGroups(
    workspaceId: string,
    permissionIds: string[],
  ): Promise<WorkspacePermission[]> {
    if (permissionIds.length === 0) {
      return [];
    }
    return this.permissionRepository.find({
      where: {
        id: In(permissionIds),
        workspace: { id: workspaceId },
        isSystem: false,
      },
    });
  }
}
