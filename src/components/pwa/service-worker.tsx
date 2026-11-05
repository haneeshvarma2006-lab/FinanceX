'use client';

import { useEffect } from 'react';
import { resyncPushAction } from '@/app/(app)/settings/notifications/push-actions';
import { captureInstallPrompt } from './install-prompt';

/** Where this device remembers the subscription the server last accepted. */
export const PUSH_ENDPOINT_KEY = 'nf-push-endpoint';

/**
 * Starts the service worker (push notifications, the offline page) and keeps
 * this device's push subscription current on the server.
 *
 * Browsers renew push subscriptions now and then; the worker takes the new
 * one, and the next time the app opens it replaces the old one here — but
 * only if the old one is still saved, so a device removed in settings stays
 * removed.
 */
export function ServiceWorker() {
  useEffect(() => {
    captureInstallPrompt();
    if (!('serviceWorker' in navigator)) return;
    let cancelled = false;
    void (async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        if (cancelled || !('PushManager' in window) || Notification.permission !== 'granted')
          return;
        const saved = localStorage.getItem(PUSH_ENDPOINT_KEY);
        const subscription = await registration.pushManager.getSubscription();
        if (!saved || !subscription || subscription.endpoint === saved) return;
        const json = subscription.toJSON();
        const result = await resyncPushAction(saved, { endpoint: json.endpoint, keys: json.keys });
        if (result.ok) localStorage.setItem(PUSH_ENDPOINT_KEY, subscription.endpoint);
        else localStorage.removeItem(PUSH_ENDPOINT_KEY);
      } catch {
        // No service worker (private mode, an old browser): the app works without one.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
