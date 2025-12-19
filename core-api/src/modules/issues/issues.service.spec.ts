import { SortOrder } from '@/common/dtos/get-many-base.dto';
import { IssueSourceType, IssueStatus } from '@/common/enums/enum';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IssueComment } from './entities/issue-comment.entity';
import { Issue } from './entities/issue.entity';
import { VulnerabilitySourceHandler } from './handlers/vulnerability-source.handler';
import { IssuesService } from './issues.service';

describe('IssuesService', () => {
  let service: IssuesService;
  let repository: Repository<Issue>;
  let commentRepository: Repository<IssueComment>;
  // let vulnerabilityHandler: VulnerabilitySourceHandler;

  const mockIssue = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    title: 'Test Issue',
    status: IssueStatus.OPEN,
    workspaceId: '123e4567-e89b-12d3-a456-426614174001',
    createdBy: { id: '123e4567-e89b-12d3-a456-426614174002' },
    createdAt: new Date(),
    updatedAt: new Date(),
    no: 1,
  };

  const mockIssueComment = {
    id: '123e4567-e89b-12d3-a456-426614174003',
    content: 'Test Comment',
    issue: { id: '123e4567-e89b-12d3-a456-426614174000' },
    createdBy: { id: '123e4567-e89b-12d3-a456-426614174002' },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IssuesService,
        {
          provide: getRepositoryToken(Issue),
          useClass: Repository,
        },
        {
          provide: getRepositoryToken(IssueComment),
          useClass: Repository,
        },
        {
          provide: VulnerabilitySourceHandler,
          useValue: {
            onStatusChange: jest.fn(),
          },
        },
      ],
    })
      .overrideProvider(getRepositoryToken(Issue))
      .useValue({
        findOne: jest.fn(),
        find: jest.fn(),
        save: jest.fn(),
        remove: jest.fn(),
        create: jest.fn(),
        manager: {
          transaction: jest.fn(),
        },
      })
      .overrideProvider(getRepositoryToken(IssueComment))
      .useValue({
        findOne: jest.fn(),
        find: jest.fn(),
        save: jest.fn(),
        remove: jest.fn(),
        create: jest.fn(),
        getManyAndCount: jest.fn(),
        createQueryBuilder: jest.fn(() => ({
          leftJoinAndSelect: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          skip: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          getManyAndCount: jest.fn(),
        })),
      })
      .overrideProvider(VulnerabilitySourceHandler)
      .useValue({
        onStatusChange: jest.fn(),
      })
      .compile();

    service = module.get<IssuesService>(IssuesService);
    repository = module.get<Repository<Issue>>(getRepositoryToken(Issue));
    commentRepository = module.get<Repository<IssueComment>>(
      getRepositoryToken(IssueComment),
    );
    // vulnerabilityHandler = module.get<VulnerabilitySourceHandler>(
    //   VulnerabilitySourceHandler,
    // );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createIssue', () => {
    it('should create a new issue', async () => {
      const createIssueDto = {
        title: 'Test Issue',
        description: 'Test Description',
      };
      const userId = '123e4567-e89b-12d3-a456-426614174002';
      const workspaceId = '123e4567-e89b-12d3-a456-426614174001';

      jest.spyOn(repository, 'findOne').mockResolvedValue(null);
      jest.spyOn(repository, 'create').mockReturnValue(mockIssue as Issue);

      const mockTransactionalEntityManager = {
        save: jest.fn().mockResolvedValue(mockIssue as Issue),
      };

      const mockTransaction = jest
        .fn()
        .mockImplementation((callback: (entityManager: any) => any) => {
          return callback(mockTransactionalEntityManager) as Promise<Issue>;
        });
      repository.manager.transaction = mockTransaction;

      const result = await service.createIssue(
        createIssueDto,
        workspaceId,
        userId,
      );
      expect(result).toEqual(mockIssue);
    });

    it('should create a new issue with tags', async () => {
      const createIssueDto = {
        title: 'Test Issue',
        description: 'Test Description',
        tags: ['tag1', 'tag2', 'tag3'],
      };
      const userId = '123e4567-e89b-12d3-a456-426614174002';
      const workspaceId = '123e4567-e89b-12d3-a456-426614174001';

      const mockIssueWithTags = {
        ...mockIssue,
        tags: ['tag1', 'tag2', 'tag3'],
      };

      jest.spyOn(repository, 'findOne').mockResolvedValue(null);
      jest
        .spyOn(repository, 'create')
        .mockReturnValue(mockIssueWithTags as Issue);

      const mockTransactionalEntityManager = {
        save: jest.fn().mockResolvedValue(mockIssueWithTags as Issue),
      };

      const mockTransaction = jest
        .fn()
        .mockImplementation((callback: (entityManager: any) => any) => {
          return callback(mockTransactionalEntityManager) as Promise<Issue>;
        });
      repository.manager.transaction = mockTransaction;

      const result = await service.createIssue(
        createIssueDto,
        workspaceId,
        userId,
      );
      expect(result).toEqual(mockIssueWithTags);
      expect(result.tags).toEqual(['tag1', 'tag2', 'tag3']);
    });
  });

  describe('getMany', () => {
    it('should return paginated issues', async () => {
      const query = {
        limit: 10,
        page: 1,
        sortOrder: SortOrder.ASC,
        sortBy: 'createdAt',
      };
      const workspaceId = '123e4567-e89b-12d3-a456-426614174001';
      const mockIssues = [mockIssue];

      const queryBuilder: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([mockIssues, 1]),
      };

      repository.createQueryBuilder = jest.fn().mockReturnValue(queryBuilder);

      const result = await service.getMany(query, workspaceId);
      expect(result.data).toEqual(mockIssues);
      expect(result.total).toBe(1);
    });

    it('should filter issues by status', async () => {
      const query = {
        limit: 10,
        page: 1,
        sortOrder: SortOrder.ASC,
        sortBy: 'createdAt',
        status: [IssueStatus.OPEN],
      };
      const workspaceId = '123e4567-e89b-12d3-a456-426614174001';
      const mockIssues = [mockIssue];

      const queryBuilder: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([mockIssues, 1]),
      };

      repository.createQueryBuilder = jest.fn().mockReturnValue(queryBuilder);

      const result = await service.getMany(query, workspaceId);
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'issues.status IN (:...status)',
        { status: [IssueStatus.OPEN] },
      );
      expect(result.data).toEqual(mockIssues);
    });

    it('should filter issues by search term', async () => {
      const query = {
        limit: 10,
        page: 1,
        sortOrder: SortOrder.ASC,
        sortBy: 'createdAt',
        search: 'test search',
      };
      const workspaceId = '123e4567-e89b-12d3-a456-426614174001';
      const mockIssues = [mockIssue];

      const queryBuilder: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([mockIssues, 1]),
      };

      repository.createQueryBuilder = jest.fn().mockReturnValue(queryBuilder);

      const result = await service.getMany(query, workspaceId);
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        '(issues.title ILIKE :search OR issues.description ILIKE :search)',
        { search: '%test search%' },
      );
      expect(result.data).toEqual(mockIssues);
    });

    it('should filter issues by both status and search term', async () => {
      const query = {
        limit: 10,
        page: 1,
        sortOrder: SortOrder.ASC,
        sortBy: 'createdAt',
        status: [IssueStatus.OPEN, IssueStatus.CLOSED],
        search: 'test search',
      };
      const workspaceId = '123e4567-e89b-12d3-a456-426614174001';
      const mockIssues = [mockIssue];

      const queryBuilder: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([mockIssues, 1]),
      };

      repository.createQueryBuilder = jest.fn().mockReturnValue(queryBuilder);

      const result = await service.getMany(query, workspaceId);
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'issues.status IN (:...status)',
        { status: [IssueStatus.OPEN, IssueStatus.CLOSED] },
      );
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        '(issues.title ILIKE :search OR issues.description ILIKE :search)',
        { search: '%test search%' },
      );
      expect(result.data).toEqual(mockIssues);
    });
  });

  describe('getById', () => {
    it('should return an issue by id', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValue(mockIssue as Issue);

      const result = await service.getById('1');
      expect(result).toEqual(mockIssue);
    });

    it('should throw NotFoundException if issue not found', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValue(null);

      await expect(service.getById('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update issue title when user is the creator', async () => {
      const updateIssueDto = { title: 'Updated Title' };
      const userId = '123e4567-e89b-12d3-a456-426614174002';

      jest.spyOn(repository, 'findOne').mockResolvedValue(mockIssue as Issue);
      jest.spyOn(repository, 'save').mockResolvedValue({
        ...mockIssue,
        title: 'Updated Title',
      } as Issue);

      const result = await service.update(
        '123e4567-e89b-12d3-a456-426614174000',
        updateIssueDto,
        userId,
      );
      expect(result.title).toBe('Updated Title');
    });

    it('should update issue tags when user is the creator', async () => {
      const updateIssueDto = { tags: ['new-tag1', 'new-tag2'] };
      const userId = '123e4567-e89b-12d3-a456-426614174002';

      const issueWithTags = {
        ...mockIssue,
        tags: ['existing-tag'],
      };

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValue(issueWithTags as Issue);
      jest.spyOn(repository, 'save').mockResolvedValue({
        ...issueWithTags,
        tags: ['new-tag1', 'new-tag2'],
      } as Issue);

      const result = await service.update(
        '123e4567-e89b-12d3-a456-426614174000',
        updateIssueDto,
        userId,
      );
      expect(result.tags).toEqual(['new-tag1', 'new-tag2']);
    });

    it('should update both title and tags when user is the creator', async () => {
      const updateIssueDto = {
        title: 'Updated Title',
        tags: ['updated-tag1', 'updated-tag2'],
      };
      const userId = '123e4567-e89b-12d3-a456-426614174002';

      const issueWithTags = {
        ...mockIssue,
        tags: ['existing-tag'],
      };

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValue(issueWithTags as Issue);
      jest.spyOn(repository, 'save').mockResolvedValue({
        ...issueWithTags,
        title: 'Updated Title',
        tags: ['updated-tag1', 'updated-tag2'],
      } as Issue);

      const result = await service.update(
        '123e4567-e89b-12d3-a456-426614174000',
        updateIssueDto,
        userId,
      );
      expect(result.title).toBe('Updated Title');
      expect(result.tags).toEqual(['updated-tag1', 'updated-tag2']);
    });

    it('should throw ForbiddenException when user is not the creator', async () => {
      const updateIssueDto = { title: 'Updated Title' };
      const userId = 'different-user';

      jest.spyOn(repository, 'findOne').mockResolvedValue(mockIssue as Issue);

      await expect(
        service.update(
          '123e4567-e89b-12d3-a456-426614174000',
          updateIssueDto,
          userId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('changeStatus', () => {
    it('should change issue status when user is the creator', async () => {
      const changeIssueStatusDto = { status: IssueStatus.CLOSED };
      const userId = '123e4567-e89b-12d3-a456-426614174002';

      jest.spyOn(repository, 'findOne').mockResolvedValue(mockIssue as Issue);
      jest.spyOn(repository, 'save').mockResolvedValue({
        ...mockIssue,
        status: IssueStatus.CLOSED,
      } as Issue);

      const result = await service.changeStatus(
        '123e4567-e89b-12d3-a456-426614174000',
        changeIssueStatusDto,
        userId,
      );
      expect(result.status).toBe(IssueStatus.CLOSED);
    });

    it('should throw ForbiddenException when user is not the creator', async () => {
      const changeIssueStatusDto = { status: IssueStatus.CLOSED };
      const userId = 'different-user';

      jest.spyOn(repository, 'findOne').mockResolvedValue(mockIssue as Issue);

      await expect(
        service.changeStatus(
          '123e4567-e89b-12d3-a456-426614174000',
          changeIssueStatusDto,
          userId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should trigger handler when status changes and source exists', async () => {
      const changeIssueStatusDto = { status: IssueStatus.CLOSED };
      const userId = '123e4567-e89b-12d3-a456-426614174002';
      const issueWithSource = {
        ...mockIssue,
        sourceType: IssueSourceType.VULNERABILITY,
        sourceId: '123e4567-e89b-12d3-a456-426614174004',
        status: IssueStatus.OPEN,
      };

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValue(issueWithSource as Issue);
      jest.spyOn(repository, 'save').mockResolvedValue({
        ...issueWithSource,
        status: IssueStatus.CLOSED,
      } as Issue);

      await service.changeStatus(
        '123e4567-e89b-12d3-a456-426614174000',
        changeIssueStatusDto,
        userId,
      );

      // expect(vulnerabilityHandler.onStatusChange).toHaveBeenCalledWith(
      //   '123e4567-e89b-12d3-a456-426614174004',
      //   IssueStatus.CLOSED,
      // );
    });
  });

  describe('delete', () => {
    it('should delete an issue', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValue(mockIssue as Issue);
      jest.spyOn(repository, 'remove').mockResolvedValue(mockIssue as Issue);

      const result = await service.delete('1');
      expect(result.message).toBe('Issue deleted successfully');
    });
  });

  describe('createComment', () => {
    it('should create a comment for an issue', async () => {
      const createCommentDto = { content: 'Test Comment' };
      const issueId = '1';
      const userId = 'user-1';

      jest
        .spyOn(commentRepository, 'create')
        .mockReturnValue(mockIssueComment as IssueComment);
      jest
        .spyOn(commentRepository, 'save')
        .mockResolvedValue(mockIssueComment as IssueComment);

      const result = await service.createComment(
        createCommentDto,
        issueId,
        userId,
      );
      expect(result).toEqual(mockIssueComment);
    });
  });

  describe('getCommentsByIssueId', () => {
    it('should return paginated comments for an issue', async () => {
      const issueId = '1';
      const query = {
        limit: 10,
        page: 1,
        sortBy: 'createdAt',
        sortOrder: SortOrder.ASC,
      };

      jest.spyOn(commentRepository, 'createQueryBuilder').mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockIssueComment], 1]),
      } as any);

      const result = await service.getCommentsByIssueId(issueId, query);
      expect(result.data.length).toBe(1);
    });
  });

  describe('updateCommentById', () => {
    it('should update a comment when user is the creator', async () => {
      const updateCommentDto = { content: 'Updated Comment' };
      const userId = 'user-1';

      jest.spyOn(commentRepository, 'findOne').mockResolvedValue({
        ...mockIssueComment,
        createdBy: { id: userId },
      } as IssueComment);
      jest.spyOn(commentRepository, 'save').mockResolvedValue({
        ...mockIssueComment,
        content: 'Updated Comment',
      } as IssueComment);

      const result = await service.updateCommentById(
        '1',
        updateCommentDto,
        userId,
      );
      expect(result.content).toBe('Updated Comment');
    });

    it('should throw error when user is not the creator of the comment', async () => {
      const updateCommentDto = { content: 'Updated Comment' };
      const userId = 'different-user';

      jest.spyOn(commentRepository, 'findOne').mockResolvedValue({
        ...mockIssueComment,
        createdBy: { id: 'another-user' },
      } as IssueComment);

      await expect(
        service.updateCommentById('1', updateCommentDto, userId),
      ).rejects.toThrow(Error);
    });
  });

  describe('deleteCommentById', () => {
    it('should delete a comment when user is the creator', async () => {
      const userId = 'user-1';

      jest.spyOn(commentRepository, 'findOne').mockResolvedValue({
        ...mockIssueComment,
        createdBy: { id: userId },
      } as IssueComment);
      jest
        .spyOn(commentRepository, 'remove')
        .mockResolvedValue(mockIssueComment as IssueComment);

      const result = await service.deleteCommentById('1', userId);
      expect(result.message).toBe('Comment deleted successfully');
    });

    it('should throw error when user is not the creator of the comment', async () => {
      const userId = 'different-user';

      jest.spyOn(commentRepository, 'findOne').mockResolvedValue({
        ...mockIssueComment,
        createdBy: { id: 'another-user' },
      } as IssueComment);

      await expect(service.deleteCommentById('1', userId)).rejects.toThrow(
        Error,
      );
    });
  });
});
