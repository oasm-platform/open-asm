import { SidebarProvider } from '@/components/ui/sidebar';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TemplatesSidebar } from './templates-sidebar';

const createAsync = vi.fn();
const rename = vi.fn();
const remove = vi.fn();

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true }),
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

async function setup(mine: unknown[], shared: unknown[] = []) {
  const { useTemplatesControllerGetMany } = await import(
    '@/services/apis/gen/queries'
  );
  vi.mocked(useTemplatesControllerGetMany).mockImplementation(((
    params: { scope?: string } | undefined,
  ) => ({
    data: { data: params?.scope === 'shared' ? shared : mine },
    isLoading: false,
    refetch: vi.fn(),
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
    rename.mockClear();
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

  it('shared section has no rename/delete actions', async () => {
    await setup(
      [],
      [artifact({ id: 's1', name: 'theirs.yaml', isOwner: false })],
    );
    await screen.findByText('theirs.yaml');
    expect(
      screen.queryByRole('button', { name: /actions for/i }),
    ).not.toBeInTheDocument();
  });
});
