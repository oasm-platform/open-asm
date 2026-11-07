import {
  IssueLinkResourceType,
  IssueRuleGroupBy,
  IssueType,
  Severity,
} from '@/common/enums/enum';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type {
  CreateIssueRuleDto,
  IssueRuleDto,
  UpdateIssueRuleDto,
} from '../dto/issue-rule.dto';
import { IssueRule } from '../entities/issue-rule.entity';
import { assertWorkspaceMember } from '../issue-activity';
import { IssueLinksService } from '../issue-links.service';

/** The rule `POST /issues/rules/defaults` installs. */
export const DEFAULT_ISSUE_RULE = {
  name: 'Critical & High',
  event: 'vulnerability.detected',
  conditions: { minSeverity: Severity.HIGH },
  issueType: IssueType.VULNERABILITY_REMEDIATION,
  groupBy: IssueRuleGroupBy.VULNERABILITY_NAME,
  priority: null,
} as const;

/** CRUD of a workspace's issue rules. */
@Injectable()
export class IssueRulesService {
  constructor(
    @InjectRepository(IssueRule)
    private readonly rulesRepository: Repository<IssueRule>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly links: IssueLinksService,
  ) {}

  async list(workspaceId: string): Promise<IssueRuleDto[]> {
    const rules = await this.rulesRepository.find({
      where: { workspaceId },
      order: { createdAt: 'ASC' },
    });
    return rules.map(toDto);
  }

  async create(
    dto: CreateIssueRuleDto,
    workspaceId: string,
    userId: string,
  ): Promise<IssueRuleDto> {
    await this.validate(dto, workspaceId);
    const rule = await this.rulesRepository.save(
      this.rulesRepository.create({
        workspaceId,
        name: dto.name,
        enabled: dto.enabled ?? true,
        event: dto.event,
        conditions: dto.conditions ?? {},
        issueType: dto.issueType,
        groupBy: dto.groupBy ?? IssueRuleGroupBy.VULNERABILITY_NAME,
        priority: dto.priority ?? null,
        defaultAssigneeId: dto.defaultAssigneeId ?? null,
        createdById: userId,
      }),
    );
    return toDto(rule);
  }

  async update(
    id: string,
    dto: UpdateIssueRuleDto,
    workspaceId: string,
  ): Promise<IssueRuleDto> {
    const rule = await this.find(id, workspaceId);
    await this.validate(dto, workspaceId);
    if (dto.name !== undefined) rule.name = dto.name;
    if (dto.enabled !== undefined) rule.enabled = dto.enabled;
    if (dto.event !== undefined) rule.event = dto.event;
    if (dto.conditions !== undefined) rule.conditions = dto.conditions ?? {};
    if (dto.issueType !== undefined) rule.issueType = dto.issueType;
    if (dto.groupBy !== undefined) rule.groupBy = dto.groupBy;
    if (dto.priority !== undefined) rule.priority = dto.priority;
    if (dto.defaultAssigneeId !== undefined) {
      rule.defaultAssigneeId = dto.defaultAssigneeId;
    }
    return toDto(await this.rulesRepository.save(rule));
  }

  async delete(id: string, workspaceId: string): Promise<{ message: string }> {
    const rule = await this.find(id, workspaceId);
    await this.rulesRepository.delete({ id: rule.id });
    return { message: 'Issue rule deleted successfully' };
  }

  /**
   * Installs the default rule unless the workspace already has one by that
   * name. Serialised per workspace, so two clicks create one rule.
   */
  async createDefaults(
    workspaceId: string,
    userId: string,
  ): Promise<IssueRuleDto[]> {
    await this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `issue-rules:defaults:${workspaceId}`,
      ]);
      const existing = await manager.findOne(IssueRule, {
        where: { workspaceId, name: DEFAULT_ISSUE_RULE.name },
      });
      if (existing) return;
      await manager.save(
        manager.create(IssueRule, {
          ...DEFAULT_ISSUE_RULE,
          conditions: { ...DEFAULT_ISSUE_RULE.conditions },
          workspaceId,
          enabled: true,
          defaultAssigneeId: null,
          createdById: userId,
        }),
      );
    });
    return this.list(workspaceId);
  }

  private async find(id: string, workspaceId: string): Promise<IssueRule> {
    const rule = await this.rulesRepository.findOne({
      where: { id, workspaceId },
    });
    if (!rule) throw new NotFoundException(`Issue rule with ID ${id} not found`);
    return rule;
  }

  /** The assignee is a member, and every target is in the workspace. */
  private async validate(
    dto: UpdateIssueRuleDto,
    workspaceId: string,
  ): Promise<void> {
    if (dto.defaultAssigneeId) {
      await assertWorkspaceMember(
        this.dataSource,
        workspaceId,
        dto.defaultAssigneeId,
      );
    }
    const targetIds = dto.conditions?.targetIds ?? [];
    if (targetIds.length > 0) {
      await this.links.assertInWorkspace(
        targetIds.map((resourceId) => ({
          resourceType: IssueLinkResourceType.TARGET,
          resourceId,
        })),
        workspaceId,
      );
    }
  }
}

function toDto(rule: IssueRule): IssueRuleDto {
  return {
    id: rule.id,
    name: rule.name,
    enabled: rule.enabled,
    event: rule.event,
    conditions: rule.conditions ?? {},
    issueType: rule.issueType,
    groupBy: rule.groupBy,
    priority: rule.priority ?? null,
    defaultAssigneeId: rule.defaultAssigneeId ?? null,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  };
}
