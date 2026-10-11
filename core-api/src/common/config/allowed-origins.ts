export const DEFAULT_CORS_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
];

export function parseAllowedOrigins(
  raw: string | undefined | null,
  fallback: string[] = [],
): string[] {
  const parsed = (raw ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  return parsed.length > 0 ? parsed : fallback;
}
