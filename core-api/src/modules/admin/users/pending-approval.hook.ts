import { PENDING_APPROVAL_REASON } from '@/common/constants/app.constants';
import {
  AfterHook,
  BeforeHook,
  Hook,
} from '@/common/decorators/app.decorator';
import { User } from '@/modules/auth/entities/user.entity';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { APIError, isAPIError } from 'better-auth/api';
import { Repository } from 'typeorm';
import { SystemConfigsService } from '../system-configs/system-configs.service';

const EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED';

/**
 * Public sign-ups start banned with PENDING_APPROVAL_REASON (auth.ts). While
 * the mail server is on, such an account has to confirm its email before an
 * admin can approve (unban) it, and signing in to it says so instead of the
 * generic "not active" message.
 */
@Hook()
@Injectable()
export class PendingApprovalHook {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly systemConfigsService: SystemConfigsService,
  ) {}

  @BeforeHook('/admin/unban-user')
  async requireVerifiedEmail(ctx: {
    body?: { userId?: unknown };
  }): Promise<void> {
    const userId = ctx.body?.userId;
    if (typeof userId !== 'string') return;
    if (!(await this.isUnverifiedSignUp({ id: userId }))) return;

    // APIError is an Error at runtime and what better-auth expects a hook to
    // throw; its better-call typing hides that from the lint rule
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw new APIError('FORBIDDEN', {
      message: "This user hasn't verified their email yet",
      code: EMAIL_NOT_VERIFIED,
    });
  }

  /**
   * Runs after the password check: better-auth only reports a ban for the
   * right password, so this tells nothing to someone guessing.
   */
  @AfterHook('/sign-in/email')
  async explainUnverifiedSignIn(ctx: {
    body?: { email?: unknown };
    context: { returned?: unknown };
  }): Promise<void> {
    const { returned } = ctx.context;
    if (!isAPIError(returned)) return;
    // Typed through better-call, which lint can't resolve
    const { code } = (returned as { body?: { code?: unknown } }).body ?? {};
    if (code !== 'BANNED_USER') return;
    const email = ctx.body?.email;
    if (typeof email !== 'string') return;
    if (!(await this.isUnverifiedSignUp({ email: email.toLowerCase() }))) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw new APIError('FORBIDDEN', {
      message:
        'Verify your email address first. Check your inbox for the link we sent.',
      code: EMAIL_NOT_VERIFIED,
    });
  }

  /** A pending sign-up that has not confirmed its email, while mail is on */
  private async isUnverifiedSignUp(
    where: { id: string } | { email: string },
  ): Promise<boolean> {
    const user = await this.usersRepository.findOneBy(where);
    if (
      !user?.banned ||
      user.banReason !== PENDING_APPROVAL_REASON ||
      user.emailVerified
    ) {
      return false;
    }
    // Without a mail server the link can't be sent; the admin decides alone
    const { enabled } = await this.systemConfigsService.getMailServer();
    return enabled;
  }
}
