import { AgentsSkillsService } from './agents.skills';

type LoadSkill = {
  execute: (
    input: { name: string },
    options: unknown,
  ) => Promise<Record<string, unknown>>;
};

describe('AgentsSkillsService built-in skills', () => {
  // Real skills directory; no workspace skills
  const service = new AgentsSkillsService(
    {
      find: jest.fn(() => Promise.resolve([])),
      findOne: jest.fn(() => Promise.resolve(null)),
    } as never,
    {} as never,
  );

  it('lists nuclei-template-generator as a built-in skill', async () => {
    const skills = await service.getSkills('w1');
    expect(skills).toContainEqual(
      expect.objectContaining({
        id: 'builtin-nuclei-template-generator',
        name: 'nuclei-template-generator',
        isBuiltin: true,
        isEnabled: true,
      }),
    );
  });

  it('offers it in the skills prompt', async () => {
    const prompt = await service.buildSkillsPrompt('w1');
    expect(prompt).toMatch(/^- nuclei-template-generator: .*Nuclei template/m);
  });

  it('loads its instructions through load_skill', async () => {
    const loadSkill = service.createLoadSkillTool('w1') as unknown as LoadSkill;
    const result = await loadSkill.execute(
      { name: 'nuclei-template-generator' },
      { toolCallId: 't', messages: [] },
    );
    expect(result.error).toBeUndefined();
    expect(result.name).toBe('nuclei-template-generator');
    const content = result.content as string;
    // Frontmatter stripped; covers the template rules and the save path
    expect(content).not.toMatch(/^---/);
    expect(content).toContain('{{BaseURL}}');
    expect(content).toContain('matchers');
    expect(content).toContain('save_template');
  });
});
