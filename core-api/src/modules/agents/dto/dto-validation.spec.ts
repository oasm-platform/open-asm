import { AgentApprovalMode, AgentMode } from '@/common/enums/enum';
import { plainToInstance } from 'class-transformer';
import {
  getMetadataStorage,
  validate,
  type ValidationError,
} from 'class-validator';
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
import {
  LLMProvider,
  ReasoningEffort,
  SearchProvider,
} from '../enums/agent.enums';
import {
  AGENT_INSTRUCTION_MAX_LENGTH,
  AGENT_MAX_STEPS,
  AGENT_MAX_TOKENS,
  AgentConfigResponseDto,
  AgentModelRefDto,
  AgentModelsConfigDto,
  AgentSearchProviderInputDto,
  AgentSearchProviderResponseDto,
  UpsertAgentConfigDto,
} from './agent-config.dto';

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
  AgentModelRefDto,
  AgentModelsConfigDto,
  AgentSearchProviderInputDto,
  AgentSearchProviderResponseDto,
  UpsertAgentConfigDto,
  AgentConfigResponseDto,
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

  it('requires an API key and validates the API URL', async () => {
    const dto = plainToInstance(CreateLLMConfigDto, {
      provider: LLMProvider.OPENAI,
      model: 'gpt-5',
      apiUrl: 'not-a-url',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['apiKey', 'apiUrl']),
    );
  });

  it('validates agent config models, limits and search providers', async () => {
    const dto = plainToInstance(UpsertAgentConfigDto, {
      modelsConfig: {
        default: { llmConfigId: 'not-a-uuid', model: 'gpt-5' },
        small: { llmConfigId: randomUUID(), model: 'mini', contextWindow: 1.5 },
        subagents: [
          {
            llmConfigId: randomUUID(),
            model: 'x',
            maxOutputTokens: AGENT_MAX_TOKENS + 1,
            reasoningEffort: 'extreme',
          },
        ],
      },
      searchProviders: [
        { provider: 'bing' },
        { provider: SearchProvider.EXA, apiKey: '' },
      ],
      maxSteps: AGENT_MAX_STEPS + 1,
      instruction: 'x'.repeat(AGENT_INSTRUCTION_MAX_LENGTH + 1),
      defaultApprovalMode: 'sometimes',
    });

    // Nested failures only show up as children of their parent property
    const paths = (errs: ValidationError[], prefix = ''): string[] =>
      errs.flatMap((e) => {
        const path = prefix ? `${prefix}.${e.property}` : e.property;
        return [
          ...(e.constraints ? [path] : []),
          ...paths(e.children ?? [], path),
        ];
      });

    expect(paths(await validate(dto)).sort()).toEqual(
      [
        'defaultApprovalMode',
        'instruction',
        'maxSteps',
        'modelsConfig.default.llmConfigId',
        'modelsConfig.small.contextWindow',
        'modelsConfig.subagents.0.maxOutputTokens',
        'modelsConfig.subagents.0.reasoningEffort',
        'searchProviders.0.provider',
        'searchProviders.1.apiKey',
      ].sort(),
    );
  });

  it('accepts a partial agent config that clears fields with null', async () => {
    const dto = plainToInstance(UpsertAgentConfigDto, {
      modelsConfig: {
        default: { llmConfigId: randomUUID(), model: 'gpt-5' },
        subagents: [
          {
            llmConfigId: randomUUID(),
            model: 'mini',
            reasoningEffort: ReasoningEffort.LOW,
          },
        ],
      },
      searchProviders: [{ provider: SearchProvider.EXA, isDefault: true }],
      instruction: null,
      maxSteps: null,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
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
