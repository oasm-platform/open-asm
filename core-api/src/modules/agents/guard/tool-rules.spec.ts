import { AgentToolRuleAction as A } from '../enums/agent.enums';
import { matchToolRule, type ToolRuleLike } from './tool-rules';

const rule = (id: string, over: Partial<ToolRuleLike>): ToolRuleLike => ({
  id,
  toolName: 'execute_remote_command',
  pattern: null,
  isRegex: false,
  action: A.ALLOW,
  priority: 0,
  ...over,
});

describe('matchToolRule', () => {
  const rules = [
    rule('a', { pattern: 'nmap', action: A.ALLOW }),
    rule('b', { pattern: '^nmap .*-sU', isRegex: true, action: A.ASK, priority: 5 }),
    rule('c', { toolName: 'github_*', action: A.DENY }),
    rule('d', { pattern: 'NMAP', action: A.DENY }),
    rule('e', { pattern: '(', isRegex: true, action: A.DENY, priority: 9 }),
  ];
  const match = (tool: string, subject: string) =>
    matchToolRule(rules, tool, subject)?.id ?? null;

  it('picks the highest priority, then deny over allow', () => {
    expect(match('execute_remote_command', 'nmap -sU 10.0.0.1')).toBe('b');
    expect(match('execute_remote_command', 'nmap -sV 10.0.0.1')).toBe('d');
  });

  it('matches tool globs, null patterns and nothing else', () => {
    expect(match('github_create_issue', '{}')).toBe('c');
    expect(match('execute_remote_command', 'dig acme.io')).toBeNull();
    expect(match('run_tool_connector', '{"tool":"nmap"}')).toBeNull();
  });

  it('skips a regex that does not compile', () => {
    expect(match('execute_remote_command', 'echo (')).toBeNull();
  });
});
