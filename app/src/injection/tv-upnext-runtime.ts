/**
 * Android-TV-only compatibility guard for the live Movix site.
 *
 * The WebView loads a remotely deployed React app, so a frontend fix alone
 * is not guaranteed to reach an installed APK. Until the live site's source
 * is deployed, the APK hides an early wide UpNext panel without removing any
 * React-owned DOM nodes. Only the existing panel and its own veil are touched.
 */
export function buildTvUpNextRuntime(): string {
  return `
(() => {
  if (window.__MOVIX_TV_UPNEXT_GUARD_READY) return;
  window.__MOVIX_TV_UPNEXT_GUARD_READY = true;
  let lastFocusedPanel = null;

  const playerRoot = () => document.querySelector('[data-hls-player-root]');
  const getPanel = (root) => {
    if (!root) return null;
    return Array.from(root.querySelectorAll('[data-player-controls]')).find((node) => (
      node instanceof HTMLElement
      && node.classList.contains('inset-y-0')
      && node.classList.contains('right-0')
      && (
        node.getAttribute('data-tv-focus-group') === 'up-next'
        || node.classList.contains('w-[38%]')
        || node.classList.contains('w-[28%]')
      )
      && node.querySelectorAll('button').length >= 2
    )) || null;
  };
  const getVeil = (panel) => {
    if (!panel) return null;
    const parent = panel.parentElement;
    if (!parent) return null;
    return Array.from(parent.children).find((node) => (
      node instanceof HTMLElement
      && node !== panel
      && node.getAttribute('aria-hidden') === 'true'
      && node.classList.contains('inset-y-0')
      && node.classList.contains('right-0')
      && node.classList.contains('bg-gradient-to-l')
    )) || null;
  };
  const explicitlyAllowsEarlier = (limit) => {
    try {
      const raw = window.localStorage.getItem('playerNextContent');
      if (!raw) return false;
      const pref = JSON.parse(raw);
      if (pref?.trigger === 'threshold') return true;
      if (pref?.trigger !== 'segment') return false;
      if (pref.thresholdMode === 'timeBeforeEnd') {
        return Number(pref.timeBeforeEnd) > limit;
      }
      return pref.thresholdMode === 'percentage' && Number(pref.percentage) < 95;
    } catch { return false; }
  };

  const tick = () => {
    if (window.MOVIX_TV !== true) return;
    const root = playerRoot();
    const panel = getPanel(root);
    if (!panel) { lastFocusedPanel = null; return; }

    const video = root.querySelector('video');
    const duration = video ? Number(video.duration) : NaN;
    const currentTime = video ? Number(video.currentTime) : NaN;
    const reliableTime = Number.isFinite(duration) && duration > 0
      && Number.isFinite(currentTime) && currentTime >= 0;
    const limit = duration < 35 * 60 ? 30 : 60;
    const hideEarly = reliableTime && (duration - currentTime > limit)
      && !explicitlyAllowsEarlier(limit);
    const veil = getVeil(panel);

    // The older remote version uses a 38% column with a 62% veil.
    // Keep the content available and simply correct its geometry.
    panel.style.setProperty('width', 'min(28%, 360px)', 'important');
    panel.style.setProperty('min-width', '270px', 'important');
    panel.style.setProperty('max-width', '360px', 'important');
    if (veil) veil.style.setProperty('width', '45%', 'important');

    if (hideEarly) {
      panel.style.setProperty('display', 'none', 'important');
      panel.setAttribute('data-tv-ignore-focus', '');
      panel.setAttribute('aria-hidden', 'true');
      if (veil) veil.style.setProperty('display', 'none', 'important');
      lastFocusedPanel = null;
      return;
    }
    if (panel.style.getPropertyValue('display') === 'none') {
      panel.style.removeProperty('display');
      panel.removeAttribute('data-tv-ignore-focus');
      panel.removeAttribute('aria-hidden');
    }
    if (veil && veil.style.getPropertyValue('display') === 'none') {
      veil.style.removeProperty('display');
    }

    // Focus only on first reveal, never steal focus every 700ms.
    if (lastFocusedPanel !== panel) {
      lastFocusedPanel = panel;
      const buttons = panel.querySelectorAll('button');
      const later = buttons[buttons.length - 1];
      if (later && typeof later.focus === 'function') {
        try { later.focus({ preventScroll: true }); }
        catch { later.focus(); }
      }
    }
  };

  // No MutationObserver storm during HLS playback: a light interval suffices.
  window.setInterval(tick, 700);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tick, { once: true });
  } else { tick(); }
})();
true;
`;
}
