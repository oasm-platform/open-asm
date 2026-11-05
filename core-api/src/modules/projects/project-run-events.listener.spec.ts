import { RunOutcome } from '@/common/enums/enum';
import type { Job } from '../jobs-registry/entities/job.entity';
import { ProjectRunEventsListener } from './project-run-events.listener';

function setup() {
  const projectRepo = {
    findOne: jest.fn().mockResolvedValue({ id: 'p-1', workspace: { id: 'ws-1' } }),
  };
  const eventBridge = { publishSafely: jest.fn() };
  const listener = new ProjectRunEventsListener(
    projectRepo as never,
    eventBridge as never,
  );
  return { listener, projectRepo, eventBridge };
}

const endOf = (jobHistory: object) => ({ id: 'j-1', jobHistory }) as unknown as Job;

describe('ProjectRunEventsListener', () => {
  it('reports a finished project run with how it ended', async () => {
    const { listener, eventBridge } = setup();

    await listener.onRunEnd(
      endOf({
        id: 'r-1',
        projectId: 'p-1',
        projectWorkflowId: 'b-1',
        workflow: { name: 'Recon' },
        steps: { subfinder: { status: 'done' }, httpx: { status: 'failed' } },
      }),
    );

    expect(eventBridge.publishSafely).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'project.run.completed' }),
      expect.objectContaining({
        workspaceId: 'ws-1',
        resourceId: 'r-1',
        payload: {
          projectId: 'p-1',
          projectWorkflowId: 'b-1',
          workflowName: 'Recon',
          jobHistoryId: 'r-1',
          outcome: RunOutcome.FAILURE,
        },
      }),
      { subject: 'workspace:ws-1/project:p-1' },
    );
  });

  it('reports nothing for a run outside a project', async () => {
    const { listener, eventBridge, projectRepo } = setup();

    await listener.onRunEnd(endOf({ id: 'r-1', projectId: null }));

    expect(projectRepo.findOne).not.toHaveBeenCalled();
    expect(eventBridge.publishSafely).not.toHaveBeenCalled();
  });

  it('never throws into the emitter', async () => {
    const { listener, projectRepo } = setup();
    projectRepo.findOne.mockRejectedValue(new Error('db down'));

    await expect(
      listener.onRunEnd(endOf({ id: 'r-1', projectId: 'p-1', projectWorkflowId: 'b-1' })),
    ).resolves.toBeUndefined();
  });
});
