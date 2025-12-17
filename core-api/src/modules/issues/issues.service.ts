import {
  GetManyBaseQueryParams,
  GetManyBaseResponseDto,
} from '@/common/dtos/get-many-base.dto';
import { IssueSourceType, IssueStatus } from '@/common/enums/enum';
import { getManyResponse } from '@/utils/getManyResponse';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateIssueCommentDto } from './dto/create-issue-comment.dto';
import { GetManyIssuesDto } from './dto/get-many-issues.dto';
import {
  ChangeIssueStatusDto,
  CreateIssueDto,
  UpdateIssueDto,
} from './dto/issue.dto';
import { UpdateIssueCommentDto } from './dto/update-issue-comment.dto';
import { IssueComment } from './entities/issue-comment.entity';
import { Issue } from './entities/issue.entity';
import { VulnerabilitySourceHandler } from './handlers/vulnerability-source.handler';
import { IssueSourceHandler } from './interfaces/source-handler.interface';

@Injectable()
export class IssuesService {
  private readonly logger = new Logger(IssuesService.name);
  private readonly sourceHandlers: Map<IssueSourceType, IssueSourceHandler>;

  constructor(
    @InjectRepository(Issue)
    private issuesRepository: Repository<Issue>,
    @InjectRepository(IssueComment)
    private issueCommentsRepository: Repository<IssueComment>,
    private readonly vulnerabilityHandler: VulnerabilitySourceHandler,
  ) {
    this.sourceHandlers = new Map([
      [IssueSourceType.VULNERABILITY, this.vulnerabilityHandler],
    ]);
  }

  async createComment(
    createCommentDto: CreateIssueCommentDto,
    issueId: string,
    userId: string,
  ): Promise<IssueComment> {
    const comment = this.issueCommentsRepository.create({
      content: createCommentDto.content,
      issue: { id: issueId },
      createdBy: { id: userId },
    });
    return await this.issueCommentsRepository.save(comment);
  }

  async getCommentsByIssueId(issueId: string, query: GetManyBaseQueryParams) {
    const { limit, page } = query;

    const queryBuilder = this.issueCommentsRepository
      .createQueryBuilder('issueComments')
      .leftJoinAndSelect('issueComments.createdBy', 'createdBy')
      .where('issueComments.issueId = :issueId', { issueId })
      .select([
        'issueComments',
        'createdBy.id',
        'createdBy.name',
        'createdBy.role',
      ])
      .orderBy('issueComments.createdAt', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [comments, total] = await queryBuilder.getManyAndCount();

    // Transform to response DTO format
    const transformedComments = comments.map((comment) => ({
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      isCanDelete: comment.isCanDelete,
      isCanEdit: comment.isCanEdit,
      createdBy: {
        id: comment.createdBy.id,
        name: comment.createdBy.name,
        role: comment.createdBy.role,
      },
    }));

    return getManyResponse({
      query,
      data: transformedComments,
      total,
    });
  }

  async updateCommentById(
    id: string,
    updateCommentDto: UpdateIssueCommentDto,
    userId: string,
  ): Promise<IssueComment> {
    const comment = await this.issueCommentsRepository.findOne({
      where: { id },
      relations: ['createdBy'],
    });

    if (!comment) {
      throw new NotFoundException(`Comment with ID ${id} not found`);
    }

    // Check if the user is the creator of the comment
    if (comment.createdBy.id !== userId) {
      throw new Error('Only the creator of the comment can update it');
    }

    // Update the comment content
    comment.content = updateCommentDto.content;
    comment.updatedAt = new Date();

    return await this.issueCommentsRepository.save(comment);
  }

  async deleteCommentById(
    id: string,
    userId: string,
  ): Promise<{ message: string }> {
    const comment = await this.issueCommentsRepository.findOne({
      where: { id },
      relations: ['createdBy'],
    });

    if (!comment) {
      throw new NotFoundException(`Comment with ID ${id} not found`);
    }

    // Check if the user is the creator of the comment
    if (comment.createdBy.id !== userId) {
      throw new Error('Only the creator of the comment can delete it');
    }

    await this.issueCommentsRepository.remove(comment);
    return { message: 'Comment deleted successfully' };
  }

  async createIssue(
    createIssueDto: CreateIssueDto,
    workspaceId: string,
    userId: string,
  ): Promise<Issue> {
    const lastIssue = await this.issuesRepository.findOne({
      where: { workspaceId },
      order: { no: 'DESC' },
    });
    const no = (lastIssue?.no || 0) + 1;

    // Extract description to be used as comment
    const { description, ...issueData } = createIssueDto;

    // Create issue without description
    const issue = this.issuesRepository.create({
      ...issueData,
      workspaceId,
      createdBy: { id: userId },
      no,
    });

    // Use transaction to ensure both issue and comment are created together
    return await this.issuesRepository.manager.transaction(
      async (transactionalEntityManager) => {
        // Save the issue first to get the issueId
        const savedIssue = await transactionalEntityManager.save(issue);

        // If description exists, create it as a comment
        if (description) {
          const comment = this.issueCommentsRepository.create({
            content: description,
            issue: { id: savedIssue.id },
            createdBy: { id: userId },
            isCanDelete: false,
            isCanEdit: true,
          });
          await transactionalEntityManager.save(comment);
        }

        return savedIssue;
      },
    );
  }

  async getMany(
    query: GetManyIssuesDto,
    workspaceId: string,
  ): Promise<GetManyBaseResponseDto<Issue>> {
    const { limit, page, sortOrder } = query;
    let { sortBy } = query;

    if (!sortBy) {
      sortBy = 'createdAt';
    }

    const queryBuilder = this.issuesRepository
      .createQueryBuilder('issues')
      .leftJoinAndSelect('issues.createdBy', 'createdBy')
      .where('issues.workspaceId = :workspaceId', { workspaceId })
      .select([
        'issues',
        'createdBy.id',
        'createdBy.name',
        'createdBy.email',
        'createdBy.image',
      ])
      .orderBy(`issues.${sortBy}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit);

    const [issues, total] = await queryBuilder.getManyAndCount();

    return getManyResponse({ query, data: issues, total });
  }

  async getById(id: string): Promise<Issue> {
    const issue = await this.issuesRepository.findOne({
      where: { id },
      relations: ['createdBy'],
    });
    if (!issue) {
      throw new NotFoundException(`Issue with ID ${id} not found`);
    }
    return issue;
  }

  async update(id: string, updateIssueDto: UpdateIssueDto): Promise<Issue> {
    const issue = await this.getById(id);
    Object.assign(issue, updateIssueDto);
    return await this.issuesRepository.save(issue);
  }

  async changeStatus(
    id: string,
    changeIssueStatusDto: ChangeIssueStatusDto,
  ): Promise<Issue> {
    const issue = await this.getById(id);
    const oldStatus = issue.status;

    issue.status = changeIssueStatusDto.status;
    const savedIssue = await this.issuesRepository.save(issue);

    // Trigger handler if status changed and source exists
    if (
      oldStatus !== savedIssue.status &&
      savedIssue.sourceType &&
      savedIssue.sourceId
    ) {
      await this.handleStatusChange(
        savedIssue.sourceType,
        savedIssue.sourceId,
        savedIssue.status,
      );
    }

    return savedIssue;
  }

  async delete(id: string): Promise<{ message: string }> {
    const issue = await this.getById(id);
    await this.issuesRepository.remove(issue);
    return { message: 'Issue deleted successfully' };
  }

  private async handleStatusChange(
    sourceType: IssueSourceType,
    sourceId: string,
    status: IssueStatus,
  ) {
    const handler = this.sourceHandlers.get(sourceType);
    if (handler) {
      await handler.onStatusChange(sourceId, status);
    } else {
      this.logger.warn(`No handler found for source type: ${sourceType}`);
    }
  }
}
