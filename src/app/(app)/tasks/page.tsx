import type { Metadata } from 'next';
import { CheckSquare } from 'lucide-react';
import { requireUser } from '@/lib/auth/current-user';
import { paginate, paginationSchema, searchSchema, sortSchema } from '@/lib/query';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { PageHeader } from '@/components/ui/money';
import * as repo from '@/modules/productivity/repository';
import { TASK_SORT_COLUMNS } from '@/modules/productivity/repository';
import { currentInstant } from '@/lib/clock';
import { AddTaskForm, TaskFilters, TaskList } from './views';
import { Pagination } from '@/components/ui/pagination';

export const metadata: Metadata = { title: 'Tasks' };

const taskSort = sortSchema(TASK_SORT_COLUMNS, 'createdAt');

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  // Read once, outside the component tree, and handed to the client list so
  // the server and hydrating client agree on what is overdue.
  const renderedAt = currentInstant();

  // Every query parameter is parsed, bounded and allow-listed before it can
  // reach a query builder.
  const pagination = paginationSchema.parse(params);
  const { q } = searchSchema.parse(params);
  const { sort, direction } = taskSort.parse(params);

  const showDone = params.status === 'done';
  const status = showDone ? ['done'] : ['todo', 'doing'];

  const filter = {
    status,
    search: q,
    sort,
    direction,
    projectId: typeof params.project === 'string' ? params.project : undefined,
  };

  const [items, total, projects] = await Promise.all([
    repo.listTasks(user.id, {
      ...filter,
      limit: pagination.pageSize,
      offset: (pagination.page - 1) * pagination.pageSize,
    }),
    repo.countTasks(user.id, filter),
    repo.listProjects(user.id),
  ]);

  const page = paginate(items, total, pagination);
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const filtered = Boolean(q || params.project);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Tasks" description="What you have decided to do, and when." />

      <Card>
        <CardHeader title="Add a task" />
        <CardBody>
          <AddTaskForm projects={projects} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={showDone ? 'Completed' : 'Open tasks'}
          description={`${total} ${total === 1 ? 'task' : 'tasks'}`}
        />

        <CardBody className="border-b border-border-subtle">
          <TaskFilters projects={projects} />
        </CardBody>

        <CardBody className="p-0">
          {page.items.length === 0 ? (
            filtered ? (
              <EmptyState
                title="Nothing matches"
                description="No task matches these filters. Try a different search, or clear the filters."
              />
            ) : showDone ? (
              <EmptyState
                title="Nothing completed yet"
                description="Tasks you finish will be listed here, so you can see what a week actually contained."
              />
            ) : (
              <EmptyState
                icon={<CheckSquare aria-hidden className="size-5" />}
                title="No open tasks"
                description="Add the one thing you most want to get done today. Everything else can wait until it exists."
              />
            )
          ) : (
            <TaskList
              tasks={page.items}
              projectName={projectName}
              showDone={showDone}
              renderedAt={renderedAt}
            />
          )}
        </CardBody>

        {page.totalPages > 1 && (
          <CardBody className="border-t border-border-subtle">
            <Pagination page={page} />
          </CardBody>
        )}
      </Card>
    </div>
  );
}
