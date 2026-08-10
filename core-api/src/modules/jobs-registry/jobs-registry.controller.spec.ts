import { WorkspacePermissions } from '@/common/decorators/workspace-permissions.decorator';
import { Reflector } from '@nestjs/core';
import { JobsRegistryController } from './jobs-registry.controller';

describe('JobsRegistryController workspace guards', () => {
  const required = (methodName: keyof JobsRegistryController) =>
    new Reflector().getAllAndOverride(WorkspacePermissions, [
      JobsRegistryController.prototype[methodName],
      JobsRegistryController,
    ]);

  it('requires job.read on getManyJobs', () => {
    expect(required('getManyJobs')).toEqual(['job.read']);
  });

  it('requires job.read on getJobsTimeline', () => {
    expect(required('getJobsTimeline')).toEqual(['job.read']);
  });

  it('requires job.read on getManyJobHistories', () => {
    expect(required('getManyJobHistories')).toEqual(['job.read']);
  });

  it('requires job.read on getJobHistoryDetail', () => {
    expect(required('getJobHistoryDetail')).toEqual(['job.read']);
  });

  it('requires job.write on reRunJob', () => {
    expect(required('reRunJob')).toEqual(['job.write']);
  });

  it('requires job.write on cancelJob', () => {
    expect(required('cancelJob')).toEqual(['job.write']);
  });

  it('requires job.delete on deleteJob', () => {
    expect(required('deleteJob')).toEqual(['job.delete']);
  });
});
