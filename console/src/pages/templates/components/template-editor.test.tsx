import { renderWithProviders, screen, waitFor } from '@/test/utils';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { useEffect, useState } from 'react';
import { getTemplatesControllerGetContentQueryKey } from '@/services/apis/gen/queries';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTemplateTabs } from '../hooks/use-template-tabs';
import { TemplateEditor } from './template-editor';

const saveAsync = vi.fn();
const createAsync = vi.fn();
let canWrite = true;
let contentResult: { artifact: unknown; content: string } | undefined;
let contentError = false;
// When set, the hook first serves this cached copy (not fetched yet), then contentResult.
let staleResult: { artifact: unknown; content: string } | undefined;
const refetch = vi.fn();
let saveOpts: { mutation?: { onError?: () => void } } | undefined;
let blocker: { status: string; proceed: () => void; reset: () => void } = {
  status: 'idle',
  proceed: vi.fn(),
  reset: vi.fn(),
};
let blockerArgs: { shouldBlockFn: () => boolean } | undefined;

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useBlocker: (args: { shouldBlockFn: () => boolean }) => {
    blockerArgs = args;
    return blocker;
  },
}));

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
  useTemplatesControllerGetContent: () => {
    const [fresh, setFresh] = useState(!staleResult);
    useEffect(() => {
      if (!staleResult) return;
      const t = setTimeout(() => setFresh(true), 80);
      return () => clearTimeout(t);
    }, []);
    const data = fresh ? contentResult : staleResult;
    return {
      data: contentError ? undefined : data,
      isLoading: !data && !contentError,
      isError: contentError,
      isFetchedAfterMount: fresh,
      refetch,
    };
  },
  useTemplatesControllerSaveContent: (o: typeof saveOpts) => {
    saveOpts = o;
    return { mutateAsync: saveAsync };
  },
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
    contentError = false;
    staleResult = undefined;
    refetch.mockClear();
    saveOpts = undefined;
    blocker = { status: 'idle', proceed: vi.fn(), reset: vi.fn() };
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

  it('does not seed a new tab from a stale cached copy', async () => {
    staleResult = { artifact: artifact(), content: 'id: old' };
    contentResult = { artifact: artifact(), content: 'id: new' };
    setup(openSaved());
    await waitFor(async () => expect((await box()).value).toBe('id: new'));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('save and create write the new content into the content cache', async () => {
    const user = userEvent.setup();
    saveAsync.mockResolvedValue(artifact());
    const { queryClient } = setup(openSaved());
    // gcTime is 0 and the hook is mocked, so observe the write instead of the cache.
    const spy = vi.spyOn(queryClient, 'setQueryData');
    await waitFor(async () => expect((await box()).value).toBe('id: one'));
    await user.type(await box(), '2');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith(
        getTemplatesControllerGetContentQueryKey('a1'),
        { artifact: artifact(), content: 'id: one2' },
      ),
    );
  });

  it('keeps text typed while a save is in flight', async () => {
    const user = userEvent.setup();
    let resolve!: (a: unknown) => void;
    saveAsync.mockReturnValue(new Promise((r) => (resolve = r)));
    setup(openSaved());
    await waitFor(async () => expect((await box()).value).toBe('id: one'));
    await user.type(await box(), '2');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.type(await box(), '3');
    resolve(artifact());
    await waitFor(async () => expect((await box()).value).toBe('id: one23'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled(),
    );
  });

  it('shows an error with Retry when the content fails to load', async () => {
    const user = userEvent.setup();
    contentError = true;
    setup(openSaved());
    await user.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
    expect(screen.queryByLabelText('Template content')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('blocks in-app navigation while a tab is dirty and confirms', async () => {
    const user = userEvent.setup();
    blocker = { status: 'blocked', proceed: vi.fn(), reset: vi.fn() };
    setup((api) => api.openNew());
    await box();
    expect(blockerArgs?.shouldBlockFn()).toBe(true);
    expect(await screen.findByText('Discard unsaved changes?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(blocker.proceed).toHaveBeenCalled();
  });

  it('suppresses the global mutation toast so a 409 toasts once', async () => {
    const user = userEvent.setup();
    saveAsync.mockRejectedValue(axiosError(409, { message: 'full' }));
    setup(openSaved());
    await waitFor(async () => expect((await box()).value).toBe('id: one'));
    await user.type(await box(), '2');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(saveOpts?.mutation?.onError).toBeTypeOf('function');
  });
});
