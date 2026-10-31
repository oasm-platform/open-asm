import { AUTH_INSTANCE_KEY } from '@/common/constants/app.constants';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { decrypt } from '@/common/utils/encryption.util';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import type { Auth } from 'better-auth';
import { createTransport } from 'nodemailer';
import { SystemConfigsService } from './system-configs.service';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ] ?? char,
  );

/**
 * Sends mail through the server an admin set up in system settings
 * (`settings.mailServer`). The settings are read on every send, so a change
 * applies at once. Also gives better-auth its verification-email sender.
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly systemConfigsService: SystemConfigsService,
    @Inject(AUTH_INSTANCE_KEY)
    private readonly auth: Auth,
  ) {}

  onModuleInit() {
    // Set on the object auth.ts declares: better-auth shares it and reads the
    // sender on every call. Only HTTP calls carry a request, so server-side
    // sign-ups (the first-admin bootstrap) get no email.
    const { emailVerification } = this.auth.options;
    if (!emailVerification) return;
    emailVerification.sendVerificationEmail = ({ user, url }, request) =>
      request ? this.sendVerificationEmail(user, url) : Promise.resolve();
  }

  /** Sends one message; throws when the mail server is off or refuses it */
  async send(message: MailMessage): Promise<void> {
    const server = await this.systemConfigsService.getMailServer();
    if (!server.enabled) throw new Error('The mail server is turned off');

    const transport = createTransport({
      host: server.host,
      port: server.port,
      secure: server.secure,
      auth: server.username
        ? {
            user: server.username,
            pass: server.password ? decrypt(server.password) : '',
          }
        : undefined,
      // Fail fast on a wrong host instead of nodemailer's two-minute default
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    const fromName =
      server.fromName || (await this.systemConfigsService.getConfig()).name;

    await transport.sendMail({
      from: { name: fromName, address: server.fromEmail },
      ...message,
    });
  }

  /** Sends a test message; a failure becomes a 400 with the server's reason */
  async sendTest(to: string): Promise<DefaultMessageResponseDto> {
    const { name } = await this.systemConfigsService.getConfig();
    try {
      await this.send({
        to,
        subject: `Test email from ${name}`,
        text: `Your mail server is set up correctly. ${name} can send email.`,
      });
    } catch (error) {
      throw new BadRequestException(
        `Test email failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
    return { message: 'Test email sent' };
  }

  /**
   * Logged, not thrown: the account exists either way, and the sign-in page
   * offers to send the link again.
   */
  private async sendVerificationEmail(
    user: { id: string; name: string; email: string },
    url: string,
  ): Promise<void> {
    try {
      const { name } = await this.systemConfigsService.getConfig();
      await this.send({
        to: user.email,
        subject: `Verify your email for ${name}`,
        text: [
          `Hi ${user.name},`,
          '',
          `Confirm your email address to finish signing up for ${name}:`,
          url,
          '',
          'The link expires in 24 hours. Once you confirm, an administrator approves your account before you can sign in.',
          '',
          "If you didn't sign up, you can ignore this email.",
        ].join('\n'),
        html: [
          `<p>Hi ${escapeHtml(user.name)},</p>`,
          `<p>Confirm your email address to finish signing up for ${escapeHtml(name)}:</p>`,
          `<p><a href="${escapeHtml(url)}">Verify email</a></p>`,
          '<p>The link expires in 24 hours. Once you confirm, an administrator approves your account before you can sign in.</p>',
          "<p>If you didn't sign up, you can ignore this email.</p>",
        ].join('\n'),
      });
    } catch (error) {
      this.logger.error(
        `Failed to send the verification email for user ${user.id}`,
        error instanceof Error ? error.stack : error,
      );
    }
  }
}
