import { renderWithProviders, screen, waitFor } from '@/test/utils';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTemplateTabs } from '../hooks/use-template-tabs';
import { TemplateEditor } from './template-editor';

const saveAsync = vi.fn();
const createAsync = vi.fn();
let canWrite = true;
let contentResult: { artifact: unknown; content: string } | undefined;

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => canWrite }),
}));

vi.mock('@uiw/react-codemirror', () => ({
  default: ({
    value,
    onChange,
    readOnly,
  }: {
    value: string;
    onChange: (v: string) => void;
    readOnly?: boolean;
  }) => (
    <textarea
      aria-label="Template content"
      value={value}
      readOnly={readOnly}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock('@/services/apis/gen/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/apis/gen/queries')>()),
  useTemplatesControllerGetContent: () => ({
    data: contentResult,
    isLoading: !contentResult,
  }),
  useTemplatesControllerSaveContent: () => ({ mutateAsync: saveAsync }),
  useTemplatesControllerCreate: () => ({ mutateAsync: createAsync }),
}));

const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: (...a: unknown[]) => toastError(...a),
    success: vi.fn(),
    loading: vi.fn(),
    warning: vi.fn(),
  }),
}));

const artifact = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  name: 'mine.yaml',
  createdBy: { id: 'u1', name: 'Alice', image: null },
  isOwner: true,
  ...over,
});

type Api = ReturnType<typeof useTemplateTabs>;
function Seed({ init }: { init: (api: Api) => void }) {
  const api = useTemplateTabs();
  useEffect(() => {
    // The global-state query resolves its initial value async and would
    // overwrite a synchronous seed, so wait a tick.
    const t = setTimeout(() => init(api), 20);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function setup(init: (api: Api) => void) {
  return renderWithProviders(
    <>
      <Seed init={init} />
      <TemplateEditor />
    </>,
  );
}

const openSaved = (readOnly = false) => (api: Api) =>
  api.open(artifact() as never, readOnly);

const axiosError = (status: number, data: Record<string, unknown>) =>
  new AxiosError('x', undefined, undefined, undefined, {
    status,
    data,
  } as never);

const box = () =>
  screen.findByLabelText('Template content') as Promise<HTMLTextAreaElement>;

describe('TemplateEditor', () => {
  beforeEach(() => {
    saveAsync.mockReset();
    createAsync.mockReset();
    toastError.mockClear();
    canWrite = true;
    contentResult = { artifact: artifact(), content: 'id: one' };
  });

  it('loads content when a template opens', async () => {
    setup(openSaved());
    await waitFor(async () => expect((await box()).value).toBe('id: one'));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('save on Ctrl+S calls saveContent and clears dirty', async () => {
    const user = userEvent.setup();
    saveAsync.mockResolvedValue(artifact());
    setup(openSaved());
    await waitFor(async () => expect((await box()).value).toBe('id: one'));
    await user.type(await box(), '2');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    await user.keyboard('{Control>}s{/Control}');
    await waitFor(() =>
      expect(saveAsync).toHaveBeenCalledWith({
        id: 'a1',
        data: { content: 'id: one2' },
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled(),
    );
  });

  it('first save of a new tab calls create then binds artifactId', async () => {
    const user = userEvent.setup();
    createAsync.mockResolvedValue(artifact({ id: 'n1', name: 'example-template.yaml' }));
    setup((api) => api.openNew());
    await box();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(createAsync).toHaveBeenCalledWith({
        data: {
          name: 'example-template.yaml',
          content: expect.stringContaining('id: example-template'),
        },
      }),
    );
    expect(saveAsync).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled(),
    );
  });

  it('read-only tab disables save', async () => {
    contentResult = {
      artifact: artifact({ isOwner: false, createdBy: { id: 'u2', name: 'Bob', image: null } }),
      content: 'id: one',
    };
    setup(openSaved(true));
    expect(await screen.findByText('Shared by Bob · read-only')).toBeInTheDocument();
    expect(await box()).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('without artifact.write every tab is read-only', async () => {
    canWrite = false;
    setup(openSaved());
    expect(await box()).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('keeps draft on 409', async () => {
    const user = userEvent.setup();
    saveAsync.mockRejectedValue(
      axiosError(409, { message: 'Workspace storage is full' }),
    );
    setup(openSaved());
    await waitFor(async () => expect((await box()).value).toBe('id: one'));
    await user.type(await box(), '2');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError.mock.calls[0][0]).toBe('Workspace storage is full');
    expect((await box()).value).toBe('id: one2');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('shows server YAML error with line', async () => {
    const user = userEvent.setup();
    saveAsync.mockRejectedValue(
      axiosError(400, { message: 'Invalid YAML at line 3: bad indent' }),
    );
    setup(openSaved());
    await waitFor(async () => expect((await box()).value).toBe('id: one'));
    await user.type(await box(), '2');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('line 3');
  });

  it('confirms before closing a dirty tab', async () => {
    const user = userEvent.setup();
    setup(openSaved());
    await waitFor(async () => expect((await box()).value).toBe('id: one'));
    await user.type(await box(), '2');
    await user.click(screen.getByRole('button', { name: 'Close mine.yaml' }));
    expect(await screen.findByText('Discard unsaved changes?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Close mine.yaml' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close mine.yaml' }));
    await user.click(await screen.findByRole('button', { name: 'Discard' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Close mine.yaml' })).not.toBeInTheDocument(),
    );
  });

  it('Format runs prettier yaml', async () => {
    const user = userEvent.setup();
    contentResult = { artifact: artifact(), content: 'id:    one\nlist:\n    - a' };
    setup(openSaved());
    await waitFor(async () => expect((await box()).value).toContain('id:    one'));
    await user.click(screen.getByRole('button', { name: 'Format' }));
    await waitFor(async () =>
      expect((await box()).value).toBe('id: one\nlist:\n  - a\n'),
    );
  });
});
