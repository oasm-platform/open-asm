import { AgentToolRuleAction } from '../enums/agent.enums';
import { globMatch } from './target-scope';

/** The part of an AgentToolRule that decides what it matches. */
export interface ToolRuleLike {
  id: string;
  toolName: string;
  pattern: string | null;
  isRegex: boolean;
  action: AgentToolRuleAction;
  priority: number;
}

/** Longest text a rule pattern is run against (bounds regex cost). */
export const RULE_SUBJECT_MAX = 16 * 1024;

const ACTION_RANK: Record<AgentToolRuleAction, number> = {
  [AgentToolRuleAction.DENY]: 0,
  [AgentToolRuleAction.ASK]: 1,
  [AgentToolRuleAction.ALLOW]: 2,
};

/** Throws a message safe to show when `pattern` is not a valid regex. */
export function compileRulePattern(pattern: string): RegExp {
  return new RegExp(pattern, 'i');
}

/**
 * The rule that decides a call to `tool` whose input reads as `subject`:
 * highest priority first, deny > ask > allow on a tie. A regex that no longer
 * compiles never matches.
 */
export function matchToolRule<T extends ToolRuleLike>(
  rules: readonly T[],
  tool: string,
  subject: string,
): T | null {
  const text = subject.slice(0, RULE_SUBJECT_MAX);
  const ordered = [...rules].sort(
    (a, b) =>
      b.priority - a.priority ||
      ACTION_RANK[a.action] - ACTION_RANK[b.action] ||
      a.id.localeCompare(b.id),
  );
  return (
    ordered.find((rule) => {
      if (!globMatch(rule.toolName, tool)) return false;
      if (!rule.pattern) return true;
      if (!rule.isRegex) return text.toLowerCase().includes(rule.pattern.toLowerCase());
      try {
        return compileRulePattern(rule.pattern).test(text);
      } catch {
        return false;
      }
    }) ?? null
  );
}
