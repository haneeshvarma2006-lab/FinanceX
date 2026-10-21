'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BellRing } from 'lucide-react';
import { Toast } from '@/components/ui/sheet';
import { crosses, type AlertDirection } from '@/modules/markets/alerts';
import { parsePrices, pricesUrl } from '@/modules/markets/binance';
import { checkAlertsAction } from './trading/markets/actions';

type WatchedAlert = { id: string; instrumentId: string; direction: string; target: string };

const EVERY = 60_000;
/** Gold, forex and shares come from the shared cache; no need to ask often. */
const KEYED_EVERY = 5 * 60_000;

/**
 * Watches your price alerts while the app is open, on any page.
 *
 * Once a minute it reads the latest crypto prices straight from Binance's
 * public feed — no key, nothing about you sent — and when one crosses a
 * line you set, asks the server to record it. Gold, forex and shares are
 * checked by the server against the shared price cache every few minutes.
 * Phones close background tabs, so an alert is only seen while the app is
 * open; a notification on the lock screen needs the installed app.
 */
export function AlertWatcher({ alerts }: { alerts: WatchedAlert[] }) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const key = alerts.map((a) => `${a.id}:${a.target}`).join(',');

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!key) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastKeyed = 0;

    const symbols = [
      ...new Set(
        alerts.filter((a) => a.instrumentId.startsWith('bn:')).map((a) => a.instrumentId.slice(3)),
      ),
    ];
    const hasKeyed = alerts.some((a) => a.instrumentId.startsWith('td:'));

    const readCrypto = async (): Promise<Map<string, number>> => {
      if (symbols.length === 0) return new Map();
      try {
        const response = await fetch(pricesUrl(symbols), { cache: 'no-store' });
        if (response.ok) return parsePrices(await response.json());
        // One unknown coin fails the batch: fall back to asking one by one.
        const each = await Promise.all(
          symbols.map(async (s) => {
            const r = await fetch(pricesUrl([s]), { cache: 'no-store' }).catch(() => null);
            return r?.ok ? parsePrices(await r.json()) : new Map<string, number>();
          }),
        );
        return new Map(each.flatMap((m) => [...m]));
      } catch {
        return new Map();
      }
    };

    const tick = async () => {
      if (document.visibilityState === 'visible') {
        const prices = await readCrypto();
        const observed: Record<string, number> = {};
        for (const [symbol, price] of prices) observed[`bn:${symbol}`] = price;

        const cryptoHit = alerts.some(
          (a) =>
            a.instrumentId.startsWith('bn:') &&
            observed[a.instrumentId] !== undefined &&
            crosses(a.direction as AlertDirection, Number(a.target), observed[a.instrumentId]!),
        );
        const keyedDue = hasKeyed && Date.now() - lastKeyed > KEYED_EVERY;

        if (cryptoHit || keyedDue) {
          if (keyedDue) lastKeyed = Date.now();
          try {
            const fired = await checkAlertsAction(observed);
            if (!stopped && fired.length > 0) {
              setToast(
                fired.length === 1
                  ? `${fired[0]!.title}. ${fired[0]!.body}`
                  : `${fired.length} price alerts went off`,
              );
              router.refresh();
            }
          } catch {
            // Offline or signed out: try again next minute.
          }
        }
      }
      if (!stopped) timer = setTimeout(tick, EVERY);
    };
    timer = setTimeout(tick, 1500);

    return () => {
      stopped = true;
      clearTimeout(timer);
    };
    // `alerts` is captured through `key`, which changes whenever they do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return toast ? <Toast message={toast} icon={<BellRing aria-hidden />} /> : null;
}
