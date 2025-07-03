import { customAlphabet } from 'nanoid';

const alphabet =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Generates a random token string using a specific alphabet and length.
 * @returns A randomly generated token string.
 */
export function generateToken(length: number): string {
  if (length === 0) {
    throw new Error('Length must be greater than 0');
  }
  const generateCustomId = customAlphabet(alphabet, length);
  return generateCustomId();
}
