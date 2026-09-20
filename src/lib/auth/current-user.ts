import { cache } from 'react';
import { redirect } from 'next/navigation';
import { resolveSession } from '@/modules/identity/service';
import type { User } from '@/modules/identity/schema';
import { readSessionCookie } from './cookies';

/**
 * Memoised for the lifetime of one request, so a layout, a page, and three
 * components asking who is signed in cost one database lookup rather than five.
 */
export const getCurrentUser = cache(async (): Promise<User | undefined> => {
  const token = await readSessionCookie();
  if (!token) return undefined;
  return resolveSession(token);
});

/**
 * The gate every authenticated surface goes through.
 *
 * It returns a User rather than a boolean specifically so that downstream code
 * has to hold a real user id to do anything — which is what makes the
 * "every repository call takes a userId" rule enforceable rather than a wish.
 */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  return user;
}
