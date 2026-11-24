/**
 * Chat mentions: workspace records picked with "@" in the agent input and
 * sent to the AI as `@<kind>:<value>`. One kind per result group of
 * `GET /search`; the agent's SYSTEM.md (core-api agents module) explains each
 * prefix to the model, so add a kind there too when search gains a group.
 */
export const MENTION_KINDS = ['target', 'asset', 'vulnerability'] as const;

export type MentionKind = (typeof MENTION_KINDS)[number];

/** A mention token or plain text, in the order they appear in the input */
export interface MentionSegment {
  text: string;
  isMention: boolean;
}

/** The "@query" being typed right before the caret */
export interface MentionQuery {
  /** Index of the "@" */
  start: number;
  query: string;
}

const MENTION_PATTERN = new RegExp(
  `(?<=^|\\s)@(?:${MENTION_KINDS.join('|')}):(?:"(?:[^"\\\\]|\\\\.)*"|\\S+)`,
  'g',
);

/** Quotes the value (JSON escaping) when it has whitespace or quotes */
export function formatMention(kind: MentionKind, value: string): string {
  const needsQuotes = /[\s"\\]/.test(value) || value.length === 0;
  return `@${kind}:${needsQuotes ? JSON.stringify(value) : value}`;
}

/**
 * The mention being typed at `caret`: an "@" at the start of the text or
 * after whitespace, followed by no whitespace. A finished mention (it has a
 * ":") is not a query, nor is an "@" inside a word such as an email.
 */
export function findMentionQuery(
  text: string,
  caret: number,
): MentionQuery | null {
  const before = text.slice(0, caret);
  const match = /(?:^|\s)@([^\s@:]*)$/.exec(before);
  if (!match) return null;
  return { start: caret - match[1].length - 1, query: match[1] };
}

/** Splits the text into mention tokens and the plain text between them */
export function splitMentions(text: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(MENTION_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) {
      segments.push({ text: text.slice(last, index), isMention: false });
    }
    segments.push({ text: match[0], isMention: true });
    last = index + match[0].length;
  }
  if (last < text.length) {
    segments.push({ text: text.slice(last), isMention: false });
  }
  return segments;
}
