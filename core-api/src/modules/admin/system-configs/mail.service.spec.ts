import { encrypt } from '@/common/utils/encryption.util';
import { BadRequestException } from '@nestjs/common';
import type { Auth } from 'better-auth';
import { createTransport } from 'nodemailer';
import { MailProvider } from './dto/system-configs.dto';
import { MailService } from './mail.service';
import type {
  MailServerConfig,
  SystemConfigsService,
} from './system-configs.service';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

type VerificationSender = (
  data: { user: { id: string; name: string; email: string }; url: string },
  request?: Request,
) => Promise<void>;

const server = (
  overrides: Partial<MailServerConfig> = {},
): MailServerConfig => ({
  enabled: true,
  provider: MailProvider.RESEND,
  host: 'smtp.resend.com',
  port: 465,
  secure: true,
  username: 'resend',
  password: encrypt('re_key'),
  fromEmail: 'no-reply@example.com',
  fromName: '',
  ...overrides,
});

describe('MailService', () => {
  let sendMail: jest.Mock;
  let getMailServer: jest.Mock;
  let emailVerification: { sendVerificationEmail?: VerificationSender };
  let service: MailService;

  beforeEach(() => {
    sendMail = jest.fn().mockResolvedValue({});
    (createTransport as jest.Mock).mockReset().mockReturnValue({ sendMail });
    getMailServer = jest.fn().mockResolvedValue(server());
    emailVerification = {};
    service = new MailService(
      {
        getMailServer,
        getConfig: jest.fn().mockResolvedValue({ name: 'OASM' }),
      } as unknown as SystemConfigsService,
      { options: { emailVerification } } as unknown as Auth,
    );
  });

  describe('send', () => {
    it('sends through the saved server with the decrypted password', async () => {
      await service.send({
        to: 'ada@example.com',
        subject: 'Hi',
        text: 'Hello',
      });

      expect(createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.resend.com',
          port: 465,
          secure: true,
          auth: { user: 'resend', pass: 're_key' },
        }),
      );
      expect(sendMail).toHaveBeenCalledWith({
        from: { name: 'OASM', address: 'no-reply@example.com' },
        to: 'ada@example.com',
        subject: 'Hi',
        text: 'Hello',
      });
    });

    it('prefers the configured sender name over the system name', async () => {
      getMailServer.mockResolvedValue(server({ fromName: 'Security team' }));

      await service.send({
        to: 'ada@example.com',
        subject: 'Hi',
        text: 'Hello',
      });

      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: { name: 'Security team', address: 'no-reply@example.com' },
        }),
      );
    });

    it('sends without login when no username is set', async () => {
      getMailServer.mockResolvedValue(server({ username: '' }));

      await service.send({
        to: 'ada@example.com',
        subject: 'Hi',
        text: 'Hello',
      });

      expect(createTransport).toHaveBeenCalledWith(
        expect.objectContaining({ auth: undefined }),
      );
    });

    it('refuses while the mail server is off', async () => {
      getMailServer.mockResolvedValue(server({ enabled: false }));

      await expect(
        service.send({ to: 'ada@example.com', subject: 'Hi', text: 'Hello' }),
      ).rejects.toThrow('The mail server is turned off');
      expect(createTransport).not.toHaveBeenCalled();
    });
  });

  describe('sendTest', () => {
    it('reports success', async () => {
      await expect(service.sendTest('admin@example.com')).resolves.toEqual({
        message: 'Test email sent',
      });
    });

    it("turns the server's refusal into a 400 with its reason", async () => {
      sendMail.mockRejectedValue(
        new Error('Invalid login: 535 Bad credentials'),
      );

      const result = service.sendTest('admin@example.com');

      await expect(result).rejects.toBeInstanceOf(BadRequestException);
      await expect(result).rejects.toThrow(
        'Test email failed: Invalid login: 535 Bad credentials',
      );
    });
  });

  describe('verification email', () => {
    const user = { id: 'user-1', name: 'Ada <b>', email: 'ada@example.com' };
    const url = 'https://app.example.com/api/auth/verify-email?token=t';
    const sender = () => {
      service.onModuleInit();
      return emailVerification.sendVerificationEmail as VerificationSender;
    };

    it('mails the link for a sign-up made over HTTP', async () => {
      await sender()({ user, url }, new Request('https://app.example.com'));

      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'ada@example.com',
          subject: 'Verify your email for OASM',
          text: expect.stringContaining(url) as string,
          html: expect.stringContaining('Ada &lt;b&gt;') as string,
        }),
      );
    });

    it('sends nothing for a server-side sign-up', async () => {
      await sender()({ user, url });

      expect(sendMail).not.toHaveBeenCalled();
    });

    it('does not fail the sign-up when the mail server refuses', async () => {
      sendMail.mockRejectedValue(new Error('connection refused'));

      await expect(
        sender()({ user, url }, new Request('https://app.example.com')),
      ).resolves.toBeUndefined();
    });
  });
});
