import { GetManyBaseResponseDto } from '@/common/dtos/get-many-base.dto';
import { IssueSourceType, IssueStatus } from '@/common/enums/enum';
import { getManyResponse } from '@/utils/getManyResponse';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GetManyIssuesDto } from './dto/get-many-issues.dto';
import { CreateIssueDto, UpdateIssueDto } from './dto/issue.dto';
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
        private readonly vulnerabilityHandler: VulnerabilitySourceHandler,
    ) {
        this.sourceHandlers = new Map([
            [IssueSourceType.VULNERABILITY, this.vulnerabilityHandler],
        ]);
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
        console.log(userId);
        const issue = this.issuesRepository.create({
            ...createIssueDto,
            workspaceId,
            createdBy: { id: userId },
            no,
        });
        return await this.issuesRepository.save(issue);
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
        const issue = await this.issuesRepository.findOne({ where: { id } });
        if (!issue) {
            throw new NotFoundException(`Issue with ID ${id} not found`);
        }
        return issue;
    }

    async update(id: string, updateIssueDto: UpdateIssueDto): Promise<Issue> {
        const issue = await this.getById(id);
        const oldStatus = issue.status;

        Object.assign(issue, updateIssueDto);

        const savedIssue = await this.issuesRepository.save(issue);

        // Trigger handler if status changed and source exists
        if (
            updateIssueDto.status &&
            oldStatus !== updateIssueDto.status &&
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
