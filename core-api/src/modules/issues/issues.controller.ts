import { UserContext } from '@/common/decorators/app.decorator';
import { WorkspaceId } from '@/common/decorators/workspace-id.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { UserContextPayload } from '@/common/interfaces/app.interface';
import { GetManyResponseDto } from '@/utils/getManyResponse';
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { GetManyIssuesDto } from './dto/get-many-issues.dto';
import { ChangeIssueStatusDto, CreateIssueDto, UpdateIssueDto } from './dto/issue.dto';
import { Issue } from './entities/issue.entity';
import { IssuesService } from './issues.service';

@ApiTags('issues')
@Controller('issues')
export class IssuesController {
    constructor(private readonly issuesService: IssuesService) { }

    @Doc({
        summary: 'Get all issues',
        description: 'Retrieve a list of all issues with pagination and filtering.',
        response: {
            serialization: GetManyResponseDto(Issue),
        },
    })
    @Get()
    getMany(
        @Query() query: GetManyIssuesDto,
        @WorkspaceId() workspaceId: string,
    ) {
        return this.issuesService.getMany(query, workspaceId);
    }

    @Doc({
        summary: 'Create issue',
        description: 'Create a new issue linked to a source (e.g. vulnerability).',
        response: {
            serialization: Issue,
        },
        request: {
            getWorkspaceId: true
        }
    })
    @Post()
    create(
        @Body() createIssueDto: CreateIssueDto,
        @WorkspaceId() workspaceId: string,
        @UserContext() user: UserContextPayload,
    ) {
        return this.issuesService.createIssue(createIssueDto, workspaceId, user.id);
    }

    @Doc({
        summary: 'Get issue by ID',
        description: 'Retrieve details of a specific issue.',
        response: {
            serialization: Issue,
        },
        request: {
            params: [
                {
                    name: 'id',
                    type: String,
                    description: 'Issue ID',
                },
            ],
        },
    })
    @Get(':id')
    getById(@Param('id') id: string) {
        return this.issuesService.getById(id);
    }

    @Doc({
        summary: 'Update issue',
        description: 'Update issue details (e.g. status).',
        response: {
            serialization: Issue,
        },
        request: {
            params: [
                {
                    name: 'id',
                    type: String,
                    description: 'Issue ID',
                },
            ],
        },
    })
    @Doc({
        summary: 'Update issue title',
        description: 'Update issue title only.',
        response: {
            serialization: Issue,
        },
        request: {
            params: [
                {
                    name: 'id',
                    type: String,
                    description: 'Issue ID',
                },
            ],
        },
    })
    @Patch(':id')
    update(@Param('id') id: string, @Body() updateIssueDto: UpdateIssueDto) {
        return this.issuesService.update(id, updateIssueDto);
    }

    @Doc({
        summary: 'Change issue status',
        description: 'Change the status of an issue.',
        response: {
            serialization: Issue,
        },
        request: {
            params: [
                {
                    name: 'id',
                    type: String,
                    description: 'Issue ID',
                },
            ],
        },
    })
    @Patch(':id/status')
    changeStatus(
        @Param('id') id: string,
        @Body() changeIssueStatusDto: ChangeIssueStatusDto,
    ) {
        return this.issuesService.changeStatus(id, changeIssueStatusDto);
    }
}
