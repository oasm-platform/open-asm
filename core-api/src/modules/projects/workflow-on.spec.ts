import { ProjectTriggerType, TargetType } from '@/common/enums/enum';
import {
  keyOfRow,
  onOfTriggers,
  planTriggerSync,
  triggersOfOn,
  WorkflowOnError,
} from './workflow-on';

const cron = (expression: string) => ({
  type: ProjectTriggerType.CRON,
  cron: expression,
  config: {},
});

describe('triggersOfOn', () => {
  it('reads every shape a schedule was written in, once each', () => {
    expect(
      triggersOfOn({ schedule: [{ cron: '0 2 * * 1' }, '0  2 * * 1', '30 14 * * *'] }),
    ).toEqual([
      { key: 'cron:0 2 * * 1', type: ProjectTriggerType.CRON, cron: '0 2 * * 1' },
      { key: 'cron:30 14 * * *', type: ProjectTriggerType.CRON, cron: '30 14 * * *' },
    ]);
    // The string a pre-project workflow stored.
    expect(triggersOfOn({ schedule: '0 0 */3 * *' })).toHaveLength(1);
  });

  it('reads "assets added" with its defaults, and ignores target events', () => {
    expect(triggersOfOn({ assetsAdded: { maxAssets: 50 }, target: ['domain.create'] })).toEqual([
      {
        key: 'assets_added',
        type: ProjectTriggerType.ASSETS_ADDED,
        config: { windowMinutes: 10, maxAssets: 50, targetTypes: [] },
      },
    ]);
    expect(triggersOfOn({ assetsAdded: true })).toHaveLength(1);
    expect(triggersOfOn(undefined)).toEqual([]);
  });

  it('reports every invalid entry with where it is', () => {
    expect(() =>
      triggersOfOn({
        schedule: ['every day', { cron: '0 2 * * 1' }],
        assetsAdded: { windowMinutes: 9999, targetTypes: ['PLANET'], speed: 1 },
      }),
    ).toThrow(
      new WorkflowOnError([
        'on.schedule[0]: "every day" is not a 5-field cron expression',
        'on.assetsAdded: windowMinutes must be a whole number from 0 to 1440',
        `on.assetsAdded: targetTypes must list target types (${Object.values(TargetType).join(', ')})`,
        'on.assetsAdded: unknown setting speed',
      ]),
    );
  });
});

describe('onOfTriggers', () => {
  it('writes the canonical block, and nothing when there is nothing', () => {
    expect(onOfTriggers(triggersOfOn({ schedule: '0 2 * * 1', assetsAdded: {} }))).toEqual({
      schedule: [{ cron: '0 2 * * 1' }],
      assetsAdded: { windowMinutes: 10, maxAssets: 200, targetTypes: [] },
    });
    expect(onOfTriggers([])).toBeUndefined();
  });
});

describe('planTriggerSync', () => {
  it('creates what the file adds, removes what it dropped, keeps the rest', () => {
    const kept = { id: 'keep', ...cron('0 2 * * 1') };
    const dropped = { id: 'drop', ...cron('0 3 * * 1') };
    const plan = planTriggerSync(
      [kept, dropped],
      triggersOfOn({ schedule: ['0 2 * * 1', '0 4 * * 1'] }),
    );

    expect(plan.create.map((t) => t.cron)).toEqual(['0 4 * * 1']);
    expect(plan.remove).toEqual([dropped]);
    expect(plan.update).toEqual([]);
  });

  it('copies changed "assets added" settings to the row', () => {
    const row = {
      id: 'a',
      type: ProjectTriggerType.ASSETS_ADDED,
      cron: null,
      config: { windowMinutes: 10, maxAssets: 200, targetTypes: [] },
    };
    const plan = planTriggerSync([row], triggersOfOn({ assetsAdded: { windowMinutes: 30 } }));

    expect(plan.update).toEqual([
      { row, config: { windowMinutes: 30, maxAssets: 200, targetTypes: [] } },
    ]);
  });

  it('drops a duplicate row of one entry', () => {
    const first = { id: '1', ...cron('0 2 * * 1') };
    const second = { id: '2', ...cron('0 2 * * 1') };
    const plan = planTriggerSync([first, second], triggersOfOn({ schedule: ['0 2 * * 1'] }));

    expect(plan.remove).toHaveLength(1);
    expect(plan.create).toEqual([]);
  });

  it('keys a row the way the file keys its entry', () => {
    expect(keyOfRow({ type: ProjectTriggerType.CRON, cron: ' 0 2 * * 1' })).toBe('cron:0 2 * * 1');
    expect(keyOfRow({ type: ProjectTriggerType.ASSETS_ADDED, cron: null })).toBe('assets_added');
  });
});
