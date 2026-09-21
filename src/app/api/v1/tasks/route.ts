import { authenticated, readBody } from '@/lib/api/handler';
import { ok } from '@/lib/result';
import { paginate, paginationSchema, searchSchema, sortSchema } from '@/lib/query';
import * as repo from '@/modules/productivity/repository';
import { TASK_SORT_COLUMNS } from '@/modules/productivity/repository';
import * as productivity from '@/modules/productivity/service';
import { taskSchema } from '@/modules/productivity/validators';

const taskSort = sortSchema(TASK_SORT_COLUMNS, 'createdAt');

export const GET = authenticated(async ({ user, request }) => {
  const params = Object.fromEntries(new URL(request.url).searchParams);

  // The same bounded, allow-listed query primitives the web pages use.
  const pagination = paginationSchema.parse(params);
  const { q } = searchSchema.parse(params);
  const { sort, direction } = taskSort.parse(params);

  const filter = {
    status: params.status === 'done' ? ['done'] : ['todo', 'doing'],
    search: q,
    sort,
    direction,
    ...(params.project ? { projectId: params.project } : {}),
  };

  const [items, total] = await Promise.all([
    repo.listTasks(user.id, {
      ...filter,
      limit: pagination.pageSize,
      offset: (pagination.page - 1) * pagination.pageSize,
    }),
    repo.countTasks(user.id, filter),
  ]);

  return ok(paginate(items, total, pagination));
});

export const POST = authenticated(async ({ user, request }) => {
  const body = await readBody(request, taskSchema);
  if (!body.ok) return body;

  // Straight to the service the web uses — recurrence, ownership checks and
  // validation all happen there, once.
  return productivity.createTask(user.id, body.value);
});
