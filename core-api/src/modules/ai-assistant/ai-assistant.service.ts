import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import { GenerateTagsDto } from './dto/generate-tags.dto';
import { Observable, firstValueFrom } from 'rxjs';

interface DomainClassifyRequest {
  domain: string;
}

interface DomainClassifyResponse {
  labels: string[];
}

interface DomainClassifyService {
  domainClassify(
    data: DomainClassifyRequest,
    metadata?: Metadata,
  ): Observable<DomainClassifyResponse>;
}

@Injectable()
export class AiAssistantService implements OnModuleInit {
  private readonly logger = new Logger(AiAssistantService.name);
  private domainClassifyService: DomainClassifyService;

  constructor(
    @Inject('ASSISTANT_PACKAGE') private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.domainClassifyService =
      this.client.getService<DomainClassifyService>('DomainClassify');
  }

  /**
   * Generate tags for a domain using AI
   * @param generateTagsDto - Contains the domain to classify
   * @param workspaceId - Workspace ID from request headers
   * @param userId - User ID from request headers
   * @returns Array of generated tags/labels
   */
  async generateTags(
    generateTagsDto: GenerateTagsDto,
    workspaceId?: string,
    userId?: string,
  ): Promise<string[]> {
    try {
      // Create metadata with workspace_id and user_id
      const metadata = new Metadata();
      if (workspaceId) {
        metadata.set('x-workspace-id', workspaceId);
      }
      if (userId) {
        metadata.set('x-user-id', userId);
      }

      const response = await firstValueFrom(
        this.domainClassifyService.domainClassify(
          { domain: generateTagsDto.domain },
          metadata,
        ),
      );

      const labels = response?.labels || [];

      return labels;
    } catch (error) {
      this.logger.error(
        `Failed to generate tags for ${generateTagsDto.domain}`,
        error,
      );
      throw error;
    }
  }
}
