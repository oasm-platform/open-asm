import { AgentApprovalMode, AgentMode } from '@/common/enums/enum';
import { plainToInstance } from 'class-transformer';
import { getMetadataStorage, validate } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { AgentModeDto, GetAgentModesResponseDto } from './agent-mode.dto';
import {
  DecideCommandApprovalDto,
  DecidePlanApprovalDto,
} from './command-approval.dto';
import {
  AgentTodoItemDto,
  CreateConversationDto,
  ConversationResponseDto,
  GetConversationsResponseDto,
  UpdateConversationDto,
} from './conversation.dto';
import {
  CreateLLMConfigDto,
  LLMConfigResponseDto,
  LLMConfigWithProviderDto,
  LLMProviderStatusDto,
  LLMProviderSupportedDto,
  ProviderModelDto,
  UpdateLLMConfigDto,
} from './llm-config.dto';
import {
  GetMessagesResponseDto,
  MessageResponseDto,
  SendMessageDto,
  ToolCallResponseDto,
} from './message.dto';
import {
  MCPConfigResponseDto,
  MCPServerConfigDto,
  MCPServerPingResponseDto,
  MCPServerResponseDto,
  ToggleMCPServerDto,
  UpsertMCPServerDto,
} from './mcp-config.dto';
import { CreateSkillDto, SkillResponseDto, ToggleSkillDto, UpdateSkillDto } from './skill.dto';
import { WorkspaceMemoryResponseDto } from './workspace-memory.dto';
import { LLMProvider } from '../enums/agent.enums';

type DtoClass = abstract new (...args: never[]) => object;

const SWAGGER_MODEL_PROPERTIES = 'swagger/apiModelProperties';
const SWAGGER_MODEL_PROPERTIES_ARRAY = 'swagger/apiModelPropertiesArray';

const describedDtos: DtoClass[] = [
  AgentModeDto,
  GetAgentModesResponseDto,
  DecideCommandApprovalDto,
  DecidePlanApprovalDto,
  AgentTodoItemDto,
  CreateConversationDto,
  UpdateConversationDto,
  ConversationResponseDto,
  GetConversationsResponseDto,
  SendMessageDto,
  ToolCallResponseDto,
  MessageResponseDto,
  GetMessagesResponseDto,
  LLMProviderSupportedDto,
  LLMProviderStatusDto,
  CreateLLMConfigDto,
  UpdateLLMConfigDto,
  LLMConfigResponseDto,
  ProviderModelDto,
  LLMConfigWithProviderDto,
  MCPServerConfigDto,
  MCPServerResponseDto,
  MCPConfigResponseDto,
  UpsertMCPServerDto,
  ToggleMCPServerDto,
  MCPServerPingResponseDto,
  CreateSkillDto,
  UpdateSkillDto,
  SkillResponseDto,
  ToggleSkillDto,
  WorkspaceMemoryResponseDto,
];

describe('Agent DTO validation', () => {
  it('rejects an empty message and unsupported provider', async () => {
    const dto = plainToInstance(SendMessageDto, {
      question: '   ',
      provider: 'unsupported',
      agentMode: AgentMode.AGENT,
      approvalMode: AgentApprovalMode.MANUAL,
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['question', 'provider']),
    );
  });

  it('requires an API key and validates LLM limits', async () => {
    const dto = plainToInstance(CreateLLMConfigDto, {
      provider: LLMProvider.OPENAI,
      model: 'gpt-5',
      apiUrl: 'not-a-url',
      contextWindow: 1.5,
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['apiKey', 'apiUrl', 'contextWindow']),
    );
  });

  it('accepts a valid LLM config without an explicit model', async () => {
    const dto = plainToInstance(CreateLLMConfigDto, {
      provider: LLMProvider.OPENROUTER,
      apiKey: 'sk-test',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('validates MCP URLs, integer timeouts, and header values', async () => {
    const dto = plainToInstance(MCPServerConfigDto, {
      url: 'not-a-url',
      timeout: 1.5,
      headers: { authorization: 123 },
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['url', 'timeout', 'headers']),
    );
  });

  it('enforces persisted conversation and skill constraints', async () => {
    const conversation = plainToInstance(CreateConversationDto, {
      llmConfigId: randomUUID(),
      title: 'x'.repeat(501),
    });
    const skill = plainToInstance(CreateSkillDto, {
      name: '   ',
      description: '',
      content: '',
    });

    const [conversationErrors, skillErrors] = await Promise.all([
      validate(conversation),
      validate(skill),
    ]);

    expect(conversationErrors.map((error) => error.property)).toContain('title');
    expect(skillErrors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['name', 'description', 'content']),
    );
  });
});

describe('Agent DTO Swagger descriptions', () => {
  it.each(describedDtos.map((dto) => [dto.name, dto] as const))(
    '%s describes every documented property',
    (_name, dto) => {
      const properties =
        (Reflect.getMetadata(
          SWAGGER_MODEL_PROPERTIES_ARRAY,
          dto.prototype,
        ) as string[] | undefined) ?? [];

      expect(properties.length).toBeGreaterThan(0);

      for (const prefixedProperty of properties) {
        const property = prefixedProperty.slice(1);
        const metadata = Reflect.getMetadata(
          SWAGGER_MODEL_PROPERTIES,
          dto.prototype,
          property,
        ) as { description?: string } | undefined;

        if (!metadata?.description?.trim()) {
          throw new Error(
            `${dto.name}.${property} is missing a Swagger description`,
          );
        }
      }
    },
  );
});

describe('Agent DTO validation metadata', () => {
  it.each(describedDtos.map((dto) => [dto.name, dto] as const))(
    '%s validates every documented property',
    (_name, dto) => {
      const properties =
        (Reflect.getMetadata(
          SWAGGER_MODEL_PROPERTIES_ARRAY,
          dto.prototype,
        ) as string[] | undefined) ?? [];
      const validatedProperties = new Set(
        getMetadataStorage()
          .getTargetValidationMetadatas(dto, dto.name, true, false)
          .map((metadata) => metadata.propertyName),
      );

      for (const prefixedProperty of properties) {
        const property = prefixedProperty.slice(1);

        if (!validatedProperties.has(property)) {
          throw new Error(`${dto.name}.${property} is missing validation`);
        }
      }
    },
  );
});
