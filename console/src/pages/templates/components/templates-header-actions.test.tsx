import { renderWithProviders, screen, waitFor } from '@/test/utils';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TemplatesHeaderActions } from './templates-header-actions';

const createAsync = vi.fn();
const openNew = vi.fn();
let canWrite = true;

vi.mock('../hooks/use-template-tabs', async (importOriginal) => {
  const real = await importOriginal<typeof import('../hooks/use-template-tabs')>();
  return {
    ...real,
    useTemplateTabs: () => ({ ...real.useTemplateTabs(), openNew }),
  };
});

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => canWrite }),
}));

vi.mock('@/services/apis/gen/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/apis/gen/queries')>()),
  useTemplatesControllerCreate: () => ({ mutateAsync: createAsync }),
}));

// jsdom's File has no text(); browsers do.
const yaml = (content: string, name: string) =>
  Object.assign(new File([content], name), { text: async () => content });

const setup = () => renderWithProviders(<TemplatesHeaderActions />);

describe('TemplatesHeaderActions', () => {
  beforeEach(() => {
    createAsync.mockReset().mockResolvedValue({});
    openNew.mockClear();
    canWrite = true;
  });

  it('offers AI gen, Upload and New', async () => {
    setup();
    expect(await screen.findByRole('link', { name: /AI gen/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upload/i })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: /new/i }));
    expect(openNew).toHaveBeenCalledTimes(1);
  });

  it('hides Upload and New without artifact.write', async () => {
    canWrite = false;
    setup();
    await waitFor(() => expect(screen.queryByRole('button', { name: /new/i })).toBeNull());
    expect(screen.queryByRole('button', { name: /upload/i })).toBeNull();
  });

  it('Ctrl+I opens a new template', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByRole('button', { name: /new/i });
    await user.keyboard('{Control>}i{/Control}');
    expect(openNew).toHaveBeenCalledTimes(1);
  });

  it('upload sends one create per selected .yaml file', async () => {
    const user = userEvent.setup();
    setup();
    const input = (await screen.findByLabelText('Upload templates')) as HTMLInputElement;
    await user.upload(input, [yaml('id: a', 'a.yaml'), yaml('id: b', 'b.yml')]);
    await waitFor(() => expect(createAsync).toHaveBeenCalledTimes(2));
    expect(createAsync).toHaveBeenCalledWith({ data: { name: 'a.yaml', content: 'id: a' } });
    expect(createAsync).toHaveBeenCalledWith({ data: { name: 'b.yml', content: 'id: b' } });
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
    setup();
    const input = (await screen.findByLabelText('Upload templates')) as HTMLInputElement;
    await user.upload(input, [yaml('a', 'a.yaml'), yaml('id: b', 'b.yaml')]);
    await waitFor(() => expect(createAsync).toHaveBeenCalledTimes(2));
    expect(spy).toHaveBeenCalledWith('a.yaml: Invalid YAML at line 3');
    spy.mockRestore();
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
    setup();
    const input = (await screen.findByLabelText('Upload templates')) as HTMLInputElement;
    await user.upload(input, [yaml('a', 'a.yaml'), yaml('b', 'b.yaml')]);
    await waitFor(() => expect(createAsync).toHaveBeenCalledTimes(1));
  });
});
