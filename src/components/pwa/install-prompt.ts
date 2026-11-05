'use client';

/**
 * The browser's "Install app" offer, kept so a button can use it later.
 *
 * Chrome and Edge announce that the site can be installed once, early, with
 * a `beforeinstallprompt` event; the offer has to be saved then and shown
 * from a tap. Safari has no such event — on an iPhone a web app is added
 * from the Share menu, which the settings page explains instead.
 */

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let offer: InstallEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Start listening; safe to call more than once. */
export function captureInstallPrompt(): void {
  if (typeof window === 'undefined' || (window as { __nfInstall?: boolean }).__nfInstall) return;
  (window as { __nfInstall?: boolean }).__nfInstall = true;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    offer = event as InstallEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    offer = null;
    installed = true;
    emit();
  });
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export type InstallState = 'installed' | 'available' | 'ios' | 'unavailable';

/** Where the person stands: already in the app, offered it, on an iPhone, or neither. */
export function installState(): InstallState {
  if (typeof window === 'undefined') return 'unavailable';
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true;
  if (installed || standalone) return 'installed';
  if (offer) return 'available';
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) return 'ios';
  return 'unavailable';
}

/** Show the browser's install dialog; true if the person accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!offer) return false;
  const current = offer;
  offer = null;
  await current.prompt();
  const choice = await current.userChoice;
  if (choice.outcome === 'accepted') installed = true;
  emit();
  return choice.outcome === 'accepted';
}
