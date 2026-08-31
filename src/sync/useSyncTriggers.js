// src/sync/useSyncTriggers.js
import { useEffect } from 'react';

const PERIODIC_INTERVAL_MS = 2 * 60 * 1000;

export function useSyncTriggers(triggerSync, { enabled }) {
  useEffect(() => {
    if (!enabled) return undefined;

    const handleVisibilityChange = () => triggerSync();
    const handleOnline = () => triggerSync();
    const handleTick = () => {
      if (document.visibilityState === 'visible') triggerSync();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    const intervalId = setInterval(handleTick, PERIODIC_INTERVAL_MS);

    // Fire once immediately on mount/re-enable -- covers both the initial
    // load and "the tab was backgrounded and possibly evicted, now it's
    // back" without waiting for the first passive trigger.
    triggerSync();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      clearInterval(intervalId);
    };
  }, [triggerSync, enabled]);
}
