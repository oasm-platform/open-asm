import { ConflictException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import type { Repository } from 'typeorm';
import {
  AgentsDefinitionsService,
  parseBuiltinAgentFile,
} from './agents.definitions';
import type { AgentDefinition } from './entities/agent-definition.entity';
import {
  AgentDefinitionMode,
  AgentDefinitionScope,
} from './enums/agent.enums';

const BUILTIN_DIR = path.join(__dirname, 'builtin-agents');

describe('parseBuiltinAgentFile', () => {
  it('parses frontmatter metadata and the prompt body', () => {
    const def = parseBuiltinAgentFile(
      '---\nname: retester\ntitle: Finding retest\ndescription: "Retest: one finding"\nmode: subagent\ntemperature: 0.2\nmaxSteps: 30\ntools: [a, b]\n---\n\n# Prompt\n',
    );
    expect(def).toMatchObject({
      id: 'builtin-retester',
      name: 'retester',
      title: 'Finding retest',
      description: 'Retest: one finding',
      mode: AgentDefinitionMode.SUBAGENT,
      scope: AgentDefinitionScope.BUILTIN,
      isBuiltin: true,
      canEdit: false,
      systemPrompt: '# Prompt',
      metadata: { temperature: 0.2, maxSteps: 30, tools: ['a', 'b'] },
    });
  });

  it('rejects a name that is not a slug', () => {
    expect(parseBuiltinAgentFile('---\nname: Bad Name\n---\nx')).toBeNull();
    expect(parseBuiltinAgentFile('no frontmatter')).toBeNull();
  });

  it('loads every shipped built-in agent', () => {
    const files = fs.readdirSync(BUILTIN_DIR).filter((f) => f.endsWith('.md'));
    const names = files.map((f) => {
      const def = parseBuiltinAgentFile(
        fs.readFileSync(path.join(BUILTIN_DIR, f), 'utf-8'),
      );
      expect(def).not.toBeNull();
      expect(def?.systemPrompt).not.toBe('');
      return def?.name;
    });
    expect(new Set(names).size).toBe(files.length);
    expect(names).toEqual(expect.arrayContaining(['pentest', 'worker']));
  });
});

describe('AgentsDefinitionsService', () => {
  const repo = {
    exists: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((row: Partial<AgentDefinition>) => row),
    save: jest.fn((row: Partial<AgentDefinition>) =>
      Promise.resolve({ id: 'id-1', ...row }),
    ),
    remove: jest.fn(),
  };
  const service = new AgentsDefinitionsService(
    repo as unknown as Repository<AgentDefinition>,
  );
  const dto = {
    name: 'my-agent',
    mode: AgentDefinitionMode.ALL,
    scope: AgentDefinitionScope.USER as const,
  };

  beforeEach(() => jest.clearAllMocks());

  it('reserves built-in names', async () => {
    await expect(
      service.create('ws', 'u1', { ...dto, name: 'pentest' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repo.exists).not.toHaveBeenCalled();
  });

  it('checks a personal name against workspace agents and own agents', async () => {
    repo.exists.mockResolvedValue(false);
    const created = await service.create('ws', 'u1', {
      ...dto,
      metadata: { temperature: 0.5, variant: undefined },
    });
    const { where } = repo.exists.mock.calls[0][0] as { where: object[] };
    expect(where).toEqual([
      { workspaceId: 'ws', name: 'my-agent', scope: AgentDefinitionScope.WORKSPACE },
      { workspaceId: 'ws', name: 'my-agent', createdBy: 'u1' },
    ]);
    expect(created).toMatchObject({
      createdBy: 'u1',
      canEdit: true,
      metadata: { temperature: 0.5 },
    });
    expect(created.metadata).not.toHaveProperty('variant');
  });

  it('checks a workspace name against every agent of the workspace', async () => {
    repo.exists.mockResolvedValue(true);
    await expect(
      service.create('ws', 'u1', { ...dto, scope: AgentDefinitionScope.WORKSPACE }),
    ).rejects.toBeInstanceOf(ConflictException);
    const { where } = repo.exists.mock.calls[0][0] as { where: object[] };
    expect(where).toEqual([{ workspaceId: 'ws', name: 'my-agent' }]);
  });

  it('lists built-in agents before custom ones', async () => {
    repo.find.mockResolvedValue([
      { id: 'c1', name: 'mine', createdBy: 'u1', metadata: {} },
    ]);
    const list = await service.list('ws', 'u1');
    expect(list[0].isBuiltin).toBe(true);
    expect(list.at(-1)).toMatchObject({ id: 'c1', isBuiltin: false, canEdit: true });
  });

  it('only lets the creator delete a custom agent', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.delete('ws', 'u2', 'c1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { id: 'c1', workspaceId: 'ws', createdBy: 'u2' },
    });
    await expect(
      service.delete('ws', 'u1', 'builtin-pentest'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
