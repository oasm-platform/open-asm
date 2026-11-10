import { AgentToolRuleAction as A } from '../enums/agent.enums';
import { matchToolRule, wildcardMatch, type ToolRuleLike } from './tool-rules';

const rule = (id: string, over: Partial<ToolRuleLike>): ToolRuleLike => ({
  id,
  toolName: 'execute_remote_command',
  pattern: null,
  action: A.ALLOW,
  priority: 0,
  ...over,
});

describe('matchToolRule', () => {
  const rules = [
    rule('a', { pattern: 'nmap *', action: A.ALLOW }),
    rule('b', { pattern: 'nmap *-sU*', action: A.ASK, priority: 5 }),
    rule('c', { toolName: 'github_*', action: A.DENY }),
    rule('d', { pattern: 'NMAP *', action: A.DENY }),
    rule('e', { pattern: '(*', action: A.DENY, priority: 9 }),
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

  it('treats regex syntax as plain characters', () => {
    expect(match('execute_remote_command', 'echo (')).toBeNull();
    expect(match('execute_remote_command', '(echo)')).toBe('e');
  });

  it('must match the whole subject', () => {
    expect(match('execute_remote_command', 'sudo nmap -sV x')).toBeNull();
  });
});

describe('wildcardMatch', () => {
  it('matches * runs and ? characters, ignoring case', () => {
    expect(wildcardMatch('*masscan*', 'sudo MASSCAN 10.0.0.0/8')).toBe(true);
    expect(wildcardMatch('whoami', 'whoami; rm -rf /')).toBe(false);
    expect(wildcardMatch('h?st', 'host')).toBe(true);
    expect(wildcardMatch('a*b*c', 'axxbyyc')).toBe(true);
    expect(wildcardMatch('a*b*c', 'axxbyy')).toBe(false);
    expect(wildcardMatch('*', '')).toBe(true);
  });

  it('stays fast on a pattern built to backtrack', () => {
    const start = Date.now();
    expect(wildcardMatch('*a*a*a*a*a*a*a*a*b', 'a'.repeat(16 * 1024))).toBe(false);
    expect(Date.now() - start).toBeLessThan(1000);
  });
});
