import { ViewTransition } from 'react';

/**
 * Moving between the site's areas — the front page, signing in, the app —
 * cross-fades rather than cutting. Tab switches inside the app never reach
 * this template (the app's own template handles them), because a template
 * only remounts when the segment directly beneath it changes.
 */
export default function RootTemplate({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="page-fade" exit="page-fade" default="none">
      {children}
    </ViewTransition>
  );
}
