import * as fs from 'fs';
import * as path from 'path';

import { CATALOG } from '@/modules/attack-surface-query/catalog/catalog';
import { assertWithinBudget } from '@/modules/attack-surface-query/domain/query-cost';
import { AsqError } from '@/modules/attack-surface-query/domain/query-errors';
import { limitsFor } from '@/modules/attack-surface-query/domain/query-limits';
import type { QueryScope } from '@/modules/attack-surface-query/domain/query.types';
import { parseBatch, validateBatch } from '@/modules/attack-surface-query/domain/query-validator';

// Every example the attack-surface-query skill shows the model must run as
// written for an agent: valid against the catalog and within its cost budget.
// A recipe that fails teaches the model the wrong thing.

const SKILL = fs.readFileSync(path.join(__dirname, 'skills', 'attack-surface-query', 'SKILL.md'), 'utf8');
const AGENT: QueryScope = { workspaceId: 'w1', permissions: ['*'], caller: 'agent' };

/** The ```json blocks of the skill that are full calls (no <placeholder>). */
const recipes = [...SKILL.matchAll(/```json\n([\s\S]*?)```/g)]
  .map((m) => m[1])
  .filter((block) => block.includes('"queries"') && !block.includes('<'));

describe('attack-surface-query skill recipes', () => {
  it('has recipes to check', () => {
    expect(recipes.length).toBeGreaterThanOrEqual(8);
  });

  it.each(recipes.map((block, i) => [i, block] as const))('recipe %i is valid and within the agent budget', (_i, block) => {
    // projectId belongs to the tool input, not to the query batch
    const batch = JSON.parse(block) as Record<string, unknown>;
    delete batch.projectId;
    try {
      const normalized = validateBatch(CATALOG, parseBatch(batch), AGENT, new Date());
      for (const query of normalized.queries) assertWithinBudget(query, limitsFor('agent', 'interactive'));
    } catch (err) {
      // Show the issues, not just "1 issue(s)": the recipe has to be fixed.
      throw err instanceof AsqError ? new Error(`${err.message}: ${JSON.stringify(err.toJSON())}`) : err;
    }
  });
});
