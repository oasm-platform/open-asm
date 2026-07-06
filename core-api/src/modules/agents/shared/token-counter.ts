const DEFAULT_CHARS_PER_TOKEN = 4;
const MIN_TOKENS = 1;

/**
 * TokenCounter provides token estimation for conversation context.
 *
 * Uses character-count-based estimation with a conservative ratio
 * (~4 chars per token for mixed English/Vietnamese text).
 * Can be upgraded to tiktoken for higher accuracy when needed.
 */
export class TokenCounter {
  /**
   * Estimates the number of tokens in a given text string.
   * Falls back to character-count estimation when tiktoken is unavailable.
   */
  static estimate(text: string): number {
    if (!text) return 0;

    // Use a conservative ratio: ~4 characters per token.
    // This is a rough but safe over-estimate for most languages.
    const tokenCount = Math.ceil(text.length / DEFAULT_CHARS_PER_TOKEN);
    return Math.max(tokenCount, MIN_TOKENS);
  }

  /**
   * Estimates tokens for an array of text parts joined by separator.
   * Useful for estimating total tokens from contextParts array.
   */
  static estimateParts(
    parts: string[],
    separator = '\n\n',
  ): number {
    if (!parts.length) return 0;
    const joined = parts.join(separator);
    return TokenCounter.estimate(joined);
  }
}
