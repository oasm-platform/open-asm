import {
  EventBusGroup,
  ProjectTriggerEvent,
  RunOutcome,
  Severity,
} from '@/common/enums/enum';
import type { ConsumedEvent } from '../../contracts/event-envelope';
import { factOf, ProjectsSink } from './projects.sink';

const event = (payload: unknown, eventId = 'e-1'): ConsumedEvent => ({
  eventId,
  workspaceId: 'ws-1',
  payload,
});

function setup() {
  const projects = { addDiscoveredAssets: jest.fn() };
  const triggers = { onTriggerEvent: jest.fn() };
  const handled = new Set<string>();
  const redis = {
    get: jest.fn((key: string) => Promise.resolve(handled.has(key) ? '1' : null)),
    setex: jest.fn((key: string) => {
      handled.add(key);
      return Promise.resolve('OK');
    }),
  };
  const sink = new ProjectsSink(projects, triggers, redis as never);
  return { sink, projects, triggers, redis };
}

describe('ProjectsSink', () => {
  it('is the projects lane and takes discovery and the trigger events', () => {
    const { sink } = setup();
    expect(sink.group).toBe(EventBusGroup.Projects);
    expect(sink.accepts('asset.discovered')).toBe(true);
    expect(sink.accepts('project.assets.added')).toBe(true);
    expect(sink.accepts('project.run.completed')).toBe(true);
    expect(sink.accepts('vulnerability.detected')).toBe(true);
    expect(sink.accepts('asset.deleted')).toBe(false);
    expect(sink.accepts('project.updated')).toBe(false);
    expect(sink.accepts('vulnerability.dismissed')).toBe(false);
  });

  it('hands the batch to the projects of the workspace, with the run that found it', async () => {
    const { sink, projects } = setup();
    await sink.handle(
      'asset.discovered',
      event({ targetId: 't-1', jobHistoryId: 'r-1', assetIds: ['a-1', 'a-2'] }),
    );
    expect(projects.addDiscoveredAssets).toHaveBeenCalledWith(
      'ws-1',
      ['a-1', 'a-2'],
      'r-1',
    );
  });

  it('ignores a payload without asset ids', async () => {
    const { sink, projects } = setup();
    await sink.handle('asset.discovered', event({ targetId: 't-1' }));
    await sink.handle('asset.discovered', event(null));
    expect(projects.addDiscoveredAssets).not.toHaveBeenCalled();
  });

  it('hands a trigger event over once, however often it is delivered', async () => {
    const { sink, triggers } = setup();
    const added = event({ projectId: 'p-1', assetIds: ['a-1'] });

    await sink.handle('project.assets.added', added);
    await sink.handle('project.assets.added', added);

    expect(triggers.onTriggerEvent).toHaveBeenCalledTimes(1);
    expect(triggers.onTriggerEvent).toHaveBeenCalledWith({
      event: ProjectTriggerEvent.ASSETS_ADDED,
      workspaceId: 'ws-1',
      projectId: 'p-1',
      assetIds: ['a-1'],
    });
  });

  it('redoes the work after a failure, since nothing marked it handled', async () => {
    const { sink, triggers } = setup();
    triggers.onTriggerEvent.mockRejectedValueOnce(new Error('redis down'));
    const added = event({ projectId: 'p-1', assetIds: ['a-1'] });

    await expect(sink.handle('project.assets.added', added)).rejects.toThrow('redis down');
    await sink.handle('project.assets.added', added);

    expect(triggers.onTriggerEvent).toHaveBeenCalledTimes(2);
  });
});

describe('factOf', () => {
  it('reads a finished project run', () => {
    expect(
      factOf(
        'project.run.completed',
        event({
          projectId: 'p-1',
          projectWorkflowId: 'b-1',
          workflowName: 'Recon',
          jobHistoryId: 'r-1',
          outcome: 'failure',
        }),
      ),
    ).toEqual({
      event: ProjectTriggerEvent.RUN_COMPLETED,
      workspaceId: 'ws-1',
      projectId: 'p-1',
      projectWorkflowId: 'b-1',
      workflowName: 'Recon',
      runId: 'r-1',
      outcome: RunOutcome.FAILURE,
    });
  });

  it('reads the severities of the vulnerabilities a job found', () => {
    expect(
      factOf(
        'vulnerability.detected',
        event({
          jobId: 'j-1',
          assetId: 'a-1',
          vulnerabilities: [
            { severity: 'high' },
            { severity: 'high' },
            { severity: 'info' },
            { severity: 'nonsense' },
          ],
        }),
      ),
    ).toEqual({
      event: ProjectTriggerEvent.VULNERABILITY_DETECTED,
      workspaceId: 'ws-1',
      assetId: 'a-1',
      jobId: 'j-1',
      severities: [Severity.HIGH, Severity.INFO],
    });
  });

  it('reads nothing from a payload missing what a trigger needs', () => {
    expect(factOf('project.assets.added', event({ projectId: 'p-1', assetIds: [] }))).toBeNull();
    expect(factOf('project.run.completed', event({ projectId: 'p-1' }))).toBeNull();
    expect(factOf('vulnerability.detected', event({ jobId: 'j-1', assetId: 'a-1' }))).toBeNull();
    expect(factOf('project.updated', event({}))).toBeNull();
  });
});
