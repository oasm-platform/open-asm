import { createAuthClient } from 'better-auth/react';
import { adminClient } from 'better-auth/client/plugins';
import type { User as BetterAuthUser } from 'better-auth';

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [adminClient()],
});

export const { useSession } = authClient;
export type User = BetterAuthUser & {
  role: string;
  banned: boolean;
  banReason: string;
  banExpires: Date;
};
