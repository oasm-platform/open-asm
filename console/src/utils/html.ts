const BLOCK_BOUNDARY =
  /<\s*\/?\s*(?:br|p|div|li|ul|ol|tr|table|h[1-6]|section|article)\b[^>]*>/gi;
const ANY_TAG = /<[^>]*>/g;
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

/**
 * Renders scanner-provided HTML (e.g. Acunetix/Nessus descriptions and
 * remediation blocks) as safe plain text: block tags become line breaks,
 * every remaining tag is dropped, and entities are decoded. No raw HTML is
 * ever injected into the DOM.
 */
export function htmlToPlainText(input?: string | null): string {
  if (!input) return '';
  const text = input
    .replace(BLOCK_BOUNDARY, '\n')
    .replace(ANY_TAG, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) => fromCodePoint(parseInt(dec, 10)))
    .replace(/&[a-z]+;/gi, (m) => NAMED_ENTITIES[m.toLowerCase()] ?? m);
  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
