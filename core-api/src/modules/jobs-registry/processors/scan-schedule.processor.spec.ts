import { JobRunType } from '@/common/enums/enum';
import type { AssetsService } from '@/modules/assets/assets.service';
import type { Target } from '@/modules/targets/entities/target.entity';
import type { Job } from 'bullmq';
import { AssetsDiscoveryScheduleConsumer } from './scan-schedule.processor';

describe('AssetsDiscoveryScheduleConsumer', () => {
  it('re-scans the target as a scheduled run in its own workspace', async () => {
    const assetsService = { reScan: jest.fn() };
    const consumer = new AssetsDiscoveryScheduleConsumer(
      assetsService as unknown as AssetsService,
    );

    await consumer.process({
      data: { id: 'target-1', workspaceId: 'workspace-1' },
    } as unknown as Job<Target>);

    expect(assetsService.reScan).toHaveBeenCalledWith(
      'target-1',
      'workspace-1',
      JobRunType.SCHEDULED,
    );
  });
});
