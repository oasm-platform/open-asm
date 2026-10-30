/**
 * Local development or tests. Deployed images leave NODE_ENV unset, so
 * anything else counts as deployed.
 */
export const isLocalEnv = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env.NODE_ENV === 'development' || env.NODE_ENV === 'test';
