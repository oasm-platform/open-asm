import { NotFoundError } from '@/common/errors/domain.errors';
import type { WorkspaceEncryptionService } from '@/services/workspace-encryption/workspace-encryption.service';
import type { Repository } from 'typeorm';
import type { Integration } from './entities/integration.entity';
import { IntegrationConfigReader } from './integration-config.reader';

jest.mock('./validators/integration.validator', () => ({
  decryptSensitiveConfigFields: jest.fn(
    (config: Record<string, unknown>, dek: Buffer | null) => ({
      ...config,
      apiToken: `plain(${String(config.apiToken)})`,
      dek: dek?.toString(),
    }),
  ),
}));

describe('IntegrationConfigReader', () => {
  const integration = {
    id: 'int-1',
    workspaceId: 'ws-1',
    config: { apiToken: 'cipher', team: 'oasm' },
  } as unknown as Integration;
  let repo: { findOne: jest.Mock };
  let encryption: { getDEK: jest.Mock };
  let reader: IntegrationConfigReader;

  beforeEach(() => {
    repo = { findOne: jest.fn().mockResolvedValue(integration) };
    encryption = { getDEK: jest.fn().mockResolvedValue(Buffer.from('dek')) };
    reader = new IntegrationConfigReader(
      repo as unknown as Repository<Integration>,
      encryption as unknown as WorkspaceEncryptionService,
    );
  });

  it('returns the integration with its config decrypted under the workspace key', async () => {
    const result = await reader.getIntegrationWithDecryptedConfig('int-1', 'ws-1');

    expect(repo.findOne).toHaveBeenCalledWith({
      where: { id: 'int-1', workspaceId: 'ws-1' },
    });
    expect(encryption.getDEK).toHaveBeenCalledWith('ws-1');
    expect(result).toEqual({
      integration,
      decryptedConfig: { apiToken: 'plain(cipher)', team: 'oasm', dek: 'dek' },
    });
  });

  it('refuses an integration outside the workspace as not found', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(
      reader.getIntegrationWithDecryptedConfig('int-1', 'other-ws'),
    ).rejects.toThrow(new NotFoundError('Integration not found'));
    expect(encryption.getDEK).not.toHaveBeenCalled();
  });
});
