import { AgentToolRuleAction } from '../enums/agent.enums';
import { globMatch } from './target-scope';

/** The part of an AgentToolRule that decides what it matches. */
export interface ToolRuleLike {
  id: string;
  toolName: string;
  pattern: string | null;
  action: AgentToolRuleAction;
  priority: number;
}

/** Longest text a rule pattern is run against (bounds matching cost). */
export const RULE_SUBJECT_MAX = 16 * 1024;

const ACTION_RANK: Record<AgentToolRuleAction, number> = {
  [AgentToolRuleAction.DENY]: 0,
  [AgentToolRuleAction.ASK]: 1,
  [AgentToolRuleAction.ALLOW]: 2,
};

/**
 * Whether `text` matches `pattern` as a whole, ignoring case: `*` stands for
 * any run of characters, `?` for exactly one. Matched without building a
 * RegExp from the pattern, so a rule cannot be made to backtrack for ever.
 */
export function wildcardMatch(pattern: string, text: string): boolean {
  const p = pattern.toLowerCase();
  const t = text.toLowerCase();
  let pi = 0;
  let ti = 0;
  let star = -1;
  let mark = 0;
  while (ti < t.length) {
    if (pi < p.length && (p[pi] === '?' || p[pi] === t[ti])) {
      pi++;
      ti++;
    } else if (pi < p.length && p[pi] === '*') {
      star = pi++;
      mark = ti;
    } else if (star !== -1) {
      pi = star + 1;
      ti = ++mark;
    } else {
      return false;
    }
  }
  while (p[pi] === '*') pi++;
  return pi === p.length;
}

/**
 * The rule that decides a call to `tool` whose input reads as `subject`:
 * highest priority first, deny > ask > allow on a tie. A pattern must match the
 * whole subject (see `wildcardMatch`); a null pattern matches every call.
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
      return wildcardMatch(rule.pattern, text);
    }) ?? null
  );
}
