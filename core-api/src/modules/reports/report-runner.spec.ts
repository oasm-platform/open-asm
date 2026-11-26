import { Logger } from '@nestjs/common';
import { NotFoundError } from '@/common/errors/domain.errors';
import { AsqError } from '@/modules/attack-surface-query/domain/query-errors';
import type { QueryScope } from '@/modules/attack-surface-query/domain/query.types';
import { ReportRunner } from './report-runner';
import type { BuiltinTemplate } from './templates/template.types';

const scope: QueryScope = { workspaceId: 'w1', permissions: ['asset.read'], caller: 'report' };

function setup(workspaces: unknown[] = [{ id: 'w1', name: 'Acme' }]) {
  const asq = { run: jest.fn() };
  const workspacesService = { getWorkspacesByIds: jest.fn().mockResolvedValue(workspaces) };
  const runner = new ReportRunner(asq as never, workspacesService as never);
  return { asq, workspacesService, runner };
}

const template = (toData: jest.Mock) =>
  ({
    id: 'summary',
    queries: jest.fn().mockReturnValue([{ queries: { a: {} } }, { queries: { b: {} } }]),
    toData,
  }) as unknown as BuiltinTemplate<{ x: number }, unknown>;

describe('ReportRunner', () => {
  afterEach(() => jest.restoreAllMocks());

  it('runs the batches in order as the caller and hands every result to toData', async () => {
    const { asq, runner } = setup();
    const order: string[] = [];
    asq.run.mockImplementation(async (_s, batch) => {
      order.push(Object.keys(batch.queries)[0]);
      return { data: { [order.at(-1)!]: { rows: [], truncated: false } } };
    });
    const toData = jest.fn().mockReturnValue({ ok: true });
    const tpl = template(toData);

    await expect(runner.run(tpl, scope, { x: 1 })).resolves.toEqual({ ok: true });

    expect(order).toEqual(['a', 'b']);
    expect(asq.run).toHaveBeenNthCalledWith(1, scope, { queries: { a: {} } });
    expect(tpl.queries).toHaveBeenCalledWith({ x: 1 }, expect.any(Date));
    const [results, ctx] = toData.mock.calls[0];
    expect(results).toHaveLength(2);
    expect(ctx).toMatchObject({ workspaceName: 'Acme', options: { x: 1 } });
    expect(ctx.now).toBeInstanceOf(Date);
  });

  it('throws NotFoundError for an unknown workspace and runs nothing', async () => {
    const { asq, runner } = setup([]);
    const toData = jest.fn();
    await expect(runner.run(template(toData), scope, { x: 1 })).rejects.toThrow(NotFoundError);
    expect(asq.run).not.toHaveBeenCalled();
  });

  it('rejects when a query batch fails and does not run the next batches', async () => {
    const { asq, runner } = setup();
    asq.run.mockRejectedValueOnce(new AsqError('INTERNAL', 'boom'));
    const toData = jest.fn();
    await expect(runner.run(template(toData), scope, { x: 1 })).rejects.toThrow('boom');
    expect(asq.run).toHaveBeenCalledTimes(1);
    expect(toData).not.toHaveBeenCalled();
  });

  it('rejects when toData throws (e.g. an errored query read through rowsOf)', async () => {
    const { asq, runner } = setup();
    asq.run.mockResolvedValue({ data: { a: { error: { code: 'INTERNAL', message: 'bad' } } } });
    const toData = jest.fn().mockImplementation(() => {
      throw new AsqError('INTERNAL', 'bad');
    });
    await expect(runner.run(template(toData), scope, { x: 1 })).rejects.toThrow('bad');
  });

  it('warns once per truncated query, naming the template and the query', async () => {
    const { asq, runner } = setup();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    asq.run.mockResolvedValue({
      data: {
        all: { rows: [], truncated: true },
        ok: { rows: [], truncated: false },
        failed: { error: { code: 'X', message: 'm' } },
      },
    });
    await runner.run(template(jest.fn().mockReturnValue(1)), scope, { x: 1 });
    // two batches return the same shape: one warning per truncated query result
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('summary'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"all"'));
  });
});
