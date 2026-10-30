/**
 * In-app path to land on after sign-in or sign-up, '/' by default. Only in-app
 * paths pass: an absolute URL (e.g. http://...) would be parsed as a router
 * path and 404, and a protocol-relative URL ('//host') would be an open
 * redirect.
 */
export const safeRedirectPath = (redirect?: string): string =>
  redirect?.startsWith('/') && !redirect.startsWith('//') ? redirect : '/';
