'use client';

import { useActionState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Check, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FormAlert, SelectField, TextareaField } from '@/components/ui/form';
import { Badge } from '@/components/ui/money';
import { cn } from '@/lib/cn';
import { setParam } from '@/lib/navigation';
import { PRIORITY_LABELS } from '@/modules/productivity/validators';
import { SUPPORTED_FREQUENCIES } from '@/modules/productivity/recurrence';
import {
  completeTaskAction,
  createTaskAction,
  deleteTaskAction,
  reopenTaskAction,
  type FormState,
} from './actions';

type Project = { id: string; name: string };
type Task = {
  id: string;
  title: string;
  notes: string | null;
  status: string;
  priority: number;
  dueAt: Date | null;
  scheduledFor: string | null;
  projectId: string | null;
  rrule: string | null;
};

const PRIORITY_TONE = {
  1: 'negative',
  2: 'warning',
  3: 'neutral',
  4: 'neutral',
} as const;

export function AddTaskForm({ projects }: { projects: Project[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createTaskAction, {});

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.message && (
        <FormAlert tone={state.tone === 'success' ? 'success' : 'error'}>{state.message}</FormAlert>
      )}

      <Field
        label="What needs doing?"
        name="title"
        required
        maxLength={240}
        error={state.fieldErrors?.title}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField label="Priority" name="priority" defaultValue="3">
          {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>

        <Field
          label="Do it on"
          name="scheduledFor"
          type="date"
          hint="The day you plan to do it."
          error={state.fieldErrors?.scheduledFor}
        />

        <Field
          label="Due by"
          name="dueAt"
          type="datetime-local"
          hint="A hard deadline, if there is one."
          error={state.fieldErrors?.dueAt}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField label="Project" name="projectId">
          <option value="">None</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </SelectField>

        <SelectField
          label="Repeat"
          name="repeat"
          hint="The next one is created when you complete this."
          error={state.fieldErrors?.repeat}
        >
          <option value="">Does not repeat</option>
          {SUPPORTED_FREQUENCIES.map((f) => (
            <option key={f} value={f} className="capitalize">
              {f}
            </option>
          ))}
        </SelectField>

        <Field
          label="Every"
          name="repeatInterval"
          type="number"
          min="1"
          max="365"
          defaultValue="1"
          hint="1 = every time."
        />
      </div>

      <TextareaField label="Notes" name="notes" rows={2} maxLength={4000} />

      <Button type="submit" loading={pending}>
        Add task
      </Button>
    </form>
  );
}

export function TaskFilters({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  /** Changing a filter always resets to page 1, or the user lands on an empty page. */
  function update(key: string, value: string) {
    setParam(router, pathname, searchParams, key, value);
  }

  const status = searchParams.get('status') ?? 'open';

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-48 flex-1">
        <label htmlFor="task-search" className="mb-1.5 block text-sm text-text-secondary">
          Search
        </label>
        <input
          id="task-search"
          type="search"
          defaultValue={searchParams.get('q') ?? ''}
          placeholder="Title or notes"
          onChange={(event) => {
            const value = event.target.value;
            // Debounced by the browser's own input cadence is not enough; a
            // short timer keeps this from firing a navigation per keystroke.
            window.clearTimeout((window as unknown as { __kylixSearch?: number }).__kylixSearch);
            (window as unknown as { __kylixSearch?: number }).__kylixSearch = window.setTimeout(
              () => update('q', value),
              300,
            );
          }}
          className="w-full rounded-[var(--radius-control)] border border-border-subtle bg-surface-inset px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
        />
      </div>

      <div>
        <label htmlFor="task-status" className="mb-1.5 block text-sm text-text-secondary">
          Show
        </label>
        <select
          id="task-status"
          value={status}
          onChange={(event) => update('status', event.target.value === 'open' ? '' : 'done')}
          className="rounded-[var(--radius-control)] border border-border-subtle bg-surface-inset px-3 py-2 text-sm text-text-primary"
        >
          <option value="open">Open</option>
          <option value="done">Completed</option>
        </select>
      </div>

      {projects.length > 0 && (
        <div>
          <label htmlFor="task-project" className="mb-1.5 block text-sm text-text-secondary">
            Project
          </label>
          <select
            id="task-project"
            defaultValue={searchParams.get('project') ?? ''}
            onChange={(event) => update('project', event.target.value)}
            className="rounded-[var(--radius-control)] border border-border-subtle bg-surface-inset px-3 py-2 text-sm text-text-primary"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="task-sort" className="mb-1.5 block text-sm text-text-secondary">
          Sort by
        </label>
        <select
          id="task-sort"
          defaultValue={searchParams.get('sort') ?? 'createdAt'}
          onChange={(event) => update('sort', event.target.value)}
          className="rounded-[var(--radius-control)] border border-border-subtle bg-surface-inset px-3 py-2 text-sm text-text-primary"
        >
          <option value="createdAt">Recently added</option>
          <option value="dueAt">Due date</option>
          <option value="scheduledFor">Scheduled day</option>
          <option value="priority">Priority</option>
          <option value="title">Title</option>
        </select>
      </div>
    </div>
  );
}

function CompleteButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(completeTaskAction, {});

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        loading={pending}
        aria-label="Mark complete"
      >
        <Check aria-hidden className="size-3.5" />
        Done
      </Button>
      {state.message && state.tone === 'success' && (
        <span role="status" className="text-xs text-positive">
          {state.message}
        </span>
      )}
      {state.tone === 'error' && (
        <span role="alert" className="text-xs text-negative">
          {state.message}
        </span>
      )}
    </form>
  );
}

function ReopenButton({ id }: { id: string }) {
  const [, action, pending] = useActionState<FormState, FormData>(reopenTaskAction, {});

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="sm" loading={pending} aria-label="Reopen task">
        <RotateCcw aria-hidden className="size-3.5" />
        Reopen
      </Button>
    </form>
  );
}

function DeleteButton({ id }: { id: string }) {
  const [, action, pending] = useActionState<FormState, FormData>(deleteTaskAction, {});

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="sm" loading={pending} aria-label="Delete task">
        <Trash2 aria-hidden className="size-3.5" />
      </Button>
    </form>
  );
}

export function TaskList({
  tasks,
  projectName,
  showDone,
  renderedAt,
}: {
  tasks: Task[];
  projectName: Map<string, string>;
  showDone: boolean;
  /**
   * The server's clock, passed in rather than read here.
   *
   * Reading the clock during render is impure, and in a client component it
   * also means the server and the hydrating client can disagree about which
   * tasks are overdue — a hydration mismatch that React would then have to
   * reconcile. One timestamp from the server keeps both renders identical.
   */
  renderedAt: number;
}) {
  return (
    <ul className="divide-y divide-border-subtle">
      {tasks.map((task) => {
        const overdue =
          !showDone && task.dueAt !== null && new Date(task.dueAt).getTime() < renderedAt;

        return (
          <li key={task.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'flex flex-wrap items-center gap-2 text-sm',
                  showDone ? 'text-text-muted line-through' : 'text-text-primary',
                )}
              >
                {task.title}
                {task.priority <= 2 && (
                  <Badge tone={PRIORITY_TONE[task.priority as 1 | 2]}>
                    {PRIORITY_LABELS[task.priority as 1 | 2]}
                  </Badge>
                )}
                {task.rrule && <Badge>repeats</Badge>}
                {overdue && <Badge tone="negative">Overdue</Badge>}
              </p>

              {(task.scheduledFor || task.dueAt || task.projectId) && (
                <p className="numeric mt-1 text-xs text-text-muted">
                  {task.scheduledFor ? `for ${task.scheduledFor}` : ''}
                  {task.dueAt
                    ? `${task.scheduledFor ? ' · ' : ''}due ${new Date(task.dueAt)
                        .toISOString()
                        .slice(0, 16)
                        .replace('T', ' ')}`
                    : ''}
                  {task.projectId
                    ? `${task.scheduledFor || task.dueAt ? ' · ' : ''}${projectName.get(task.projectId) ?? ''}`
                    : ''}
                </p>
              )}

              {task.notes && (
                <p className="mt-1 text-xs text-pretty text-text-secondary">{task.notes}</p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {showDone ? <ReopenButton id={task.id} /> : <CompleteButton id={task.id} />}
              <DeleteButton id={task.id} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
