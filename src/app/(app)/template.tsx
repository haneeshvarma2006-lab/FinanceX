import { ViewTransition } from 'react';

/**
 * Every screen change animates. A template remounts on each navigation (a
 * layout does not), so the screen leaving and the screen arriving are two
 * different elements and each gets its own animation.
 *
 * The nav tags each link with the direction of travel along the tab row:
 * forward slides the new screen in from the right, back from the left. A
 * navigation with no direction (the browser's back button, a redirect after
 * a form) cross-fades instead. Updates within one screen — a refresh after
 * saving, data arriving behind a skeleton — never animate here; the cascade
 * in globals.css handles those.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition
      enter={{ 'nav-forward': 'nav-forward', 'nav-back': 'nav-back', default: 'page-fade' }}
      exit={{ 'nav-forward': 'nav-forward', 'nav-back': 'nav-back', default: 'page-fade' }}
      default="none"
    >
      {children}
    </ViewTransition>
  );
}
