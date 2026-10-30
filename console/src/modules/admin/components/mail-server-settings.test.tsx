import type { MailServerSettingsDto } from '@/services/apis/gen/queries';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MailServerSettings from './mail-server-settings';

// jsdom has no ResizeObserver, which Radix measures form controls with, nor
// the pointer capture and scrolling Radix Select uses when it opens.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.scrollIntoView ??= () => {};

const { updateSettings, sendTestMail } = vi.hoisted(() => ({
  updateSettings: vi.fn(),
  sendTestMail: vi.fn(),
}));

vi.mock('@/utils/authClient', () => ({
  useSession: () => ({ data: { user: { email: 'admin@example.com' } } }),
}));

vi.mock('@/services/apis/gen/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/apis/gen/queries')>()),
  useSystemConfigsControllerGetSettings: vi.fn(),
  useSystemConfigsControllerUpdateSettings: () => ({
    mutate: updateSettings,
    isPending: false,
  }),
  useSystemConfigsControllerSendTestMail: () => ({
    mutate: sendTestMail,
    isPending: false,
  }),
}));

const savedServer: MailServerSettingsDto = {
  enabled: true,
  provider: 'smtp',
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  username: 'mailer',
  hasPassword: true,
  fromEmail: 'no-reply@example.com',
  fromName: '',
};

async function setup(mailServer: MailServerSettingsDto = savedServer) {
  const { useSystemConfigsControllerGetSettings } = await import(
    '@/services/apis/gen/queries'
  );
  vi.mocked(useSystemConfigsControllerGetSettings).mockReturnValue({
    data: { mailServer },
    isLoading: false,
  } as unknown as ReturnType<typeof useSystemConfigsControllerGetSettings>);
  return renderWithProviders(<MailServerSettings />);
}

describe('MailServerSettings', () => {
  beforeEach(() => {
    updateSettings.mockReset();
    sendTestMail.mockReset();
  });

  it('shows the saved settings and keeps the password hidden', async () => {
    await setup();

    expect(await screen.findByLabelText('Host')).toHaveValue('smtp.example.com');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.getByLabelText('Password')).toHaveAttribute(
      'placeholder',
      'Saved; leave empty to keep it',
    );
  });

  it('fills a provider preset and saves without resending the password', async () => {
    const { user } = await setup();

    await user.click(await screen.findByRole('combobox', { name: 'Provider' }));
    await user.click(await screen.findByRole('option', { name: 'Resend' }));

    expect(screen.getByLabelText('Host')).toHaveValue('smtp.resend.com');
    expect(screen.getByLabelText('Port')).toHaveValue('465');
    expect(screen.getByLabelText('Username')).toHaveValue('resend');
    expect(screen.getByLabelText('API key')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith(
        {
          data: {
            mailServer: expect.objectContaining({
              provider: 'resend',
              host: 'smtp.resend.com',
              port: 465,
              secure: true,
              username: 'resend',
              password: undefined,
            }) as unknown,
          },
        },
        expect.anything(),
      );
    });
  });

  it('will not turn the server on without a host and sender', async () => {
    const { user } = await setup({
      ...savedServer,
      enabled: false,
      host: '',
      fromEmail: '',
    });

    await user.click(
      await screen.findByRole('switch', { name: /Turn on mail server/ }),
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findAllByText('Required to turn on the mail server'),
    ).toHaveLength(2);
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('sends a test email to the signed-in admin by default', async () => {
    const { user } = await setup();

    await user.click(
      await screen.findByRole('button', { name: /Send test email/ }),
    );

    expect(sendTestMail).toHaveBeenCalledWith(
      { data: { to: 'admin@example.com' } },
      expect.anything(),
    );
  });

  it('holds the test email back while the server is off', async () => {
    await setup({ ...savedServer, enabled: false });

    expect(
      await screen.findByRole('button', { name: /Send test email/ }),
    ).toBeDisabled();
  });
});
