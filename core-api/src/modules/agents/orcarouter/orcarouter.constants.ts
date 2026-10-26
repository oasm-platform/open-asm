/**
 * OrcaRouter facts. Consent and code exchange live on `www.orcarouter.ai`;
 * inference and the catalog live on `api.orcarouter.ai/v1`. The origins are
 * resolved independently and never derived from each other.
 */
export const ORCAROUTER_PROVIDER_NAME = 'OrcaRouter Cyber Inference';
export const ORCAROUTER_DEFAULT_MODEL = 'orcarouter/auto';
export const ORCAROUTER_DEFAULT_AUTH_BASE_URL = 'https://www.orcarouter.ai';
export const ORCAROUTER_DEFAULT_API_BASE_URL = 'https://api.orcarouter.ai/v1';
/** Consent screen path; never derived from the API base. */
export const ORCAROUTER_AUTHORIZE_PATH = '/auth';
/** Auth-origin exchange path — `/v1/auth/keys` on the API origin is a 404. */
export const ORCAROUTER_EXCHANGE_PATH = '/api/v1/auth/keys';
export const ORCAROUTER_REQUIRED_SCOPE = 'api';
export const ORCAROUTER_AUTH_CODE_TTL_SECONDS = 600;

const SHARED_ENV = 'ORCA_BASE_URL';
const AUTH_ENV = 'ORCA_AUTH_BASE_URL';
const API_ENV = 'ORCA_API_BASE_URL';

export interface OrcaRouterOrigins {
  authBaseUrl: string;
  apiBaseUrl: string;
}

/** HTTPS unless loopback; no credentials, no trailing slash. */
export function normalizeOrcaRouterOrigin(raw: string, name: string): string {
  const value = raw.trim().replace(/\/+$/, '');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} is not a valid URL`);
  }
  // Whole-hostname match: `localhost.example.com` or `127.0.0.1.nip.io` are
  // remote hosts and must not get the plain-HTTP exemption.
  const host = url.hostname.toLowerCase();
  const loopback =
    host === 'localhost' ||
    host === '[::1]' ||
    /^127(?:\.\d{1,3}){3}$/.test(host);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error(`${name} must use HTTPS unless it points at loopback`);
  }
  if (url.username || url.password) {
    throw new Error(`${name} must not contain credentials`);
  }
  return value;
}

/** Explicit override → shared self-hosted base → public default. */
export function resolveOrcaRouterOrigins(
  env: NodeJS.ProcessEnv = process.env,
): OrcaRouterOrigins {
  const shared = env[SHARED_ENV]?.trim().replace(/\/+$/, '');
  const auth = env[AUTH_ENV]?.trim() || shared || ORCAROUTER_DEFAULT_AUTH_BASE_URL;
  const api =
    env[API_ENV]?.trim() ||
    (shared ? `${shared}/v1` : '') ||
    ORCAROUTER_DEFAULT_API_BASE_URL;
  return {
    authBaseUrl: normalizeOrcaRouterOrigin(auth, AUTH_ENV),
    apiBaseUrl: normalizeOrcaRouterOrigin(api, API_ENV),
  };
}
