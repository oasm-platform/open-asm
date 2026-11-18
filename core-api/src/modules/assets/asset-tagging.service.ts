import { InvalidInputError, NotFoundError } from '@/common/errors/domain.errors';
import { PromptRegistry } from '@/common/utils/prompt-registry.util';
import { WorkspaceEncryptionService } from '@/services/workspace-encryption/workspace-encryption.service';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { generateText } from 'ai';
import * as path from 'path';
import { Repository } from 'typeorm';
import { findDefaultLLMConfig } from '../agents/agents.config';
import { AgentConfig } from '../agents/entities/agent-config.entity';
import { AgentLLMConfig } from '../agents/entities/agent-llm-config.entity';
import { LLMProvider } from '../agents/enums/agent.enums';
import { getLLMProviderConfig } from '../agents/llm-provider-supported';
import { AssetQueryService } from './asset-query.service';
import { AssetService } from './entities/asset-services.entity';

/**
 * AI tag suggestions for a service (`POST assets/service/tag/generate`): asks
 * the workspace/user default LLM with the `GENERATE_SERVICE_TAGS.md` prompt.
 * It only returns suggestions; nothing is stored.
 */
@Injectable()
export class AssetTaggingService {
  private readonly logger = new Logger(AssetTaggingService.name);
  // GENERATE_SERVICE_TAGS.md lives with the agent prompts
  private readonly prompts = PromptRegistry.forDirectory(
    path.join(__dirname, '../agents/prompts'),
  );

  constructor(
    @InjectRepository(AssetService)
    private readonly assetServiceRepo: Repository<AssetService>,
    @InjectRepository(AgentLLMConfig)
    private readonly llmConfigRepository: Repository<AgentLLMConfig>,
    @InjectRepository(AgentConfig)
    private readonly agentConfigRepository: Repository<AgentConfig>,
    private readonly workspaceEncryption: WorkspaceEncryptionService,
    private readonly assetQuery: AssetQueryService,
  ) {}

  private async generateTagsWithAI(
    serviceData: string,
    workspaceId: string,
    userId: string,
  ): Promise<string[]> {
    const llmConfig = await findDefaultLLMConfig(
      {
        llmConfigs: this.llmConfigRepository,
        agentConfigs: this.agentConfigRepository,
      },
      workspaceId,
      userId,
    );

    if (!llmConfig) {
      throw new InvalidInputError(
        'No LLM provider connected. Please connect a provider first.',
      );
    }

    const providerConfig = getLLMProviderConfig(llmConfig.provider);
    if (!providerConfig) {
      throw new InvalidInputError(
        `Unsupported LLM provider: ${String(llmConfig.provider)}`,
      );
    }

    const apiKey = llmConfig.apiKey
      ? await this.workspaceEncryption.decrypt(workspaceId, llmConfig.apiKey)
      : '';
    const baseURL =
      llmConfig.provider === LLMProvider.CUSTOM
        ? llmConfig.apiUrl
        : undefined;
    const model = providerConfig.handler(apiKey, llmConfig.model, baseURL);

    const prompt = this.prompts.render('GENERATE_SERVICE_TAGS.md', {
      SERVICE_DATA: serviceData,
    });

    const result = await generateText({
      model,
      messages: [{ role: 'user', content: prompt }],
    });

    let textContent = '';
    if (typeof result.content === 'string') {
      textContent = result.content;
    } else if (Array.isArray(result.content)) {
      const textPart = result.content.find((part) => part.type === 'text');
      textContent = textPart?.type === 'text' ? textPart.text : '';
    }

    this.logger.log(`AI response: ${textContent.slice(0, 500)}`);

    const jsonMatch = textContent.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) {
      this.logger.warn(
        `Failed to parse tags from AI response: ${textContent.slice(0, 200)}`,
      );
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is string => typeof item === 'string')
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => tag.length > 0 && tag.length <= 100);
  }

  public async generateServiceTags(
    assetServiceId: string,
    workspaceId: string,
    userId: string,
  ): Promise<string[]> {
    const assetService = await this.assetServiceRepo
      .createQueryBuilder('assetService')
      .leftJoinAndSelect('assetService.asset', 'asset')
      .leftJoinAndSelect('assetService.httpResponses', 'httpResponse')
      .innerJoin('asset.target', 'target')
      .where('assetService.id = :assetServiceId', { assetServiceId })
      .andWhere('target.workspaceId = :workspaceId', { workspaceId })
      .getOne();

    if (!assetService) {
      throw new NotFoundError('Asset service not found');
    }

    const latestHttpResponse = assetService.httpResponses?.[0];
    const latestTechs = latestHttpResponse
      ? await this.assetQuery.getTechStringsForHttpResponse(latestHttpResponse.id)
      : [];
    const latestTls = latestHttpResponse
      ? await this.assetQuery.getTlsForHttpResponse(latestHttpResponse.id)
      : null;

    const serviceContext = {
      service: {
        value: assetService.value,
        port: assetService.port,
      },
      host: assetService.asset?.value,
      ...(latestHttpResponse && {
        http: {
          title: latestHttpResponse.title,
          webserver: latestHttpResponse.webserver,
          tech: latestTechs,
          status_code: latestHttpResponse.status_code,
          scheme: latestHttpResponse.scheme,
          host: latestHttpResponse.host,
          path: latestHttpResponse.path,
          content_type: latestHttpResponse.content_type,
          words: latestHttpResponse.words,
          lines: latestHttpResponse.lines,
          tls: latestTls,
        },
      }),
    };

    const tags = await this.generateTagsWithAI(
      JSON.stringify(serviceContext, null, 2),
      workspaceId,
      userId,
    );

    if (tags.length === 0) {
      throw new InvalidInputError(
        'AI model did not generate any tags. Ensure an LLM config is set up for your account.',
      );
    }

    return tags;
  }
}
