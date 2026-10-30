import { SidebarProvider } from '@/components/ui/sidebar';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TemplatesSidebar } from './templates-sidebar';

const createAsync = vi.fn();
const rename = vi.fn();
const remove = vi.fn();

const openNew = vi.fn();
const renameTab = vi.fn();
let canWrite = true;

vi.mock('../hooks/use-template-tabs', async (importOriginal) => {
  const real =
    await importOriginal<typeof import('../hooks/use-template-tabs')>();
  return {
    ...real,
    useTemplateTabs: () => ({
      ...real.useTemplateTabs(),
      openNew,
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
  useTemplatesControllerCreate: () => ({ mutateAsync: createAsync }),
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
      <TemplatesSidebar />
    </SidebarProvider>,
  );
}

// jsdom's File has no text(); browsers do.
const yaml = (content: string, name: string) =>
  Object.assign(new File([content], name), { text: async () => content });

describe('TemplatesSidebar', () => {
  beforeEach(() => {
    createAsync.mockReset().mockResolvedValue({});
    rename.mockReset();
    openNew.mockClear();
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
    expect(screen.getByText('Private')).toBeInTheDocument();
    expect(screen.getByText('Shared')).toBeInTheDocument();
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

  it('always renders Shared with me, with an empty message', async () => {
    await setup([artifact({})]);
    expect(await screen.findByText('Shared with me')).toBeInTheDocument();
    expect(screen.getByText('Nothing shared with you yet')).toBeInTheDocument();
  });

  it('collapses a section from its label', async () => {
    const user = userEvent.setup();
    await setup([artifact({})]);
    await user.click(await screen.findByText('My templates'));
    await waitFor(() =>
      expect(screen.queryByText('mine.yaml')).not.toBeInTheDocument(),
    );
  });

  it('upload error names the file and keeps going', async () => {
    const { AxiosError } = await import('axios');
    const { toast } = await import('sonner');
    const spy = vi.spyOn(toast, 'error').mockImplementation(() => 1);
    const user = userEvent.setup();
    createAsync.mockRejectedValueOnce(
      new AxiosError('bad', '400', undefined, undefined, {
        status: 400,
        data: { message: 'Invalid YAML at line 3' },
      } as never),
    );
    await setup([]);
    const input = (await screen.findByLabelText('Upload templates')) as HTMLInputElement;
    await user.upload(input, [yaml('a', 'a.yaml'), yaml('id: b', 'b.yaml')]);
    await waitFor(() => expect(createAsync).toHaveBeenCalledTimes(2));
    expect(spy).toHaveBeenCalledWith('a.yaml: Invalid YAML at line 3');
    spy.mockRestore();
  });

  it('lists shared templates with owner name', async () => {
    await setup(
      [],
      [artifact({ id: 's1', name: 'theirs.yaml', isOwner: false, createdBy: { id: 'u2', name: 'Bob', image: null } })],
    );
    expect(await screen.findByText('theirs.yaml')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('empty state offers New and Upload', async () => {
    await setup([]);
    expect(
      await screen.findByRole('button', { name: /new template/i }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /upload/i }).length,
    ).toBeGreaterThan(0);
  });

  it('upload sends one create per selected .yaml file', async () => {
    const user = userEvent.setup();
    await setup([]);
    const input = (await screen.findByLabelText(
      'Upload templates',
    )) as HTMLInputElement;
    await user.upload(input, [
      yaml('id: a', 'a.yaml'),
      yaml('id: b', 'b.yml'),
    ]);
    await waitFor(() => expect(createAsync).toHaveBeenCalledTimes(2));
    expect(createAsync).toHaveBeenCalledWith({
      data: { name: 'a.yaml', content: 'id: a' },
    });
    expect(createAsync).toHaveBeenCalledWith({
      data: { name: 'b.yml', content: 'id: b' },
    });
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

  it('Ctrl+I opens a new template', async () => {
    const user = userEvent.setup();
    await setup([artifact({})]);
    await screen.findByText('mine.yaml');
    await user.keyboard('{Control>}i{/Control}');
    expect(openNew).toHaveBeenCalledTimes(1);
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

  it('stops uploading after a 409', async () => {
    const { AxiosError } = await import('axios');
    const user = userEvent.setup();
    createAsync.mockRejectedValue(
      new AxiosError('full', '409', undefined, undefined, {
        status: 409,
        data: { message: 'full' },
      } as never),
    );
    await setup([]);
    const input = (await screen.findByLabelText('Upload templates')) as HTMLInputElement;
    await user.upload(input, [yaml('a', 'a.yaml'), yaml('b', 'b.yaml')]);
    await waitFor(() => expect(createAsync).toHaveBeenCalledTimes(1));
  });
});
