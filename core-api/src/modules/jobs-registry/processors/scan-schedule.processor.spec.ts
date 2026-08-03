import { JobRunType } from '@/common/enums/enum';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { AssetGroupService } from '../../asset-group/asset-group.service';
import type { AssetGroupWorkflow } from '../../asset-group/entities/asset-groups-workflows.entity';
import { AssetGroupsScheduleConsumer } from './scan-schedule.processor';

describe('AssetGroupsScheduleConsumer', () => {
  const mockAssetGroupService = {
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
      mockAssetGroupService as unknown as AssetGroupService,
    );
  });

  it('runs the group workflow scheduler for the job payload', async () => {
    const job = createMockJob('agw-1', 'repeat:agw-1:1');

    await consumer.process(job);

    expect(mockAssetGroupService.runGroupWorkflowScheduler).toHaveBeenCalledWith(
      'agw-1',
      JobRunType.SCHEDULED,
    );
    expect(mockAssetGroupService.removeGroupWorkflowScheduler).not.toHaveBeenCalled();
  });

  it('removes the BullMQ scheduler when the asset group workflow is not found', async () => {
    mockAssetGroupService.runGroupWorkflowScheduler.mockRejectedValueOnce(
      new NotFoundException('Asset group workflow with ID "agw-1" not found'),
    );
    const job = createMockJob('agw-1', 'repeat:agw-1:1');

    await expect(consumer.process(job)).resolves.toBeUndefined();

    expect(mockAssetGroupService.removeGroupWorkflowScheduler).toHaveBeenCalledWith(
      'repeat:agw-1:1',
    );
  });

  it('removes the current job when not found and no repeat key exists', async () => {
    mockAssetGroupService.runGroupWorkflowScheduler.mockRejectedValueOnce(
      new NotFoundException('Asset group workflow with ID "agw-1" not found'),
    );
    const job = createMockJob('agw-1', null);

    await expect(consumer.process(job)).resolves.toBeUndefined();

    expect(job.remove).toHaveBeenCalled();
    expect(mockAssetGroupService.removeGroupWorkflowScheduler).not.toHaveBeenCalled();
  });

  it('rethrows non-not-found errors and does not remove the job', async () => {
    const error = new BadRequestException('Asset group workflow has no assets');
    mockAssetGroupService.runGroupWorkflowScheduler.mockRejectedValueOnce(error);
    const job = createMockJob('agw-1', 'repeat:agw-1:1');

    await expect(consumer.process(job)).rejects.toBe(error);

    expect(mockAssetGroupService.removeGroupWorkflowScheduler).not.toHaveBeenCalled();
    expect(job.remove).not.toHaveBeenCalled();
  });
});
