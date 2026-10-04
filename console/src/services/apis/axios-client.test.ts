import { afterEach, describe, expect, it } from 'vitest';
import { setGlobalWorkspaceId } from '@/utils/workspaceState';
import { axiosInstance } from './axios-client';

describe('axiosInstance workspace scoping', () => {
  afterEach(() => {
    setGlobalWorkspaceId(null);
  });

  it('adds the selected workspace id to the request header', async () => {
    let workspaceHeader: unknown;
    setGlobalWorkspaceId('workspace-1');

    await axiosInstance.get('/api/tools/install', {
      adapter: async (config) => {
        workspaceHeader = config.headers.get('X-Workspace-Id');

        return {
          config,
          data: null,
          headers: {},
          status: 200,
          statusText: 'OK',
        };
      },
    });

    expect(workspaceHeader).toBe('workspace-1');
  });
});
