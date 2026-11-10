import { AgentsGuardService } from './agents.guard';
import { AgentToolRuleAction as A } from './enums/agent.enums';
import type { AgentToolRule } from './entities/agent-tool-rule.entity';

describe('AgentsGuardService.evaluate', () => {
  let rules: Partial<AgentToolRule>[];
  let projectId: string | null;
  let projectRules: Array<{ mode: string; type: string; value: string; resolved: string | null }>;

  const service = () => {
    const dataSource = {
      query: jest.fn((sql: string, params: unknown[]) => {
        if (sql.includes('FROM agent_conversations')) return Promise.resolve([{ projectId }]);
        if (sql.includes('FROM project_scope_rules')) return Promise.resolve(projectRules);
        if (sql.includes('FROM targets WHERE')) {
          return Promise.resolve([{ value: 'acme.io' }, { value: '10.0.0.0/24' }]);
        }
        // known assets: only 203.0.113.9 is one
        const values = params[1] as string[];
        return Promise.resolve(values.filter((v) => v === '203.0.113.9').map((value) => ({ value })));
      }),
    };
    const repo = { find: jest.fn(() => Promise.resolve(rules)) };
    return new AgentsGuardService(repo as never, dataSource as never, {} as never);
  };
  const call = (tool: string, input: unknown, builtin = false) =>
    service().evaluate({ tool, input, workspaceId: 'w1', conversationId: 'c1', builtin });
  const rule = (over: Partial<AgentToolRule>): Partial<AgentToolRule> => ({
    id: `r${rules.length}`,
    toolName: 'execute_remote_command',
    pattern: null,
      priority: 0,
    ...over,
  });

  beforeEach(() => {
    rules = [];
    projectId = null;
    projectRules = [];
  });

  it('refuses a built-in deny before anything else, even with an allow rule', async () => {
    rules = [rule({ action: A.ALLOW, priority: 100 })];
    const verdict = await call('execute_remote_command', { command: 'rm -rf /' }, true);
    expect(verdict).toMatchObject({
      action: 'deny',
      policy: { source: 'builtin', ruleId: 'builtin:recursive-delete-root' },
    });
    expect(verdict.action === 'deny' && verdict.message).toMatch(/platform policy.*not a firewall/);
  });

  it('applies workspace rules: deny, ask, allow', async () => {
    rules = [
      rule({ id: 'deny', pattern: '*masscan*', action: A.DENY }),
      rule({ id: 'ask', toolName: 'save_*', action: A.ASK }),
      rule({ id: 'allow', pattern: 'whoami', action: A.ALLOW }),
    ];
    await expect(call('execute_remote_command', { command: 'masscan 10.0.0.1' })).resolves.toMatchObject({
      action: 'deny',
      policy: { source: 'rule', ruleId: 'deny' },
    });
    await expect(call('save_file', { name: 'a' })).resolves.toMatchObject({ action: 'ask' });
    await expect(call('execute_remote_command', { command: 'whoami' })).resolves.toMatchObject({ action: 'allow' });
    await expect(call('enumerate_assets', {})).resolves.toEqual({ action: 'default' });
  });

  it('refuses structured targets outside the workspace targets', async () => {
    await expect(call('run_tool_connector', { tool: 'nmap', target: 'api.acme.io:443' })).resolves.toEqual({
      action: 'default',
    });
    await expect(call('run_tool_connector', { tool: 'nmap', target: '203.0.113.9' })).resolves.toEqual({
      action: 'default',
    });
    await expect(call('dispatch_subagent', { name: 'recon', task: 't', targets: ['acme.io', 'evil.com'] })).resolves.toMatchObject({
      action: 'deny',
      policy: { source: 'scope', reason: 'evil.com is outside the workspace targets' },
    });
  });

  it('uses the project scope, where excludes win', async () => {
    projectId = 'p1';
    projectRules = [
      { mode: 'include', type: 'hostname', value: '*.shop.io', resolved: null },
      { mode: 'exclude', type: 'hostname', value: 'admin.shop.io', resolved: null },
    ];
    await expect(call('run_tool_connector', { target: 'https://www.shop.io' })).resolves.toEqual({ action: 'default' });
    await expect(call('run_tool_connector', { target: 'acme.io' })).resolves.toMatchObject({ action: 'deny' });
    await expect(call('run_tool_connector', { target: 'admin.shop.io' })).resolves.toMatchObject({
      action: 'deny',
      policy: { reason: "admin.shop.io is excluded from the project's scope" },
    });
  });

  it('asks for shell hosts outside scope, unless an allow rule covers the command', async () => {
    const curl = { command: 'curl -s https://evil.com/x' };
    await expect(call('execute_remote_command', curl, true)).resolves.toMatchObject({
      action: 'ask',
      policy: { source: 'scope' },
    });
    rules = [rule({ pattern: 'curl -s https://evil.com/*', action: A.ALLOW })];
    await expect(call('execute_remote_command', curl, true)).resolves.toMatchObject({
      action: 'allow',
      policy: { source: 'rule' },
    });
    await expect(call('execute_remote_command', { command: 'nmap 10.0.0.5' }, true)).resolves.toEqual({
      action: 'default',
    });
  });
});
