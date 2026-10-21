'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/current-user';
import { getEnv } from '@/lib/env';

/** The setup guide's "Hide" button: this browser stops showing it. */
export async function hideSetupGuide(): Promise<void> {
  const user = await requireUser();
  (await cookies()).set(`nf-setup-hidden-${user.id.slice(0, 8)}`, '1', {
    httpOnly: true,
    sameSite: 'lax',
    secure: getEnv().APP_URL.startsWith('https://'),
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath('/today');
}
