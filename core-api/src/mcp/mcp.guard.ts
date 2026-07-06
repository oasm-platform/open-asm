import { MCP_API_KEY_HEADER } from '@/common/constants/app.constants';
import { ApiKeyType } from '@/common/enums/enum';
import { RequestWithMetadata } from '@/common/interfaces/app.interface';
import { ApiKeysService } from '@/modules/apikeys/apikeys.service';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class McpGuard implements CanActivate {
  constructor(private readonly apiKeyService: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithMetadata>();
    const apiKey = request.headers[MCP_API_KEY_HEADER] as string | undefined;

    if (!apiKey) {
      throw new UnauthorizedException('Missing workspace API key header');
    }

    try {
      const keyEntity = await this.apiKeyService.findByKey(apiKey);
      if (!keyEntity?.ref || keyEntity.type !== ApiKeyType.WORKSPACE) {
        throw new UnauthorizedException('Invalid workspace API key');
      }

      request.workspaceId = keyEntity.ref;
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid workspace API key');
    }
  }
}
