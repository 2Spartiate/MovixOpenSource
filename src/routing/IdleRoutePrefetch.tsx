import { useEffect } from 'react';
import { useLightMode } from '@/context/LightModeContext';
import { ROUTES } from './registry';

const IDLE_ROUTES = new Set(['/movies', '/tv-shows', '/anime', '/search']);

/** Réserve le téléchargement spéculatif aux appareils en mode normal. */
export function IdleRoutePrefetch() {
  const { isLightMode } = useLightMode();
  useEffect(() => {
    if (isLightMode || (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
    let cancelled = false;
    let idleId: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      if (cancelled) return;
      for (const route of ROUTES) {
        if (IDLE_ROUTES.has(route.path)) void route.loader({ silent: true }).catch(() => {});
      }
    };
    const schedule = () => {
      if (window.requestIdleCallback) idleId = window.requestIdleCallback(load);
      else timer = setTimeout(load, 8000);
    };
    if (document.readyState === 'complete') schedule();
    else window.addEventListener('load', schedule, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener('load', schedule);
      if (idleId !== undefined) window.cancelIdleCallback?.(idleId);
      clearTimeout(timer);
    };
  }, [isLightMode]);
  return null;
}
