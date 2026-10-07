import { SegmentTabs } from '@/components/ui/segment-tabs';

const TABS = [
  { href: '/notes', label: 'Diary' },
  { href: '/notes/decisions', label: 'Decisions' },
] as const;

export function NotesTabs() {
  return <SegmentTabs tabs={TABS} label="Notes sections" pillId="notes-tab" />;
}
