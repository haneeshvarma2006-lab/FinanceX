import { SegmentTabs } from '@/components/ui/segment-tabs';

const TABS = [
  { href: '/tasks', label: 'Tasks' },
  { href: '/tasks/goals', label: 'Goals' },
] as const;

/** Tasks and the goals they serve, side by side as two tabs of one section. */
export function TasksTabs() {
  return <SegmentTabs tabs={TABS} label="Tasks sections" pillId="tasks-tab" />;
}
