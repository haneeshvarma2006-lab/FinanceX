import { z } from 'zod';
import { authenticated, readBody } from '@/lib/api/handler';
import { notFound } from '@/lib/result';
import * as productivity from '@/modules/productivity/service';

const bodySchema = z.object({
  value: z.string().trim().min(1).max(32),
  note: z.string().trim().max(500).optional(),
});

/** A checkpoint is a creation, which is why it is safe to queue offline. */
export const POST = authenticated(async ({ user, request, params }) => {
  const id = params.id;
  if (!id) return notFound();

  const body = await readBody(request, bodySchema);
  if (!body.ok) return body;

  return productivity.recordCheckpoint(user.id, { goalId: id, ...body.value });
});
