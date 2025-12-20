import {
  GetManyBaseQueryParams,
  GetManyBaseResponseDto,
} from '@/common/dtos/get-many-base.dto';
import {
  IssueCommentType,
  IssueSourceType,
  IssueStatus,
  Role,
} from '@/common/enums/enum';
import { BOT_ID } from '@/common/constants/app.constants';
import { getManyResponse } from '@/utils/getManyResponse';
import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
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
import { AiAssistantService } from '../ai-assistant/ai-assistant.service';

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
    private readonly aiAssistantService: AiAssistantService,
  ) {
    this.sourceHandlers = new Map([
      [IssueSourceType.VULNERABILITY, this.vulnerabilityHandler],
    ]);
  }

  async createComment(
    createCommentDto: CreateIssueCommentDto,
    issueId: string,
    userId: string,
    isCanDelete = true,
    isCanEdit = true,
  ): Promise<IssueComment> {
    const comment = this.issueCommentsRepository.create({
      content: createCommentDto.content,
      repCommentId: createCommentDto.repCommentId,
      issue: { id: issueId },
      createdBy: { id: userId },
      isCanDelete,
      isCanEdit,
    });

    const savedComment = await this.issueCommentsRepository.save(comment);

    // Check if comment contains "@cai" and call AI assistant if it does
    if (createCommentDto.content.toLowerCase().includes('@cai')) {
      // Call AI assistant asynchronously to avoid blocking the main process
      this.processCaiRequest(savedComment).catch((error) => {
        this.logger.error('Error processing Cai request:', error);
      });
    }

    return savedComment;
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
        'repComment.id',
        'repComment.content',
        'repCreatedBy.id',
        'repCreatedBy.name',
      ])
      .leftJoin('issueComments.repComment', 'repComment')
      .leftJoin('repComment.createdBy', 'repCreatedBy')
      .orderBy('issueComments.createdAt', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [comments, total] = await queryBuilder.getManyAndCount();

    // Transform to response DTO format
    const transformedComments = comments.map((comment) => ({
      ...comment,
      createdBy: {
        id: comment.createdBy.id,
        name: comment.createdBy.name,
        role: comment.createdBy.role,
      },
      repComment: comment.repComment
        ? {
            id: comment.repComment.id,
            content: comment.repComment.content,
            createdBy: {
              id: comment.repComment.createdBy.id,
              name: comment.repComment.createdBy.name,
            },
          }
        : null,
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
      relations: ['createdBy', 'issue'],
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

    const updatedComment = await this.issueCommentsRepository.save(comment);

    // Check if comment contains "@cai" and call AI assistant if it does
    if (updateCommentDto.content.toLowerCase().includes('@cai')) {
      // Call AI assistant asynchronously to avoid blocking the main process
      this.processCaiRequest(updatedComment).catch((error) => {
        this.logger.error('Error processing Cai request:', error);
      });
    }

    return updatedComment;
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

    // Extract description and tags to be handled separately
    const { description, tags, ...issueData } = createIssueDto;

    // Create issue without description and tags for comment
    const issue = this.issuesRepository.create({
      ...issueData,
      tags,
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
    const { limit, page, sortOrder, status, search } = query;
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
      ]);

    // Add status filter if provided
    if (status && status.length > 0) {
      queryBuilder.andWhere('issues.status IN (:...status)', { status });
    }

    // Add search filter if provided
    if (search) {
      queryBuilder.andWhere(
        '(issues.title ILIKE :search OR issues.description ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    queryBuilder
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

  async update(
    id: string,
    updateIssueDto: UpdateIssueDto,
    userId: string,
  ): Promise<Issue> {
    const issue = await this.getById(id);

    // Check if the user is the creator of the issue
    if (issue.createdBy.id !== userId) {
      throw new ForbiddenException(
        'Only the creator of the issue can update it',
      );
    }

    // Update title if provided
    if (updateIssueDto.title !== undefined) {
      issue.title = updateIssueDto.title;
    }

    // Update tags if provided
    if (updateIssueDto.tags !== undefined) {
      issue.tags = updateIssueDto.tags;
    }

    return await this.issuesRepository.save(issue);
  }

  async changeStatus(
    id: string,
    changeIssueStatusDto: ChangeIssueStatusDto,
    userId: string,
  ): Promise<Issue> {
    const issue = await this.getById(id);
    // Check if the user is the creator of the issue
    if (issue.createdBy.id !== userId) {
      throw new ForbiddenException(
        'Only the creator of the issue can change its status',
      );
    }

    const oldStatus = issue.status;

    issue.status = changeIssueStatusDto.status;

    const savedIssue = await this.issuesRepository.save(issue);

    // Trigger handler if status changed and source exists
    if (oldStatus !== savedIssue.status) {
      const comment = this.issueCommentsRepository.create({
        content: savedIssue.status,
        issue: { id: savedIssue.id } as Issue,
        createdBy: { id: userId },
        isCanDelete: false,
        isCanEdit: false,
        type:
          issue.status === IssueStatus.OPEN
            ? IssueCommentType.OPEN
            : (IssueCommentType.CLOSED as IssueCommentType),
      });

      await this.issueCommentsRepository.save(comment);

      // await this.handleStatusChange(
      //   savedIssue.sourceType,
      //   savedIssue.sourceId,
      //   savedIssue.status,
      // );
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

  /**
   * This method is called when a user includes @cai in their comment
   * It calls the AI assistant and saves the response as a comment from the bot
   */
  private async processCaiRequest(
    originalComment: IssueComment,
  ): Promise<void> {
    try {
      const { issueId, createdBy } = originalComment;
      const userId = createdBy.id;
      // Get the issue to provide context to the AI assistant
      const issue = await this.issuesRepository.findOne({
        where: { id: issueId },
        relations: ['createdBy'],
      });

      if (!issue) {
        this.logger.error(`Issue with ID ${issueId} not found`);
        return;
      }

      // Determine issue type based on source type
      // Default to 0 (General) as requested, to avoid forcing vulnerability prompts on general content
      const issueType = 0; // IssueType.ISSUE_TYPE_UNSPECIFIED

      // if (issue.sourceType === IssueSourceType.VULNERABILITY) {
      //   issueType = 2; // IssueType.ISSUE_TYPE_VULNERABILITY
      // }

      let commentsContext = '';

      // If this comment is a reply, ONLY use the context of the replied comment
      if (originalComment.repCommentId) {
        const repliedComment = await this.issueCommentsRepository.findOne({
          where: { id: originalComment.repCommentId },
          relations: ['createdBy'],
        });

        if (repliedComment) {
          commentsContext = `[${repliedComment.createdBy.name}]: ${repliedComment.content}`;
        }
      } else {
        // Fetch recent comments to provide conversation context
        const recentComments = await this.issueCommentsRepository.find({
          where: { issue: { id: issueId } },
          order: { createdAt: 'DESC' },
          take: 10,
          relations: ['createdBy'],
        });

        // Format comments for context (chronological order)
        commentsContext = recentComments
          .reverse()
          .map((c) => `[${c.createdBy.name}]: ${c.content}`)
          .join('\n');
      }

      // Prepare metadata with issue information
      const metadata = {
        issueId: issue.id,
        issueTitle: issue.title,
        issueDescription: issue.description,
        issueStatus: issue.status,
        issueSourceType: issue.sourceType,
        issueSourceId: issue.sourceId,
        workspaceId: issue.workspaceId,
        commentId: originalComment.id,
        commentContent: originalComment.content,
        userId: userId,
        issueCommentsHistory: commentsContext, // Add history here
      };

      // Call AI assistant to resolve the issue
      const response = await this.aiAssistantService.resolveIssue(
        originalComment.content,
        issueType,
        metadata,
        issue.workspaceId,
        userId,
      );

      // Create a new comment from the bot with the AI response
      const botComment = this.issueCommentsRepository.create({
        content: response.message,
        issue: { id: issueId },
        createdBy: {
          id: BOT_ID,
          name: 'Cai',
          email: 'bot@oasm.local',
          role: Role.BOT,
          emailVerified: true,
        },
        isCanDelete: false,
        isCanEdit: false,
        repCommentId: originalComment.id,
      });

      await this.issueCommentsRepository.save(botComment);
    } catch (error) {
      this.logger.error('Error in processCaiRequest:', error);
    }
  }
}
