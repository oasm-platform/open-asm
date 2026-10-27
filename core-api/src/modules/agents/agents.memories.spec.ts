import { NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';

import type { RedisService } from '@/services/redis/redis.service';

import { withoutDisabledTools } from './agents.config';
import { AgentsMemoriesService } from './agents.memories';
import type { AgentWorkspaceMemory } from './entities/agent-workspace-memory.entity';
import { memoryTools } from './tools/memory.tools';

const WS = 'ws-1';
const USER = 'user-1';
const ID = '11111111-1111-4111-8111-111111111111';

const memory = (patch: Partial<AgentWorkspaceMemory> = {}) =>
  ({
    id: ID,
    workspaceId: WS,
    userId: USER,
    content: 'fact',
    updatedAt: new Date('2026-10-26T00:00:00Z'),
    ...patch,
  }) as AgentWorkspaceMemory;

describe('AgentsMemoriesService long-term memory', () => {
  let service: AgentsMemoriesService;
  let repo: {
    findOne: jest.Mock;
    findAndCount: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  beforeEach(() => {
    repo = {
      findOne: jest.fn().mockResolvedValue(null),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      create: jest.fn((v: Partial<AgentWorkspaceMemory>) => ({ ...v })),
      save: jest.fn((v: AgentWorkspaceMemory) => Promise.resolve(v)),
    };
    service = new AgentsMemoriesService(
      {} as RedisService,
      repo as unknown as Repository<AgentWorkspaceMemory>,
    );
  });

  it('saves every memory as its own record', async () => {
    await service.ltmCreate(WS, USER, 'fact A');
    await service.ltmCreate(WS, USER, 'fact B');

    expect(repo.findOne).not.toHaveBeenCalled();
    expect(repo.save.mock.calls).toEqual([
      [{ workspaceId: WS, userId: USER, content: 'fact A' }],
      [{ workspaceId: WS, userId: USER, content: 'fact B' }],
    ]);
  });

  it('rejects blank content', async () => {
    await expect(service.ltmCreate(WS, USER, '  \n')).rejects.toThrow(
      'Cannot save empty content',
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('replaces the content of one record of the user', async () => {
    repo.findOne.mockResolvedValue(memory());

    await service.ltmUpdate(ID, WS, USER, 'new fact');

    expect(repo.findOne).toHaveBeenCalledWith({
      where: { id: ID, workspaceId: WS, userId: USER },
    });
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: ID, content: 'new fact' }),
    );
  });

  it('refuses to update a record the user does not own', async () => {
    await expect(service.ltmUpdate(ID, WS, USER, 'x')).rejects.toThrow(
      NotFoundException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('puts every record into the prompt', async () => {
    repo.findAndCount.mockResolvedValue([
      [memory({ content: 'fact B' }), memory({ content: 'line 1\nline 2' })],
      2,
    ]);

    await expect(service.ltmFormatForPrompt(WS, USER)).resolves.toBe(
      '[Long-Term Memory]\n- fact B\n- line 1\n  line 2',
    );
  });

  it('says how many older records the prompt leaves out', async () => {
    repo.findAndCount.mockResolvedValue([[memory()], 51]);

    await expect(service.ltmFormatForPrompt(WS, USER)).resolves.toContain(
      '(50 older memories not shown here',
    );
  });

  it('adds nothing to the prompt without memories', async () => {
    await expect(service.ltmFormatForPrompt(WS, USER)).resolves.toBe('');
  });
});

describe('long-term memory tools', () => {
  type Exec = (params: unknown, options: { toolCallId: string }) => unknown;
  let memories: Record<string, jest.Mock>;
  let tools: Record<string, { execute: Exec }>;

  beforeEach(() => {
    memories = {
      ltmCreate: jest.fn().mockResolvedValue(memory()),
      ltmUpdate: jest.fn().mockResolvedValue(memory()),
      ltmGetById: jest.fn().mockResolvedValue(null),
      ltmGetAllPaginated: jest
        .fn()
        .mockResolvedValue({ data: [memory()], total: 1 }),
      ltmDeleteById: jest.fn().mockResolvedValue(undefined),
    };
    tools = memoryTools(
      { agentsMemories: memories as never },
      WS,
      USER,
      'conv-1',
    ) as unknown as Record<string, { execute: Exec }>;
  });

  const run = (name: string, params: unknown) =>
    tools[name].execute(params, { toolCallId: 'c1' });

  it('ltm_write adds a new memory and returns its id', async () => {
    await expect(run('ltm_write', { content: 'fact A' })).resolves.toEqual(
      expect.objectContaining({ success: true, id: ID }),
    );
    expect(memories.ltmCreate).toHaveBeenCalledWith(WS, USER, 'fact A');
    expect(memories.ltmUpdate).not.toHaveBeenCalled();
  });

  it('ltm_write with an id replaces that memory', async () => {
    await run('ltm_write', { content: 'fact B', id: ID });
    expect(memories.ltmUpdate).toHaveBeenCalledWith(ID, WS, USER, 'fact B');
    expect(memories.ltmCreate).not.toHaveBeenCalled();
  });

  it('ltm_read lists memories with their ids', async () => {
    await expect(run('ltm_read', {})).resolves.toEqual({
      total: 1,
      memories: [
        { id: ID, content: 'fact', updatedAt: memory().updatedAt },
      ],
    });
  });

  it('ltm_read reports an unknown id', async () => {
    await expect(run('ltm_read', { id: ID })).resolves.toEqual(
      expect.objectContaining({ found: false }),
    );
  });

  it('ltm_delete removes one memory by id', async () => {
    await run('ltm_delete', { id: ID });
    expect(memories.ltmDeleteById).toHaveBeenCalledWith(ID, WS, USER);
  });

  it('no longer offers ltm_append', () => {
    expect(tools).not.toHaveProperty('ltm_append');
  });

  it('treats ltm_append in saved disabled tools as ltm_write', () => {
    expect(
      Object.keys(
        withoutDisabledTools(tools, { disabledTools: ['ltm_append'] } as never),
      ),
    ).not.toContain('ltm_write');
  });
});
