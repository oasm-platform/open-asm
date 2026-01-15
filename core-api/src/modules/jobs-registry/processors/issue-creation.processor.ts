import { BullMQName, IssueStatus } from '@/common/enums/enum';
import { CreateIssueDto } from '@/modules/issues/dto/issue.dto';
import { IssueComment } from '@/modules/issues/entities/issue-comment.entity';
import { Issue } from '@/modules/issues/entities/issue.entity';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';

interface IssueCreationData {
  createIssueDto: CreateIssueDto;
  workspaceId: string;
  userId: string;
}

@Processor(BullMQName.ISSUE_CREATION, {
  concurrency: 1, // Process one job at a time to ensure sequential processing
})
export class IssueCreationProcessor extends WorkerHost {
  private readonly logger = new Logger(IssueCreationProcessor.name);

  constructor(
    @InjectRepository(Issue)
    private issuesRepository: Repository<Issue>,
    @InjectRepository(IssueComment)
    private issueCommentsRepository: Repository<IssueComment>,
  ) {
    super();
  }

  async process(job: Job<IssueCreationData>): Promise<Issue> {
    const { createIssueDto, workspaceId, userId } = job.data;

    try {
      // Find the last issue number for this workspace to maintain sequence
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
        status: IssueStatus.OPEN, // Default status
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
    } catch (error) {
      this.logger.error(
        `Error creating issue for workspace ${workspaceId}:`,
        error,
      );
      throw error;
    }
  }
}
