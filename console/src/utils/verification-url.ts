/**
 * Where an email verification link lands once the API confirms the address:
 * the sign-in page, carrying `redirect` so the first sign-in after approval
 * still ends where the person started. Absolute, since the link is served by
 * the API's own origin.
 */
export const verificationCallbackURL = (redirect?: string): string => {
  const url = new URL('/login', window.location.origin);
  url.searchParams.set('verified', '1');
  if (redirect) url.searchParams.set('redirect', redirect);
  return url.toString();
};
