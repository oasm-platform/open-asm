import { BeforeHook, Hook } from '@/common/decorators/app.decorator';
import { Injectable } from '@nestjs/common';
import { APIError } from 'better-auth/api';
import { SystemConfigsService } from './system-configs.service';

/**
 * Gates public sign-up on the `auth.allowSignUp` system setting. Only HTTP
 * calls carry a request, so the server-side first-admin bootstrap
 * (`auth.api.signUpEmail` in AdminService) always gets through.
 */
@Hook()
@Injectable()
export class SignUpHook {
  constructor(private readonly systemConfigsService: SystemConfigsService) {}

  @BeforeHook('/sign-up/email')
  async gateSignUp(ctx: { request?: Request }): Promise<void> {
    if (!ctx.request) return;
    if (await this.systemConfigsService.isSignUpAllowed()) return;

    // APIError is an Error at runtime and what better-auth expects a hook to
    // throw; its better-call typing hides that from the lint rule
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw new APIError('FORBIDDEN', { message: 'Sign-up is disabled' });
  }
}
