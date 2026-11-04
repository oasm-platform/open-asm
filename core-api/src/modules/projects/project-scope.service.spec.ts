import { ProjectScopeRuleMode, ProjectScopeRuleType } from '@/common/enums/enum';
import { BadRequestException } from '@nestjs/common';
import { ProjectScopeService } from './project-scope.service';

const WORKSPACE_ID = 'ws-1';
const TARGET_ID = '3f1c2a8e-6c1b-4d5e-9f00-0a1b2c3d4e5f';

function setup() {
  const projectRepo = { findOne: jest.fn().mockResolvedValue({ id: 'p-1' }) };
  const ruleRepo = { find: jest.fn(), save: jest.fn(), create: jest.fn((v: object) => v) };
  const dataSource = { query: jest.fn(), transaction: jest.fn() };
  const service = new ProjectScopeService(
    projectRepo as never,
    ruleRepo as never,
    dataSource as never,
  );
  return { service, projectRepo, ruleRepo, dataSource };
}

const include = (type: ProjectScopeRuleType, value: string) => ({
  mode: ProjectScopeRuleMode.INCLUDE,
  type,
  value,
});

describe('ProjectScopeService', () => {
  describe('normalizeRules', () => {
    it('refuses a bad value with a 400', async () => {
      const ctx = setup();
      await expect(
        ctx.service.normalizeRules(WORKSPACE_ID, [
          include(ProjectScopeRuleType.CIDR, '10.0.0.0/40'),
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a target of another workspace', async () => {
      const ctx = setup();
      ctx.dataSource.query.mockResolvedValue([]);
      await expect(
        ctx.service.normalizeRules(WORKSPACE_ID, [
          include(ProjectScopeRuleType.TARGET, TARGET_ID),
        ]),
      ).rejects.toThrow(`Target "${TARGET_ID}" not found`);
      expect(ctx.dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM targets'),
        [[TARGET_ID], WORKSPACE_ID],
      );
    });

    it('drops duplicates after canonicalizing', async () => {
      const ctx = setup();
      const rules = await ctx.service.normalizeRules(WORKSPACE_ID, [
        include(ProjectScopeRuleType.HOSTNAME, '*.Acme.io'),
        include(ProjectScopeRuleType.HOSTNAME, '*.acme.io '),
      ]);
      expect(rules).toEqual([include(ProjectScopeRuleType.HOSTNAME, '*.acme.io')]);
    });
  });

  describe('sync', () => {
    it('removes every rule-added asset when no include rule is left', async () => {
      const ctx = setup();
      const manager = { query: jest.fn().mockResolvedValue([[{ id: 'x' }, { id: 'y' }], 2]) };

      const result = await ctx.service.sync(manager as never, 'p-1', WORKSPACE_ID, [
        {
          mode: ProjectScopeRuleMode.EXCLUDE,
          type: ProjectScopeRuleType.HOSTNAME,
          value: 'dev.acme.io',
        },
      ]);

      expect(manager.query).toHaveBeenCalledTimes(1);
      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM project_assets'),
        ['p-1', 'rule'],
      );
      expect(result).toEqual({ added: [], removed: 2 });
    });

    it('removes, repoints and adds rule assets against one desired set', async () => {
      const ctx = setup();
      const manager = {
        query: jest
          .fn()
          .mockResolvedValueOnce([[], 0])
          .mockResolvedValueOnce([[], 0])
          .mockResolvedValueOnce([{ assetId: 'a-1' }]),
      };

      const result = await ctx.service.sync(manager as never, 'p-1', WORKSPACE_ID, [
        { id: 'r-1', ...include(ProjectScopeRuleType.HOSTNAME, '*.acme.io') },
      ]);

      const statements = manager.query.mock.calls.map(([sql]) => sql as string);
      expect(statements[0]).toContain('DELETE FROM project_assets');
      expect(statements[1]).toContain('UPDATE project_assets');
      expect(statements[2]).toContain('ON CONFLICT ("projectId", "assetId") DO NOTHING');
      for (const sql of statements) expect(sql).toMatch(/^WITH desired AS/);
      expect(manager.query.mock.calls[0][1]).toEqual([
        'p-1',
        WORKSPACE_ID,
        '%.acme.io',
        'r-1',
      ]);
      expect(result).toEqual({ added: ['a-1'], removed: 0 });
    });
  });

  describe('addDiscoveredAssets', () => {
    it('adds each batch to the projects whose rules select it', async () => {
      const ctx = setup();
      ctx.dataSource.query
        // auto-add projects' rules
        .mockResolvedValueOnce([
          { id: 'r-1', projectId: 'p-1', ...include(ProjectScopeRuleType.TARGET, TARGET_ID) },
          { id: 'r-2', projectId: 'p-2', ...include(ProjectScopeRuleType.HOSTNAME, '*.other.io') },
        ])
        .mockResolvedValueOnce([{ assetId: 'a-1' }])
        .mockResolvedValueOnce([]);

      const added = await ctx.service.addDiscoveredAssets(WORKSPACE_ID, ['a-1', 'a-2']);

      expect(ctx.dataSource.query.mock.calls[0][1]).toEqual([WORKSPACE_ID]);
      expect(ctx.dataSource.query.mock.calls[1][1].slice(0, 3)).toEqual([
        'p-1',
        WORKSPACE_ID,
        ['a-1', 'a-2'],
      ]);
      expect([...added]).toEqual([['p-1', ['a-1']]]);
    });

    it('queries nothing for an empty batch', async () => {
      const ctx = setup();
      expect(await ctx.service.addDiscoveredAssets(WORKSPACE_ID, [])).toEqual(new Map());
      expect(ctx.dataSource.query).not.toHaveBeenCalled();
    });
  });
});
