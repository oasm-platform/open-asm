import { Reflector } from '@nestjs/core';
import { PUBLISH_EVENT_KEY, type PublishEventConfig } from '../event-bridge/publish-event.decorator';
import { JobsRegistryController } from './jobs-registry.controller';

describe('JobsRegistryController audit wiring (M4.4 decorator events)', () => {
  const reflector = new Reflector();

  const auditConfig = (method: () => unknown) =>
    reflector.getAllAndOverride<PublishEventConfig & { event: unknown }>(
      PUBLISH_EVENT_KEY,
      [method, JobsRegistryController],
    );

  it('cancelJob is wired to the job.cancelled event', () => {
    expect(auditConfig(JobsRegistryController.prototype.cancelJob)).toEqual(
      expect.objectContaining({
        event: expect.objectContaining({ name: 'job.cancelled' }),
      }),
    );
  });

  it('cancelJobHistory is wired to the job.cancelled event', () => {
    expect(
      auditConfig(JobsRegistryController.prototype.cancelJobHistory),
    ).toEqual(expect.objectContaining({
        event: expect.objectContaining({ name: 'job.cancelled' }),
      }));
  });

  it('cancelJob is bare: jobId is not capturable from body/result, no changes or metadata', () => {
    const config = auditConfig(JobsRegistryController.prototype.cancelJob);
    expect(config?.changes).toBeUndefined();
    expect(config?.metadata).toBeUndefined();
    expect(config?.resourceId).toBeUndefined();
  });

  it('unwired job handlers are NOT audit-decorated', () => {
    for (const method of [
      'getManyJobs',
      'getJobsTimeline',
      'getManyJobHistories',
      'getJobHistoryDetail',
      'reRunJob',
      'deleteJob',
    ]) {
      expect(
        auditConfig(JobsRegistryController.prototype[method as keyof JobsRegistryController]),
      ).toBeUndefined();
    }
  });
});
