/**
 * The console page a chat message is about. The Ask AI sidebar appends it
 * to the question as one `<page_context … />` line; the `use-oasm` skill of
 * the API explains the block to the model. Plain text, so the chat API
 * keeps its contract.
 */
export interface PageContext {
  /** Route pattern with `:param` segments, e.g. `/targets/:id/:tab` */
  route: string;
  /** The URL path the user has open */
  path: string;
  params: Record<string, string>;
  /** Human label of the page, e.g. `example.com · Overview` (its document title) */
  title: string;
}

const MAX_ROUTE = 200;
const MAX_PATH = 2048;
const MAX_PARAMS = 512;
const MAX_TITLE = 80;

/** Characters that could end an attribute or the tag, or break the line. */
const isUnsafeInAttr = (ch: string) => {
  const code = ch.charCodeAt(0);
  return code < 0x20 || code === 0x7f || `"'<>&\``.includes(ch);
};

/** Every character of `value`, unsafe ones passed through `replace`. */
const replaceUnsafe = (value: string, replace: (ch: string) => string) =>
  Array.from(value, (ch) => (isUnsafeInAttr(ch) ? replace(ch) : ch)).join('');

/** For text attributes: unsafe characters dropped, length capped. */
function plainAttr(value: string, max: number): string {
  return replaceUnsafe(value, () => '').slice(0, max);
}

/** For the path: unsafe characters percent-encoded, length capped. */
function pathAttr(value: string): string {
  return replaceUnsafe(value, encodeURIComponent).slice(0, MAX_PATH);
}

/**
 * The params as single-quoted JSON: `'`, `<`, `>` and `&` become `\u` escapes,
 * so a value can close neither the attribute nor the tag and still parses
 * back to itself. Too large → `{}` (a cut JSON would not parse).
 */
function paramsAttr(params: Record<string, string>): string {
  const json = JSON.stringify(params).replace(
    /['<>&]/g,
    (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
  return json.length > MAX_PARAMS ? '{}' : json;
}

export function formatPageContextBlock(ctx: PageContext): string {
  return (
    `<page_context route="${plainAttr(ctx.route, MAX_ROUTE)}"` +
    ` path="${pathAttr(ctx.path)}"` +
    ` params='${paramsAttr(ctx.params)}'` +
    ` title="${plainAttr(ctx.title, MAX_TITLE)}" />`
  );
}

/** The block at the end of a message; no `>` can occur inside it. */
const BLOCK_AT_END = /\s*<page_context\b[^>]*\/>\s*$/;

/**
 * The question to send: `text` with the page block as its last line, after
 * a blank line. Last, not first: the API derives the conversation title and
 * the agent goal from the start of the question.
 */
export function withPageContext(text: string, ctx: PageContext | null): string {
  if (!ctx || BLOCK_AT_END.test(text)) return text;
  return `${text.trimEnd()}\n\n${formatPageContextBlock(ctx)}`;
}

/**
 * A conversation title without the page block. The API titles a new
 * conversation with its first question (cut at 500 characters, so the block
 * may be cut too) until the generated title replaces it.
 */
export function stripPageContextFromTitle(title: string): string {
  return title.replace(/\s*<page_context\b[\s\S]*$/, '');
}

/** A stored question split back into the user's text and the page label. */
export function splitPageContext(text: string): { text: string; pageTitle: string | null } {
  const match = BLOCK_AT_END.exec(text);
  if (!match) return { text, pageTitle: null };
  const title = /\btitle="([^"]*)"/.exec(match[0])?.[1] ?? '';
  return { text: text.slice(0, match.index), pageTitle: title || null };
}
