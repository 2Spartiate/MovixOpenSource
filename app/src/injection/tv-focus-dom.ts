export const TV_FOCUSABLE_SELECTOR = [
  'button',
  'a[href]',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  '[role="button"]',
  '[tabindex]',
  '[data-tv-focus]',
].join(',');

export interface TVFocusableSnapshot {
  tagName: string;
  hasHref?: boolean;
  inputType?: string | null;
  role?: string | null;
  tabIndex?: number | null;
  explicitTVFocus?: boolean;
  disabled?: boolean;
  ariaDisabled?: boolean;
  hidden?: boolean;
  ariaHidden?: boolean;
  inert?: boolean;
  ignored?: boolean;
  connected?: boolean;
  display?: string;
  visibility?: string;
  width?: number;
  height?: number;
}

/**
 * Pure policy mirror for the injected DOM discovery layer.
 * This is intentionally browser-independent so inclusion/exclusion rules are
 * unit-testable without jsdom.
 */
export function isTVFocusableSnapshot(snapshot: TVFocusableSnapshot): boolean {
  if (snapshot.ignored) return false;
  if (snapshot.disabled || snapshot.ariaDisabled) return false;
  if (snapshot.hidden || snapshot.ariaHidden || snapshot.inert) return false;
  if (snapshot.connected === false) return false;
  if (snapshot.display === 'none') return false;
  if (snapshot.visibility === 'hidden' || snapshot.visibility === 'collapse') {
    return false;
  }
  if ((snapshot.width ?? 1) <= 0 || (snapshot.height ?? 1) <= 0) return false;
  if (snapshot.tabIndex != null && snapshot.tabIndex < 0) return false;

  const tag = snapshot.tagName.toLowerCase();
  if (tag === 'input' && snapshot.inputType?.toLowerCase() === 'hidden') {
    return false;
  }

  if (snapshot.explicitTVFocus) return true;
  if (tag === 'button' || tag === 'select' || tag === 'textarea') return true;
  if (tag === 'input') return true;
  if (tag === 'a') return snapshot.hasHref === true;
  if (snapshot.role?.toLowerCase() === 'button') return true;
  return snapshot.tabIndex != null && snapshot.tabIndex >= 0;
}

/**
 * Runtime installed inside the Movix document. Discovery is deliberately lazy:
 * querySelectorAll + visibility geometry are recomputed on every call, so
 * React route changes, lazy rows, modals and search results need no cached
 * NodeList and no MutationObserver merely to become discoverable.
 */
export function buildTvDomDiscoveryRuntime(): string {
  const selector = JSON.stringify(TV_FOCUSABLE_SELECTOR);
  return `
(() => {
  const api = window.__MOVIX_TV_FOCUS || (window.__MOVIX_TV_FOCUS = {});
  const selector = ${selector};

  api.getTVFocusableElements = () => {
    return Array.from(document.querySelectorAll(selector)).filter((element) => {
      if (!(element instanceof HTMLElement)) return false;
      if (!element.isConnected || !document.documentElement.contains(element)) return false;
      if (element.closest('[data-tv-ignore-focus]')) return false;
      if (element.closest('[inert]')) return false;
      if (element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
      if (element.getAttribute('aria-disabled') === 'true') return false;
      if ('disabled' in element && element.disabled === true) return false;

      const explicitTabIndex = element.getAttribute('tabindex');
      if (explicitTabIndex !== null && Number(explicitTabIndex) < 0) return false;

      const tag = element.tagName.toLowerCase();
      if (tag === 'input' && element.getAttribute('type')?.toLowerCase() === 'hidden') {
        return false;
      }

      const style = window.getComputedStyle(element);
      if (style.display === 'none') return false;
      if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;

      const rect = element.getBoundingClientRect();
      if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) return false;
      if (rect.width <= 0 || rect.height <= 0) return false;

      return true;
    });
  };

  api.getTVFocusCandidates = () => {
    return api.getTVFocusableElements().map((element) => {
      const rect = element.getBoundingClientRect();
      const group = element.closest('[data-tv-focus-group]');
      return {
        element,
        group: group?.getAttribute('data-tv-focus-group') || null,
        rect: {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          centerX: rect.left + rect.width / 2,
          centerY: rect.top + rect.height / 2,
        },
      };
    });
  };
})();
`;
}
