'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { BellRing, Check, Download, Share, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Toast } from '@/components/ui/sheet';
import {
  installState,
  promptInstall,
  subscribeInstall,
  type InstallState,
} from '@/components/pwa/install-prompt';
import { PUSH_ENDPOINT_KEY } from '@/components/pwa/service-worker';
import { subscribePushAction, testPushAction, unsubscribePushAction } from './push-actions';

type Status =
  | 'checking'
  /** The server has no push keys. */
  | 'off-server'
  /** This browser has no push at all. */
  | 'unsupported'
  /** An iPhone that has not added the app to its Home Screen yet. */
  | 'needs-install'
  | 'blocked'
  | 'off'
  | 'on';

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const left = new Uint8Array(a);
  return left.length === b.length && left.every((v, i) => v === b[i]);
}

async function detect(publicKey: string | null, known: readonly string[]): Promise<Status> {
  if (!publicKey) return 'off-server';
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true;
  if (
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    return ios && !standalone ? 'needs-install' : 'unsupported';
  }
  if (Notification.permission === 'denied') return 'blocked';
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  const subscription = await registration.pushManager.getSubscription();
  // On only when this browser is subscribed and the server still has it.
  return subscription && known.includes(subscription.endpoint) ? 'on' : 'off';
}

/**
 * "NestedFlow on this phone": install the app, and turn on notifications
 * that arrive even when it is closed.
 */
export function DevicePush({
  publicKey,
  knownEndpoints,
}: {
  publicKey: string | null;
  /** This person's devices with push on, as the server has them. */
  knownEndpoints: string[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('checking');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const install = useSyncExternalStore<InstallState>(
    subscribeInstall,
    installState,
    () => 'unavailable',
  );
  const knownKey = knownEndpoints.join('\n');

  useEffect(() => {
    let alive = true;
    void detect(publicKey, knownKey ? knownKey.split('\n') : [])
      .catch((): Status => 'unsupported')
      .then((next) => {
        if (alive) setStatus(next);
      });
    return () => {
      alive = false;
    };
  }, [publicKey, knownKey]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function turnOn() {
    if (!publicKey) return;
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'blocked' : 'off');
        if (permission !== 'denied') setMessage('Allow notifications when the browser asks.');
        return;
      }
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      const key = keyBytes(publicKey);
      let subscription = await registration.pushManager.getSubscription();
      // A subscription made with an older server key cannot be reused.
      if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
        await subscription.unsubscribe();
        subscription = null;
      }
      subscription ??= await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });
      const json = subscription.toJSON();
      const result = await subscribePushAction({ endpoint: json.endpoint, keys: json.keys });
      if (!result.ok) {
        await subscription.unsubscribe();
        setMessage(result.message);
        return;
      }
      localStorage.setItem(PUSH_ENDPOINT_KEY, subscription.endpoint);
      setStatus('on');
      setToast('Notifications are on for this device');
      router.refresh();
    } catch {
      setMessage('This browser could not turn notifications on. Try again, or use Chrome.');
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await unsubscribePushAction(endpoint);
      }
      localStorage.removeItem(PUSH_ENDPOINT_KEY);
      setStatus('off');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await testPushAction();
      if (result.ok) setToast('Sent. It should appear in a few seconds.');
      else setMessage(result.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col divide-y divide-border-subtle">
      {/* ------------------------------------------------------- install */}
      <section aria-labelledby="device-install" className="flex flex-col gap-3 px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-overlay text-text-secondary">
            <Smartphone aria-hidden className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 id="device-install" className="text-sm font-semibold text-text-primary">
              Install the app
            </h3>
            <p className="mt-0.5 text-xs text-pretty text-text-secondary">
              {install === 'installed'
                ? 'You are using the installed app.'
                : install === 'available'
                  ? 'Add NestedFlow to your home screen: it opens full screen, like any app.'
                  : install === 'ios'
                    ? 'On iPhone: tap Share, then Add to Home Screen, then open NestedFlow from there.'
                    : 'On your phone, open this site in Chrome and choose Install app from the ⋮ menu.'}
            </p>
          </div>
          {install === 'installed' && (
            <Check aria-label="Installed" className="mt-1 size-4 shrink-0 text-positive" />
          )}
          {install === 'ios' && (
            <Share aria-hidden className="mt-1 size-4 shrink-0 text-text-muted" />
          )}
        </div>
        {install === 'available' && (
          <Button
            type="button"
            variant="secondary"
            className="self-start"
            onClick={() => void promptInstall()}
          >
            <Download aria-hidden className="size-4" />
            Install app
          </Button>
        )}
      </section>

      {/* ------------------------------------------------------- push */}
      <section aria-labelledby="device-push" className="flex flex-col gap-3 px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-overlay text-text-secondary">
            <BellRing aria-hidden className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 id="device-push" className="text-sm font-semibold text-text-primary">
              Notifications on this device
            </h3>
            <p role="status" className="mt-0.5 text-xs text-pretty text-text-secondary">
              {status === 'checking'
                ? 'Checking this device…'
                : status === 'off-server'
                  ? 'Not set up on this server yet. In-app notifications still work.'
                  : status === 'unsupported'
                    ? 'This browser cannot receive push notifications. Chrome, Edge, Firefox and Samsung Internet can.'
                    : status === 'needs-install'
                      ? 'On iPhone, install the app first (above), then turn this on from the installed app.'
                      : status === 'blocked'
                        ? 'Blocked for this site. Allow notifications in your browser’s site settings, then come back.'
                        : status === 'on'
                          ? 'On. Bill reminders, price alerts and the rest arrive here, even with the app closed.'
                          : 'Off. Turn on to get bill reminders and price alerts even with the app closed.'}
            </p>
          </div>
        </div>
        {message && (
          <p role="alert" className="text-xs text-negative">
            {message}
          </p>
        )}
        {(status === 'off' || status === 'on') && (
          <div className="flex flex-wrap gap-2">
            {status === 'off' ? (
              <Button type="button" onClick={() => void turnOn()} loading={busy}>
                Turn on
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void test()}
                  loading={busy}
                >
                  Send a test
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void turnOff()}
                  disabled={busy}
                >
                  Turn off on this device
                </Button>
              </>
            )}
          </div>
        )}
      </section>

      {toast && <Toast message={toast} icon={<BellRing aria-hidden />} />}
    </div>
  );
}
