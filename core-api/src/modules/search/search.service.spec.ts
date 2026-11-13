import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AssetsService } from '../assets/assets.service';
import type { User } from '../auth/entities/user.entity';
import { TargetsService } from '../targets/targets.service';
import { Vulnerability } from '../vulnerabilities/entities/vulnerability.entity';
import type { SearchAssetsTargetsDto } from './dto/search.dto';
import { SearchHistory } from './entities/search-history.entity';
import { SearchService } from './search.service';

const user = { id: 'user-1' } as User;
const WS = 'ws-1';

const queryBuilder = () => {
  const qb = {
    leftJoin: jest.fn(),
    addSelect: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    take: jest.fn(),
    skip: jest.fn(),
    getMany: jest.fn().mockResolvedValue([]),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  };
  for (const key of Object.keys(qb) as (keyof typeof qb)[]) {
    if (!key.startsWith('get')) qb[key].mockReturnValue(qb);
  }
  return qb;
};

/** A page of `total` rows, of which the first `min(limit, total - offset)` are returned. */
const pageOf =
  (prefix: string, total: number) =>
  ({ page, limit }: { page: number; limit: number }) => {
    const offset = (page - 1) * limit;
    const count = Math.max(0, Math.min(limit, total - offset));
    return Promise.resolve({
      data: Array.from({ length: count }, (_, i) => ({
        id: `${prefix}-${offset + i}`,
      })),
      total,
      page,
      limit,
      pageCount: Math.ceil(total / limit),
    });
  };

const dto = (over: Partial<SearchAssetsTargetsDto>) =>
  ({ page: 1, limit: 10, value: 'acme', ...over }) as SearchAssetsTargetsDto;

describe('SearchService', () => {
  let service: SearchService;
  let historyRepo: {
    findOne: jest.Mock;
    update: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let historyQb: ReturnType<typeof queryBuilder>;
  let vulnQb: ReturnType<typeof queryBuilder>;
  let assetService: { getManyAsssetServices: jest.Mock };
  let targetService: { getTargetsInWorkspace: jest.Mock };

  beforeEach(async () => {
    historyQb = queryBuilder();
    vulnQb = queryBuilder();
    historyRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
      create: jest.fn((v: unknown) => v),
      save: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(historyQb),
    };
    assetService = {
      getManyAsssetServices: jest.fn().mockImplementation(pageOf('a', 0)),
    };
    targetService = {
      getTargetsInWorkspace: jest.fn().mockImplementation(pageOf('t', 0)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: getRepositoryToken(SearchHistory), useValue: historyRepo },
        {
          provide: getRepositoryToken(Vulnerability),
          useValue: { createQueryBuilder: jest.fn().mockReturnValue(vulnQb) },
        },
        { provide: AssetsService, useValue: assetService },
        { provide: TargetsService, useValue: targetService },
      ],
    }).compile();

    service = module.get(SearchService);
  });

  describe('searchAssetsTargets', () => {
    it('searches with the trimmed value', async () => {
      await service.searchAssetsTargets(user, dto({ value: '  acme  ' }), WS);

      expect(assetService.getManyAsssetServices).toHaveBeenCalledWith(
        expect.objectContaining({ value: 'acme' }),
        WS,
      );
      expect(targetService.getTargetsInWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({ value: 'acme' }),
        WS,
      );
    });

    it('returns an empty result without querying when the value is blank and no severity is given', async () => {
      const res = await service.searchAssetsTargets(user, dto({ value: '   ' }), WS);

      expect(res.total).toBe(0);
      expect(res.data).toEqual({ assets: [], targets: [], vulnerabilities: [] });
      expect(res.hasNextPage).toBe(false);
      expect(assetService.getManyAsssetServices).not.toHaveBeenCalled();
      expect(targetService.getTargetsInWorkspace).not.toHaveBeenCalled();
      expect(vulnQb.getMany).not.toHaveBeenCalled();
    });

    it('still runs the severity-only finding search when the value is blank', async () => {
      vulnQb.getMany.mockResolvedValue([{ id: 'v-1' }]);

      const res = await service.searchAssetsTargets(
        user,
        dto({ value: '', severity: ['critical'] as never }),
        WS,
      );

      expect(res.total).toBe(1);
      expect(res.data.vulnerabilities).toHaveLength(1);
      expect(assetService.getManyAsssetServices).not.toHaveBeenCalled();
    });

    it('reports total 0 when nothing matches', async () => {
      const res = await service.searchAssetsTargets(user, dto({ value: 'zzqx' }), WS);

      expect(res.total).toBe(0);
      expect(res.pageCount).toBe(0);
      expect(res.hasNextPage).toBe(false);
    });

    it('splits the page between targets and assets and backfills the unused share', async () => {
      targetService.getTargetsInWorkspace.mockImplementation(pageOf('t', 3));
      assetService.getManyAsssetServices.mockImplementation(pageOf('a', 50));

      const res = await service.searchAssetsTargets(user, dto({ limit: 10 }), WS);

      expect(res.data.targets).toHaveLength(3);
      expect(res.data.assets).toHaveLength(7);
      expect(res.total).toBe(53);
      // assets need ceil(50 / 7) pages at 7 per page
      expect(res.pageCount).toBe(8);
      expect(res.hasNextPage).toBe(true);
    });

    it('gives targets half of the page when both sides have enough matches', async () => {
      targetService.getTargetsInWorkspace.mockImplementation(pageOf('t', 625));
      assetService.getManyAsssetServices.mockImplementation(pageOf('a', 6250));

      const res = await service.searchAssetsTargets(user, dto({ limit: 5 }), WS);

      expect(res.data.targets).toHaveLength(2);
      expect(res.data.assets).toHaveLength(3);
    });

    it('fetches later pages with the per-type limits so pages do not overlap', async () => {
      targetService.getTargetsInWorkspace.mockImplementation(pageOf('t', 3));
      assetService.getManyAsssetServices.mockImplementation(pageOf('a', 50));

      const res = await service.searchAssetsTargets(user, dto({ page: 2 }), WS);

      expect(assetService.getManyAsssetServices).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, limit: 7 }),
        WS,
      );
      expect(res.data.assets.map((a) => (a as { id: string }).id)).toEqual(
        ['a-7', 'a-8', 'a-9', 'a-10', 'a-11', 'a-12', 'a-13'],
      );
      expect(res.data.targets).toHaveLength(0);
      expect(res.hasNextPage).toBe(true);
    });

    it('reports no next page on the last page', async () => {
      targetService.getTargetsInWorkspace.mockImplementation(pageOf('t', 3));
      assetService.getManyAsssetServices.mockImplementation(pageOf('a', 4));

      const res = await service.searchAssetsTargets(user, dto({}), WS);

      expect(res.data.targets).toHaveLength(3);
      expect(res.data.assets).toHaveLength(4);
      expect(res.pageCount).toBe(1);
      expect(res.hasNextPage).toBe(false);
    });

    it('matches findings with an escaped pattern and without unnest', async () => {
      await service.searchAssetsTargets(user, dto({ value: ' 50%_x ' }), WS);

      const call = vulnQb.andWhere.mock.calls.find(
        ([, params]) => params && 'q' in params,
      );
      expect(call?.[1]).toEqual({ q: '%50\\%\\_x%' });
      expect(call?.[0]).not.toContain('unnest');
      expect(call?.[0]).toContain('array_to_string');
    });

    it('saves the trimmed value to history when asked', async () => {
      await service.searchAssetsTargets(
        user,
        dto({ value: ' acme ', isSaveHistory: true }),
        WS,
      );

      expect(historyRepo.save).toHaveBeenCalledWith({
        query: 'acme',
        userId: user.id,
      });
    });

    it('bumps an existing history entry instead of duplicating it', async () => {
      historyRepo.findOne.mockResolvedValue({ id: 'h-1' });

      await service.searchAssetsTargets(user, dto({ isSaveHistory: true }), WS);

      expect(historyRepo.update).toHaveBeenCalledWith('h-1', expect.any(Object));
      expect(historyRepo.save).not.toHaveBeenCalled();
    });

    it('does not save history by default', async () => {
      await service.searchAssetsTargets(user, dto({}), WS);

      expect(historyRepo.findOne).not.toHaveBeenCalled();
      expect(historyRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('getSearchHistory', () => {
    it('filters case-insensitively with an escaped pattern', async () => {
      await service.getSearchHistory(user, {
        page: 1,
        limit: 10,
        query: ' 100%',
      } as never);

      expect(historyQb.andWhere).toHaveBeenCalledWith(
        'searchHistory.query ILIKE :query',
        { query: '%100\\%%' },
      );
    });
  });

  describe('deleteAllSearchHistories', () => {
    it('deletes by user id', async () => {
      await service.deleteAllSearchHistories(user);

      expect(historyRepo.delete).toHaveBeenCalledWith({ userId: user.id });
    });
  });
});
