import { SidebarProvider } from '@/components/ui/sidebar';
import { renderWithProviders, screen } from '@/test/utils';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TemplatesSidebar } from './templates-sidebar';

const rename = vi.fn();
const remove = vi.fn();

const renameTab = vi.fn();
let canWrite = true;

vi.mock('../hooks/use-template-tabs', async (importOriginal) => {
  const real =
    await importOriginal<typeof import('../hooks/use-template-tabs')>();
  return {
    ...real,
    useTemplateTabs: () => ({
      ...real.useTemplateTabs(),
      rename: renameTab,
    }),
  };
});

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => canWrite }),
}));

vi.mock('@/hooks/use-debounce', () => ({ default: (v: unknown) => v }));

vi.mock('@/services/apis/gen/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/apis/gen/queries')>()),
  useTemplatesControllerGetMany: vi.fn(),
  useTemplatesControllerRename: () => ({ mutate: rename, isPending: false }),
  useArtifactsControllerRemove: () => ({ mutate: remove, isPending: false }),
  artifactsControllerDownload: vi.fn(),
}));

const artifact = (over: Record<string, unknown>) => ({
  id: 'a1',
  name: 'mine.yaml',
  mimeType: 'application/yaml',
  sizeBytes: 10,
  source: 'template',
  shareType: 'private',
  status: 'active',
  createdBy: { id: 'u1', name: 'Alice', image: null },
  parentFolderId: 'f1',
  isOwner: true,
  createdAt: '2026-10-29T00:00:00Z',
  updatedAt: '2026-10-29T00:00:00Z',
  ...over,
});

async function setup(
  mine: unknown[],
  shared: unknown[] = [],
  extra: Record<string, unknown> = {},
  onCollapse?: () => void,
) {
  const { useTemplatesControllerGetMany } = await import(
    '@/services/apis/gen/queries'
  );
  vi.mocked(useTemplatesControllerGetMany).mockImplementation(((
    params: { scope?: string } | undefined,
  ) => ({
    data: { data: params?.scope === 'shared' ? shared : mine, ...(extra.total && params?.scope !== 'shared' ? { total: extra.total } : {}) },
    isLoading: false,
    refetch: vi.fn(),
    ...extra,
  })) as unknown as typeof useTemplatesControllerGetMany);
  return renderWithProviders(
    <SidebarProvider>
      <TemplatesSidebar onCollapse={onCollapse} />
    </SidebarProvider>,
  );
}

describe('TemplatesSidebar', () => {
  beforeEach(() => {
    rename.mockReset();
    renameTab.mockClear();
    canWrite = true;
    remove.mockClear();
  });

  it('lists my templates with private/shared badge', async () => {
    await setup([
      artifact({ id: 'a1', name: 'one.yaml', shareType: 'private' }),
      artifact({ id: 'a2', name: 'two.yaml', shareType: 'shared' }),
    ]);
    expect(await screen.findByText('one.yaml')).toBeInTheDocument();
    expect(screen.getByText(/^Private · /)).toBeInTheDocument();
    expect(screen.getByText(/^Shared · /)).toBeInTheDocument();
  });

  it('requests name-sorted lists and hints when more exist than shown', async () => {
    const { useTemplatesControllerGetMany } = await import(
      '@/services/apis/gen/queries'
    );
    await setup([artifact({})], [], { total: 250 });
    expect(await screen.findByText('mine.yaml')).toBeInTheDocument();
    expect(useTemplatesControllerGetMany).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: 'name', sortOrder: 'ASC' }),
    );
    expect(screen.getByText('Showing 1 of 250 — search to narrow')).toBeInTheDocument();
  });

  it('Shared filter shows only shared templates, with an empty message', async () => {
    const user = userEvent.setup();
    await setup([artifact({})]);
    await user.click(await screen.findByRole('button', { name: 'Shared 0' }));
    expect(screen.getByText('Nothing shared with you yet')).toBeInTheDocument();
    expect(screen.queryByText('mine.yaml')).not.toBeInTheDocument();
  });

  it('All merges both lists by name; Mine hides shared ones', async () => {
    const user = userEvent.setup();
    await setup(
      [artifact({ id: 'a1', name: 'zeta.yaml' })],
      [artifact({ id: 's1', name: 'alpha.yaml', isOwner: false })],
    );
    const all = await screen.findByRole('button', { name: 'All 2' });
    expect(all).toHaveAttribute('aria-pressed', 'true');
    const names = screen.getAllByText(/.yaml$/).map((n) => n.textContent);
    expect(names).toEqual(['alpha.yaml', 'zeta.yaml']);
    await user.click(screen.getByRole('button', { name: 'Mine 1' }));
    expect(screen.queryByText('alpha.yaml')).not.toBeInTheDocument();
    expect(screen.getByText('zeta.yaml')).toBeInTheDocument();
  });

  it('lists shared templates with owner name', async () => {
    await setup(
      [],
      [artifact({ id: 's1', name: 'theirs.yaml', isOwner: false, createdBy: { id: 'u2', name: 'Bob', image: null } })],
    );
    expect(await screen.findByText('theirs.yaml')).toBeInTheDocument();
    expect(screen.getByText(/^Bob · /)).toBeInTheDocument();
  });

  it('empty list points to the header actions', async () => {
    await setup([]);
    expect(await screen.findByText(/no templates yet/i)).toBeInTheDocument();
  });

  it('Hide list collapses the panel', async () => {
    const user = userEvent.setup();
    const onCollapse = vi.fn();
    await setup([artifact({})], [], {}, onCollapse);
    await user.click(await screen.findByRole('button', { name: /hide list/i }));
    expect(onCollapse).toHaveBeenCalledTimes(1);
  });

  it('rename dialog rejects names without .yaml/.yml', async () => {
    const user = userEvent.setup();
    await setup([artifact({})]);
    await user.click(
      await screen.findByRole('button', { name: 'Actions for mine.yaml' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: /rename/i }));
    const input = await screen.findByLabelText('Template name');
    await user.clear(input);
    await user.type(input, 'bad.txt');
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    expect(await screen.findByText(/must end in \.yaml or \.yml/i)).toBeInTheDocument();
    expect(rename).not.toHaveBeenCalled();
  });

  it('delete asks for confirmation then calls artifact remove', async () => {
    const user = userEvent.setup();
    await setup([artifact({})]);
    await user.click(
      await screen.findByRole('button', { name: 'Actions for mine.yaml' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }));
    expect(remove).not.toHaveBeenCalled();
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(remove).toHaveBeenCalledWith({ id: 'a1' }, expect.anything());
  });

  it('shared rows menu offers Download only', async () => {
    const user = userEvent.setup();
    await setup(
      [],
      [artifact({ id: 's1', name: 'theirs.yaml', isOwner: false })],
    );
    await user.click(
      await screen.findByRole('button', { name: 'Actions for theirs.yaml' }),
    );
    expect(
      await screen.findByRole('menuitem', { name: 'Download' }),
    ).toBeInTheDocument();
    for (const n of ['Rename', 'Share', 'Delete']) {
      expect(screen.queryByRole('menuitem', { name: n })).not.toBeInTheDocument();
    }
  });

  it('without artifact.write own row menu shows Download only', async () => {
    canWrite = false;
    const user = userEvent.setup();
    await setup([artifact({})]);
    await user.click(
      await screen.findByRole('button', { name: 'Actions for mine.yaml' }),
    );
    expect(
      await screen.findByRole('menuitem', { name: 'Download' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Rename' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('rename success syncs the open tab name', async () => {
    const user = userEvent.setup();
    rename.mockImplementation((_v, o) => o.onSuccess());
    await setup([artifact({})]);
    await user.click(
      await screen.findByRole('button', { name: 'Actions for mine.yaml' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: /rename/i }));
    const input = await screen.findByLabelText('Template name');
    await user.clear(input);
    await user.type(input, 'new.yaml');
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    expect(renameTab).toHaveBeenCalledWith('a1', 'new.yaml');
  });

  it('shows an error state with retry when the list fails', async () => {
    await setup([], [], { isError: true });
    expect(await screen.findAllByRole('button', { name: /retry/i })).not.toHaveLength(0);
    expect(screen.queryByText(/no templates yet/i)).not.toBeInTheDocument();
  });

});
