import {
  ProjectTriggerEvent,
  ProjectTriggerType,
  RunOutcome,
  Severity,
  TargetType,
} from '@/common/enums/enum';
import {
  enabledByKey,
  keyOfRow,
  onOfTriggers,
  planTriggerSync,
  triggersOfInput,
  triggersOfOn,
  WorkflowOnError,
} from './workflow-on';

const cron = (expression: string) => ({
  type: ProjectTriggerType.CRON,
  cron: expression,
  event: null,
  config: {},
});

const ADDED = ProjectTriggerEvent.ASSETS_ADDED;
const COMPLETED = ProjectTriggerEvent.RUN_COMPLETED;
const DETECTED = ProjectTriggerEvent.VULNERABILITY_DETECTED;

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

  it('reads each event with its defaults, and ignores target events', () => {
    expect(
      triggersOfOn({
        [ADDED]: { maxAssets: 50 },
        [COMPLETED]: true,
        [DETECTED]: {},
        target: ['domain.create'],
      }),
    ).toEqual([
      {
        key: 'event:project.assets.added',
        type: ProjectTriggerType.EVENT,
        event: ADDED,
        config: { windowMinutes: 10, maxAssets: 50, targetTypes: [] },
      },
      {
        key: 'event:project.run.completed',
        type: ProjectTriggerType.EVENT,
        event: COMPLETED,
        config: {
          windowMinutes: 10,
          maxAssets: 200,
          targetTypes: [],
          workflows: [],
          status: [RunOutcome.SUCCESS],
        },
      },
      {
        key: 'event:vulnerability.detected',
        type: ProjectTriggerType.EVENT,
        event: DETECTED,
        config: {
          windowMinutes: 10,
          maxAssets: 200,
          targetTypes: [],
          severity: [Severity.CRITICAL, Severity.HIGH],
        },
      },
    ]);
    expect(triggersOfOn({ [ADDED]: false })).toEqual([]);
    expect(triggersOfOn(undefined)).toEqual([]);
  });

  it('reports every invalid entry with where it is', () => {
    expect(() =>
      triggersOfOn({
        schedule: ['every day', { cron: '0 2 * * 1' }],
        [ADDED]: { windowMinutes: 9999, targetTypes: ['PLANET'], speed: 1 },
        [COMPLETED]: { status: [], workflows: [''], severity: ['high'] },
        [DETECTED]: { severity: ['urgent'] },
        assetsAdded: {},
      }),
    ).toThrow(
      new WorkflowOnError([
        'on.schedule[0]: "every day" is not a 5-field cron expression',
        'on.project.assets.added: windowMinutes must be a whole number from 0 to 1440',
        `on.project.assets.added: targetTypes must list target types (${Object.values(TargetType).join(', ')})`,
        'on.project.assets.added: unknown setting speed',
        'on.project.run.completed: workflows must list up to 20 workflow names',
        'on.project.run.completed: status must list one or more run outcomes (success, failure)',
        'on.project.run.completed: unknown setting severity',
        `on.vulnerability.detected: severity must list one or more severities (${Object.values(Severity).join(', ')})`,
        'on.assetsAdded: unknown trigger (schedule, project.assets.added, project.run.completed, vulnerability.detected)',
      ]),
    );
  });
});

describe('triggersOfInput and enabledByKey', () => {
  const input = {
    schedule: [{ cron: ' 0  2 * * 1 ', enabled: false }, { cron: '30 14 * * *' }],
    events: [
      { event: ADDED, windowMinutes: 5, enabled: true },
      { event: COMPLETED, workflows: ['Recon'], status: [RunOutcome.SUCCESS] },
    ],
  };

  it('reads what the workflow editor sends, without the on/off state', () => {
    const triggers = triggersOfInput(input);
    expect(triggers.map((t) => t.key)).toEqual([
      'cron:0 2 * * 1',
      'cron:30 14 * * *',
      'event:project.assets.added',
      'event:project.run.completed',
    ]);
    expect(triggers[3].config).toMatchObject({ workflows: ['Recon'], windowMinutes: 10 });
    expect(triggersOfInput({ events: [] })).toEqual([]);
  });

  it('keys the on/off state the same way, only where it was sent', () => {
    expect([...enabledByKey(input)]).toEqual([
      ['cron:0 2 * * 1', false],
      ['event:project.assets.added', true],
    ]);
  });

  it('takes the first of two equal entries, the one that is kept', () => {
    const twice = { schedule: [{ cron: '0 2 * * 1', enabled: false }, { cron: '0 2 * * 1' }] };
    expect(triggersOfInput(twice)).toHaveLength(1);
    expect(enabledByKey({ schedule: [...twice.schedule, { cron: '0 2 * * 1', enabled: true }] }))
      .toEqual(new Map([['cron:0 2 * * 1', false]]));

    const events = [
      { event: DETECTED, severity: [Severity.LOW], enabled: false },
      { event: DETECTED, severity: [Severity.HIGH], enabled: true },
    ];
    expect(triggersOfInput({ events }).map((t) => t.config?.severity)).toEqual([
      [Severity.LOW],
    ]);
    expect(enabledByKey({ events })).toEqual(
      new Map([['event:vulnerability.detected', false]]),
    );
  });

  it('never takes "disabled" for a schedule', () => {
    expect(() => triggersOfInput({ schedule: [{ cron: 'disabled' }] })).toThrow(WorkflowOnError);
  });
});

describe('onOfTriggers', () => {
  it('writes the canonical block, and nothing when there is nothing', () => {
    expect(
      onOfTriggers(triggersOfOn({ schedule: '0 2 * * 1', [DETECTED]: {}, [ADDED]: {} })),
    ).toEqual({
      schedule: [{ cron: '0 2 * * 1' }],
      [ADDED]: { windowMinutes: 10, maxAssets: 200, targetTypes: [] },
      [DETECTED]: {
        windowMinutes: 10,
        maxAssets: 200,
        targetTypes: [],
        severity: [Severity.CRITICAL, Severity.HIGH],
      },
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

  it('copies changed event settings to the row', () => {
    const row = {
      id: 'a',
      type: ProjectTriggerType.EVENT,
      cron: null,
      event: ADDED,
      config: { windowMinutes: 10, maxAssets: 200, targetTypes: [] },
    };
    const plan = planTriggerSync([row], triggersOfOn({ [ADDED]: { windowMinutes: 30 } }));

    expect(plan.update).toEqual([
      { row, config: { windowMinutes: 30, maxAssets: 200, targetTypes: [] } },
    ]);
    expect(
      planTriggerSync([row], triggersOfOn({ [ADDED]: { windowMinutes: 10 } })).update,
    ).toEqual([]);
  });

  it('removes the row of an event the file no longer runs on', () => {
    const row = {
      id: 'a',
      type: ProjectTriggerType.EVENT,
      cron: null,
      event: COMPLETED,
      config: {},
    };
    const plan = planTriggerSync([row], triggersOfOn({ [DETECTED]: {} }));
    expect(plan.remove).toEqual([row]);
    expect(plan.create.map((t) => t.event)).toEqual([DETECTED]);
  });

  it('drops a duplicate row of one entry', () => {
    const first = { id: '1', ...cron('0 2 * * 1') };
    const second = { id: '2', ...cron('0 2 * * 1') };
    const plan = planTriggerSync([first, second], triggersOfOn({ schedule: ['0 2 * * 1'] }));

    expect(plan.remove).toHaveLength(1);
    expect(plan.create).toEqual([]);
  });

  it('keys a row the way the file keys its entry', () => {
    expect(keyOfRow({ type: ProjectTriggerType.CRON, cron: ' 0 2 * * 1', event: null })).toBe(
      'cron:0 2 * * 1',
    );
    expect(keyOfRow({ type: ProjectTriggerType.EVENT, cron: null, event: DETECTED })).toBe(
      'event:vulnerability.detected',
    );
  });
});
