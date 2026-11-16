import { WorkerScope, WorkerType } from '@/common/enums/enum';
import { secretReleaseDenial } from './job-secret-release.policy';

const { BUILT_IN, PROVIDER } = WorkerType;
const { CLOUD, WORKSPACE } = WorkerScope;
const job = { workspaceId: 'ws-1', tool: { id: 'tool-1', name: 'nuclei' } };

describe('secretReleaseDenial', () => {
  it.each([
    ['a workspace worker, its workspace', BUILT_IN, WORKSPACE, 'ws-1', null, job, null],
    ['a workspace worker, another workspace', BUILT_IN, WORKSPACE, 'ws-1', null, { ...job, workspaceId: 'ws-2' }, /another workspace/],
    ['a cloud worker, any workspace', BUILT_IN, CLOUD, null, null, { ...job, workspaceId: 'ws-2' }, null],
    ['a provider worker, its tool', PROVIDER, CLOUD, null, 'tool-1', job, null],
    ['a provider worker, another tool', PROVIDER, CLOUD, null, 'tool-2', job, /another tool/],
    ['any worker, a job without workspace', BUILT_IN, CLOUD, null, null, { ...job, workspaceId: undefined }, /no workspace/],
  ])('%s', (_case, type, scope, workspaceId, toolId, claimed, expected) => {
    const denial = secretReleaseDenial({ type, scope, workspaceId, toolId }, claimed);

    if (expected) expect(denial).toMatch(expected);
    else expect(denial).toBeNull();
  });
});
