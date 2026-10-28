import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  stripSearchParams,
} from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { tableSearch } from './table-search';

async function makeRouter() {
  const table = tableSearch({ sortBy: 'value', sortOrder: 'ASC' }, { tab: 'service' });
  const root = createRootRoute();
  const list = createRoute({
    getParentRoute: () => root,
    path: '/list',
    validateSearch: z.object({
      tab: z.string().default('service'),
      ...table.shape,
      isNew: z.union([z.boolean(), z.string()]).optional(),
    }),
    search: { middlewares: [stripSearchParams(table.defaults)] },
  });
  const router = createRouter({
    routeTree: root.addChildren([list]),
    history: createMemoryHistory({ initialEntries: ['/list'] }),
  });
  await router.load();
  // navigate() is typed against the app's route tree, which has no /list.
  const go = (search: Record<string, unknown>) =>
    router.navigate({ to: '/list', search } as never);
  return { router, go };
}

describe('tableSearch', () => {
  it('keeps defaults out of the URL while the table still reads them', async () => {
    const { router, go } = await makeRouter();

    await go({ tab: 'urls', page: 1, pageSize: 10, sortBy: 'value', sortOrder: 'ASC', filter: '' });

    expect(router.state.location.searchStr).toBe('?tab=urls');
    expect(router.state.matches.at(-1)?.search).toMatchObject({
      tab: 'urls',
      page: 1,
      pageSize: 10,
      sortBy: 'value',
      sortOrder: 'ASC',
      filter: '',
    });
  });

  it('writes only what changed from the default', async () => {
    const { router, go } = await makeRouter();

    await go({ tab: 'service', page: 2, pageSize: 10, sortBy: 'createdAt', sortOrder: 'ASC', filter: '' });

    const params = new URLSearchParams(router.state.location.searchStr);
    expect(Object.fromEntries(params)).toEqual({ page: '2', sortBy: 'createdAt' });
  });

  it('keeps params the schema does not default, such as isNew', async () => {
    const { router, go } = await makeRouter();

    await go({ isNew: true });

    expect(router.state.location.searchStr).toBe('?isNew=true');
  });
});
