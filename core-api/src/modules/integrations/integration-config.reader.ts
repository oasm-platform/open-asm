import { NotFoundError } from '@/common/errors/domain.errors';
import { WorkspaceEncryptionService } from '@/services/workspace-encryption/workspace-encryption.service';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Integration } from './entities/integration.entity';
import { decryptSensitiveConfigFields } from './validators/integration.validator';

/**
 * Loads an integration of a workspace with its secrets decrypted. Shared by
 * `IntegrationsService` and `IntegrationSyncService`, which used to reach
 * each other for it (a `forwardRef` cycle).
 */
@Injectable()
export class IntegrationConfigReader {
  constructor(
    @InjectRepository(Integration)
    private readonly integrationRepository: Repository<Integration>,
    private readonly workspaceEncryption: WorkspaceEncryptionService,
  ) {}

  /** Throws `NotFoundError` when the integration is not in this workspace. */
  async getIntegrationWithDecryptedConfig(
    id: string,
    workspaceId: string,
  ): Promise<{ integration: Integration; decryptedConfig: Record<string, unknown> }> {
    const integration = await this.integrationRepository.findOne({
      where: { id, workspaceId },
    });
    if (!integration) {
      throw new NotFoundError('Integration not found');
    }
    const dek = await this.workspaceEncryption.getDEK(workspaceId);
    return {
      integration,
      decryptedConfig: decryptSensitiveConfigFields(integration.config, dek),
    };
  }
}
