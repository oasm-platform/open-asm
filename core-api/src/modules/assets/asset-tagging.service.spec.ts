import { InvalidInputError, NotFoundError } from '@/common/errors/domain.errors';
import type { WorkspaceEncryptionService } from '@/services/workspace-encryption/workspace-encryption.service';
import type { Repository } from 'typeorm';
import { findDefaultLLMConfig } from '../agents/agents.config';
import type { AgentConfig } from '../agents/entities/agent-config.entity';
import type { AgentLLMConfig } from '../agents/entities/agent-llm-config.entity';
import type { AssetQueryService } from './asset-query.service';
import { AssetTaggingService } from './asset-tagging.service';
import type { AssetService } from './entities/asset-services.entity';

jest.mock('../agents/agents.config', () => ({
  findDefaultLLMConfig: jest.fn(),
}));

describe('AssetTaggingService', () => {
  let qb: { getOne: jest.Mock } & Record<string, jest.Mock>;
  let assetQuery: {
    getTechStringsForHttpResponse: jest.Mock;
    getTlsForHttpResponse: jest.Mock;
  };
  let service: AssetTaggingService;

  beforeEach(() => {
    qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    };
    assetQuery = {
      getTechStringsForHttpResponse: jest.fn().mockResolvedValue([]),
      getTlsForHttpResponse: jest.fn().mockResolvedValue(null),
    };
    (findDefaultLLMConfig as jest.Mock).mockReset();
    service = new AssetTaggingService(
      { createQueryBuilder: jest.fn().mockReturnValue(qb) } as unknown as Repository<AssetService>,
      {} as Repository<AgentLLMConfig>,
      {} as Repository<AgentConfig>,
      {} as WorkspaceEncryptionService,
      assetQuery as unknown as AssetQueryService,
    );
  });

  it('looks the service up inside the workspace and 404s otherwise', async () => {
    qb.getOne.mockResolvedValue(null);

    await expect(service.generateServiceTags('svc-1', 'ws-1', 'u-1')).rejects.toThrow(
      new NotFoundError('Asset service not found'),
    );
    expect(qb.andWhere).toHaveBeenCalledWith('target.workspaceId = :workspaceId', {
      workspaceId: 'ws-1',
    });
    expect(findDefaultLLMConfig).not.toHaveBeenCalled();
  });

  it('refuses when no LLM provider is connected', async () => {
    qb.getOne.mockResolvedValue({ value: 'https', port: 443, asset: { value: 'a.example' } });
    (findDefaultLLMConfig as jest.Mock).mockResolvedValue(null);

    await expect(service.generateServiceTags('svc-1', 'ws-1', 'u-1')).rejects.toThrow(
      new InvalidInputError('No LLM provider connected. Please connect a provider first.'),
    );
  });

  it('reads tech and TLS of the latest http response for the prompt', async () => {
    qb.getOne.mockResolvedValue({
      value: 'https',
      port: 443,
      asset: { value: 'a.example' },
      httpResponses: [{ id: 'resp-1', title: 'Home' }],
    });
    (findDefaultLLMConfig as jest.Mock).mockResolvedValue(null);

    await expect(service.generateServiceTags('svc-1', 'ws-1', 'u-1')).rejects.toThrow(
      InvalidInputError,
    );
    expect(assetQuery.getTechStringsForHttpResponse).toHaveBeenCalledWith('resp-1');
    expect(assetQuery.getTlsForHttpResponse).toHaveBeenCalledWith('resp-1');
  });
});
