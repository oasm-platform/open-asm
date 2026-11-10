/**
 * Checks an agent's quoted evidence against the raw tool outputs it cites.
 * A quote counts only when it appears, whitespace-normalized and
 * case-sensitive, in the stored stdout of the run it names. The result is
 * information for the reviewer; it never blocks a proposal.
 */

/** A verbatim quote from one stored run (run_tool_connector / execute_remote_command). */
export interface EvidenceCitation {
  runId: string;
  quote: string;
}

export type CitationStatus = 'found' | 'not_found' | 'output_expired';

/**
 * evidence_checked: every quote was found. unverified: no quotes, or one was
 * not in its output. output_expired: the rest were found but an output was
 * gone (expired or unknown run), so not everything could be checked.
 */
export type EvidenceVerdict = 'evidence_checked' | 'unverified' | 'output_expired';

export interface CheckedCitation extends EvidenceCitation {
  status: CitationStatus;
  /** 1-based output line where the quote starts. */
  line?: number;
  /** The output around the quote, kept for the reviewer once the output expires. */
  excerpt?: string;
}

/** Stored as `evidence.check` on the agent's vulnerability source. */
export interface EvidenceCheck {
  verdict: EvidenceVerdict;
  checkedAt: string;
  citations: CheckedCitation[];
}

/** Shorter quotes ("200", "admin") match almost any output. */
export const MIN_QUOTE_CHARS = 8;
export const MAX_QUOTE_CHARS = 500;
const EXCERPT_CONTEXT = 200;
const EXCERPT_MAX = 1_200;

/** Every whitespace run becomes one space; the ends are trimmed. */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Offset in `raw` of the character at `index` of normalizeWhitespace(raw). */
function rawOffset(raw: string, index: number): number {
  let pos = raw.length - raw.trimStart().length;
  let norm = 0;
  const space = /\s+/g;
  space.lastIndex = pos;
  for (let m = space.exec(raw); m !== null; m = space.exec(raw)) {
    const chunk = m.index - pos;
    if (norm + chunk > index) break;
    norm += chunk;
    if (norm === index) return m.index;
    norm += 1;
    pos = m.index + m[0].length;
  }
  return pos + (index - norm);
}

/** The lines holding [start, end), cut to EXCERPT_MAX around the match. */
function excerptOf(raw: string, start: number, end: number): string {
  const lineStart = raw.lastIndexOf('\n', start - 1) + 1;
  const nextBreak = raw.indexOf('\n', end);
  const lineEnd = nextBreak === -1 ? raw.length : nextBreak;
  const from = Math.max(lineStart, start - EXCERPT_CONTEXT);
  const to = Math.min(lineEnd, end + EXCERPT_CONTEXT, from + EXCERPT_MAX);
  return `${from > lineStart ? '…' : ''}${raw.slice(from, to).replace(/\r$/, '')}${to < lineEnd ? '…' : ''}`;
}

/**
 * Where `quote` occurs in `output`, or null. `normalized` lets a caller
 * checking several quotes against one output normalize it once.
 */
export function findQuote(
  output: string,
  quote: string,
  normalized = normalizeWhitespace(output),
): { line: number; excerpt: string } | null {
  const needle = normalizeWhitespace(quote);
  if (needle.length < MIN_QUOTE_CHARS) return null;
  const at = normalized.indexOf(needle);
  if (at === -1) return null;
  const start = rawOffset(output, at);
  const end = rawOffset(output, at + needle.length - 1) + 1;
  let line = 1;
  for (let i = output.indexOf('\n'); i !== -1 && i < start; i = output.indexOf('\n', i + 1)) {
    line++;
  }
  return { line, excerpt: excerptOf(output, start, end) };
}

export function evidenceVerdict(citations: CheckedCitation[]): EvidenceVerdict {
  if (citations.length === 0) return 'unverified';
  if (citations.some((c) => c.status === 'not_found')) return 'unverified';
  if (citations.some((c) => c.status === 'output_expired')) return 'output_expired';
  return 'evidence_checked';
}

/**
 * Checks each citation against `outputs` (runId → stored stdout, null when
 * it is gone).
 */
export function checkCitations(
  citations: EvidenceCitation[],
  outputs: ReadonlyMap<string, string | null>,
  now: Date = new Date(),
): EvidenceCheck {
  const normalized = new Map<string, string>();
  const checked = citations.map((citation): CheckedCitation => {
    const output = outputs.get(citation.runId) ?? null;
    if (output === null) return { ...citation, status: 'output_expired' };
    let flat = normalized.get(citation.runId);
    if (flat === undefined) {
      flat = normalizeWhitespace(output);
      normalized.set(citation.runId, flat);
    }
    const match = findQuote(output, citation.quote, flat);
    return match
      ? { ...citation, status: 'found', ...match }
      : { ...citation, status: 'not_found' };
  });
  return {
    verdict: evidenceVerdict(checked),
    checkedAt: now.toISOString(),
    citations: checked,
  };
}
