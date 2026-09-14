import { JobRunType } from '@/common/enums/enum';
import type { AssetGroupWorkflowService } from '@/modules/asset-group/asset-group-workflow.service';
import type { AssetGroupWorkflow } from '@/modules/asset-group/entities/asset-groups-workflows.entity';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Job } from 'bullmq';
import { AssetGroupsScheduleConsumer } from './scan-schedule.processor';

describe('AssetGroupsScheduleConsumer', () => {
  const mockAssetGroupWorkflowService = {
    runGroupWorkflowScheduler: jest.fn(),
    removeGroupWorkflowScheduler: jest.fn(),
  };

  const createMockJob = (
    id: string,
    repeatJobKey?: string | null,
  ): Job<AssetGroupWorkflow> =>
    ({
      data: { id } as AssetGroupWorkflow,
      repeatJobKey: repeatJobKey ?? null,
      remove: jest.fn(),
    }) as unknown as Job<AssetGroupWorkflow>;

  let consumer: AssetGroupsScheduleConsumer;

  beforeEach(() => {
    jest.clearAllMocks();
    consumer = new AssetGroupsScheduleConsumer(
      mockAssetGroupWorkflowService as unknown as AssetGroupWorkflowService,
    );
  });

  it('runs the group workflow scheduler for the job payload', async () => {
    const job = createMockJob('agw-1', 'repeat:agw-1:1');

    await consumer.process(job);

    expect(mockAssetGroupWorkflowService.runGroupWorkflowScheduler).toHaveBeenCalledWith(
      'agw-1',
      JobRunType.SCHEDULED,
    );
    expect(mockAssetGroupWorkflowService.removeGroupWorkflowScheduler).not.toHaveBeenCalled();
  });

  it('removes the BullMQ scheduler when the asset group workflow is not found', async () => {
    mockAssetGroupWorkflowService.runGroupWorkflowScheduler.mockRejectedValueOnce(
      new NotFoundException('Asset group workflow with ID "agw-1" not found'),
    );
    const job = createMockJob('agw-1', 'repeat:agw-1:1');

    await expect(consumer.process(job)).resolves.toBeUndefined();

    expect(mockAssetGroupWorkflowService.removeGroupWorkflowScheduler).toHaveBeenCalledWith(
      'repeat:agw-1:1',
    );
  });

  it('removes the current job when not found and no repeat key exists', async () => {
    mockAssetGroupWorkflowService.runGroupWorkflowScheduler.mockRejectedValueOnce(
      new NotFoundException('Asset group workflow with ID "agw-1" not found'),
    );
    const job = createMockJob('agw-1', null);

    await expect(consumer.process(job)).resolves.toBeUndefined();

    expect(job.remove).toHaveBeenCalled();
    expect(mockAssetGroupWorkflowService.removeGroupWorkflowScheduler).not.toHaveBeenCalled();
  });

  it('rethrows non-not-found errors and does not remove the job', async () => {
    const error = new BadRequestException('Asset group workflow has no assets');
    mockAssetGroupWorkflowService.runGroupWorkflowScheduler.mockRejectedValueOnce(error);
    const job = createMockJob('agw-1', 'repeat:agw-1:1');

    await expect(consumer.process(job)).rejects.toBe(error);

    expect(mockAssetGroupWorkflowService.removeGroupWorkflowScheduler).not.toHaveBeenCalled();
    expect(job.remove).not.toHaveBeenCalled();
  });
});
