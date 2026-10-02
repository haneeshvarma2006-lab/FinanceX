import { ViewTransition } from 'react';

/** Switching between the account forms cross-fades inside the card. */
export default function AuthTemplate({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="page-fade" exit="page-fade" default="none">
      {children}
    </ViewTransition>
  );
}
