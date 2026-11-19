import * as fs from 'fs';
import * as path from 'path';

import { CATALOG } from '@/modules/attack-surface-query/catalog/catalog';
import { assertWithinBudget } from '@/modules/attack-surface-query/domain/query-cost';
import { AsqError } from '@/modules/attack-surface-query/domain/query-errors';
import { limitsFor } from '@/modules/attack-surface-query/domain/query-limits';
import type { QueryScope } from '@/modules/attack-surface-query/domain/query.types';
import { parseBatch, validateBatch } from '@/modules/attack-surface-query/domain/query-validator';

import { AgentsSkillsService } from './agents.skills';
import { AGENT_TOOL_CLASSES } from './agents.tools';
import { agentFunctionsOf } from './tools/agent-function';

// The use-oasm skill maps console pages to the tools that answer questions
// about them. A route or tool name that does not exist teaches the model to
// call something that is not there, so both are checked against the code.

type LoadSkill = {
  execute: (input: { name: string }, options: unknown) => Promise<Record<string, unknown>>;
};

// A Windows checkout may turn the file into CRLF
const SKILL = fs.readFileSync(path.join(__dirname, 'skills', 'use-oasm', 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');
const AGENT: QueryScope = { workspaceId: 'w1', permissions: ['*'], caller: 'agent' };
const SAMPLE_ID = '9f2c1e0a-4b7d-4c1e-9a3f-2d5b8e6c7a10';

/** The body of one `## <heading>` section, up to the next `## `. */
function section(heading: string): string {
  const start = SKILL.indexOf(`\n## ${heading}\n`);
  if (start < 0) return '';
  const rest = SKILL.slice(start + heading.length + 5);
  const end = rest.indexOf('\n## ');
  return end < 0 ? rest : rest.slice(0, end);
}

/** Rows of the `## Routes` table: [route cell, tools cell]. */
const routeRows = section('Routes')
  .split('\n')
  .filter((line) => line.startsWith('| `/'))
  .map((line) => line.split('|').map((cell) => cell.trim()))
  .map((cells) => ({ route: cells[1], tools: cells[cells.length - 2] }));

const KNOWN_TOOLS = new Set([
  ...AGENT_TOOL_CLASSES.flatMap(agentFunctionsOf).map((f) => f.options.name),
  'load_skill',
  'dispatch_subagent',
]);

describe('use-oasm built-in skill', () => {
  const service = new AgentsSkillsService(
    {
      find: jest.fn(() => Promise.resolve([])),
      findOne: jest.fn(() => Promise.resolve(null)),
    } as never,
    {} as never,
  );

  it('is listed as a built-in skill', async () => {
    const skills = await service.getSkills('w1');
    expect(skills).toContainEqual(
      expect.objectContaining({ id: 'builtin-use-oasm', name: 'use-oasm', isBuiltin: true, isEnabled: true }),
    );
  });

  it('is offered in the skills prompt for page_context messages', async () => {
    const prompt = await service.buildSkillsPrompt('w1');
    expect(prompt).toMatch(/^- use-oasm: .*<page_context>/m);
  });

  it('loads its instructions through load_skill', async () => {
    const loadSkill = service.createLoadSkillTool('w1') as unknown as LoadSkill;
    const result = await loadSkill.execute({ name: 'use-oasm' }, { toolCallId: 't', messages: [] });
    expect(result.error).toBeUndefined();
    const content = result.content as string;
    expect(content).not.toMatch(/^---/);
    for (const heading of ['The page_context block', 'Routes', 'Answering "what is this?"', 'Untrusted input']) {
      expect(content).toContain(`## ${heading}`);
    }
    expect(content).toContain('<page_context route=');
  });

  it('maps every console page', () => {
    expect(routeRows.length).toBeGreaterThanOrEqual(20);
    for (const { route } of routeRows) expect(route).toMatch(/^`\//);
  });

  it('names only tools that exist', () => {
    // Tool names are snake_case; other code spans in the cell are fields (`id`, `projectId`)
    const named = routeRows.flatMap(({ tools }) => [...tools.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)].map((m) => m[1]));
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((name) => !KNOWN_TOOLS.has(name))).toEqual([]);
  });

  it('maps only routes the console has', () => {
    const routesDir = path.join(__dirname, '..', '..', '..', '..', 'console', 'src', 'routes', '_authed');
    // The API image ships without the console: nothing to compare with there
    if (!fs.existsSync(routesDir)) return;
    const missing = routeRows
      .flatMap(({ route }) => [...route.matchAll(/`(\/[^`]*)`/g)].map((m) => m[1]))
      .filter((route) => !route.endsWith('*'))
      .filter((route) => {
        const parts = route.split('/').filter(Boolean).map((p) => (p.startsWith(':') ? `$${p.slice(1)}` : p));
        const base = path.join(routesDir, ...parts);
        const files = parts.length > 0 ? [`${base}.tsx`, path.join(base, 'index.tsx')] : [path.join(base, 'index.tsx')];
        return !files.some((file) => fs.existsSync(file));
      });
    expect(missing).toEqual([]);
  });

  it('shows attack surface queries that are valid for an agent', () => {
    const recipes = [...SKILL.matchAll(/```json\n([\s\S]*?)```/g)]
      .map((m) => m[1])
      .filter((block) => block.includes('"queries"'));
    expect(recipes.length).toBeGreaterThanOrEqual(2);
    for (const block of recipes) {
      const batch = JSON.parse(block.replaceAll('<id>', SAMPLE_ID)) as Record<string, unknown>;
      delete batch.projectId;
      try {
        const normalized = validateBatch(CATALOG, parseBatch(batch), AGENT, new Date());
        for (const query of normalized.queries) assertWithinBudget(query, limitsFor('agent', 'interactive'));
      } catch (err) {
        throw err instanceof AsqError ? new Error(`${err.message}: ${JSON.stringify(err.toJSON())}`) : err;
      }
    }
  });
});
