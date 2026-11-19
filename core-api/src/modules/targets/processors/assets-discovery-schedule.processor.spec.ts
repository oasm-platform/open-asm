import { JobRunType } from '@/common/enums/enum';
import type { TargetsService } from '../targets.service';
import type { Target } from '@/modules/targets/entities/target.entity';
import type { Job } from 'bullmq';
import { AssetsDiscoveryScheduleConsumer } from './assets-discovery-schedule.processor';

describe('AssetsDiscoveryScheduleConsumer', () => {
  it('re-scans the target as a scheduled run in its own workspace', async () => {
    const targetsService = { reScan: jest.fn() };
    const consumer = new AssetsDiscoveryScheduleConsumer(
      targetsService as unknown as TargetsService,
    );

    await consumer.process({
      data: { id: 'target-1', workspaceId: 'workspace-1' },
    } as unknown as Job<Target>);

    expect(targetsService.reScan).toHaveBeenCalledWith(
      'target-1',
      'workspace-1',
      JobRunType.SCHEDULED,
    );
  });
});
