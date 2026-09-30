import { useEffect, useRef } from 'react';
import { countdown } from '../lib/time';
import { toast } from '../stores/toasts';
import { useDeadlines } from './queries';
import { useNow } from './useNow';

const THRESHOLDS = [
  { key: '1h', ms: 3600e3 },
  { key: '24h', ms: 864e5 },
];

/** Toasts once per session when a pending deadline crosses 24h / 1h left. */
export function useDeadlineNudges() {
  const { data } = useDeadlines();
  const now = useNow(30_000);
  const fired = useRef(new Set<string>());

  useEffect(() => {
    for (const d of data ?? []) {
      if (d.done) continue;
      const left = d.dueAt - now;
      if (left <= 0) continue;
      const hit = THRESHOLDS.find((t) => left <= t.ms);
      if (!hit || fired.current.has(`${d.id}:${hit.key}`)) continue;
      // Crossing 1h also counts as having seen the 24h warning.
      THRESHOLDS.forEach((t) => t.ms >= hit.ms && fired.current.add(`${d.id}:${t.key}`));
      toast(`BOSS INCOMING: ${d.title} in ${countdown(left)}`, { kind: 'warn', href: '/deadlines' });
    }
  }, [data, now]);
}
