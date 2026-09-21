import { authenticated } from '@/lib/api/handler';
import { ok } from '@/lib/result';
import * as repo from '@/modules/productivity/repository';

export const GET = authenticated(async ({ user, request }) => {
  const unreadOnly = new URL(request.url).searchParams.get('unread') === 'true';

  const [items, unread] = await Promise.all([
    repo.listNotifications(user.id, { unreadOnly, limit: 50 }),
    repo.countUnreadNotifications(user.id),
  ]);

  return ok({ items, unread });
});

export const POST = authenticated(async ({ user }) =>
  ok({ markedRead: await repo.markAllNotificationsRead(user.id) }),
);
