const BLOCK_BOUNDARY =
  /<\s*\/?\s*(?:br|p|div|li|ul|ol|tr|table|h[1-6]|section|article)\b[^>]*>/gi;
const ANY_TAG = /<[^>]*>/g;
const ANGLE_BRACKETS = /[<>]/g;
const NAMED_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
};

function fromCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '';
  return String.fromCodePoint(code);
}

function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) => fromCodePoint(parseInt(dec, 10)))
    .replace(/&[a-z]+;/gi, (m) => NAMED_ENTITIES[m.toLowerCase()] ?? m);
}

/**
 * Renders scanner-provided HTML (e.g. Acunetix/Nessus descriptions and
 * remediation blocks) as safe plain text: block tags become line breaks,
 * every remaining tag is dropped, entities are decoded, and no angle bracket
 * survives the transformation. No raw HTML is ever injected into the DOM.
 */
export function htmlToPlainText(input?: string | null): string {
  if (!input) return '';

  // Entities are decoded first: an encoded tag (`&lt;script&gt;`) must not be
  // able to re-form after the tag strip has already run.
  const decoded = decodeEntities(input);

  // Strip to a fixed point — a single pass leaves a tag behind for crafted
  // input such as `<<script>script>`.
  let text = decoded.replace(BLOCK_BOUNDARY, '\n');
  let previous: string;
  do {
    previous = text;
    text = text.replace(ANY_TAG, '');
  } while (text !== previous);

  return (
    text
      // Belt-and-braces: no `<` / `>` can reach a downstream HTML sink.
      .replace(ANGLE_BRACKETS, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}
