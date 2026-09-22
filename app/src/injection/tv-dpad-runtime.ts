export interface TVArrowTargetSnapshot {
  tagName: string;
  inputType?: string | null;
  contentEditable?: boolean;
  consumesArrows?: boolean;
  role?: string | null;
}

/**
 * Browser-independent mirror of the "do not steal arrows from editing/native
 * controls" policy used by the injected runtime.
 */
export function shouldSpatialNavigationHandleSnapshot(
  snapshot: TVArrowTargetSnapshot,
): boolean {
  if (snapshot.consumesArrows) return false;
  if (snapshot.contentEditable) return false;
  if (snapshot.role?.toLowerCase() === 'slider') return false;

  const tag = snapshot.tagName.toLowerCase();
  if (tag === 'textarea' || tag === 'select') return false;

  if (tag === 'input') {
    const type = (snapshot.inputType || 'text').toLowerCase();
    return type === 'button' || type === 'submit' || type === 'reset';
  }

  return true;
}

export function buildTvDpadRuntime(
  engineSource: string,
  domDiscoveryRuntime: string,
): string {
  return `
${domDiscoveryRuntime}
(() => {
  const api = window.__MOVIX_TV_FOCUS || (window.__MOVIX_TV_FOCUS = {});
  const findNextFocusTarget = ${engineSource};
  const directions = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
    ArrowDown: 'down',
  };

  // Re-injection can happen during WebView/document lifecycle transitions.
  // Always detach the exact previous capture listener before installing one.
  if (typeof api.keydownHandler === 'function') {
    document.removeEventListener('keydown', api.keydownHandler, true);
  }

  api.shouldSpatialNavigationHandle = (event) => {
    if (!directions[event.key]) return false;
    if (event.altKey || event.ctrlKey || event.metaKey) return false;

    const target = event.target instanceof HTMLElement
      ? event.target
      : (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    if (!target) return false;

    if (target.closest(
      '[data-tv-consume-arrows], [data-tv-player-control], [data-tv-dpad-scope="native"], [role="slider"]'
    )) {
      return false;
    }

    if (target.isContentEditable) return false;

    const tag = target.tagName.toLowerCase();
    if (tag === 'textarea' || tag === 'select') return false;

    if (tag === 'input') {
      const type = (target.getAttribute('type') || 'text').toLowerCase();
      if (type !== 'button' && type !== 'submit' && type !== 'reset') {
        return false;
      }
    }

    return true;
  };

  const toRect = (element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
    };
  };

  const pageFocusIsEmpty = () => {
    const active = document.activeElement;
    return !active || active === document.body || active === document.documentElement;
  };

  const focusKeyFor = (element) => {
    if (!(element instanceof HTMLElement)) return null;
    const explicit = element.getAttribute('data-tv-focus-id');
    if (explicit) return 'focus:' + explicit;
    if (element.id) return 'id:' + element.id;
    const primary = element.getAttribute('data-tv-primary-focus');
    if (primary) return 'primary:' + primary;
    if (element instanceof HTMLAnchorElement) {
      const href = element.getAttribute('href');
      if (href) return 'href:' + href;
    }
    return null;
  };

  const focusWithoutJank = (element, scroll = true) => {
    if (!(element instanceof HTMLElement)) return false;
    try {
      element.focus({ preventScroll: true });
    } catch {
      element.focus();
    }
    if (document.activeElement !== element) return false;
    if (scroll) {
      try {
        element.scrollIntoView({
          behavior: 'auto',
          block: 'nearest',
          inline: element.closest('[data-tv-carousel-row]') ? 'center' : 'nearest',
        });
      } catch {
        element.scrollIntoView();
      }
    }
    return true;
  };

  api.restoreLastFocus = () => {
    if (!pageFocusIsEmpty() || !api.lastFocusKey) return false;
    const match = api.getTVFocusableElements()
      .find(element => focusKeyFor(element) === api.lastFocusKey);
    return match ? focusWithoutJank(match) : false;
  };

  api.ensureInitialFocus = () => {
    if (!pageFocusIsEmpty()) return false;

    // A dialog that explicitly owns autofocus gets first refusal.
    const managedDialog = document.querySelector(
      '[role="dialog"][aria-modal="true"] [autofocus], ' +
      '[role="dialog"][aria-modal="true"][data-tv-manage-autofocus]'
    );
    if (managedDialog) return false;

    if (api.restoreLastFocus()) return true;

    const elements = api.getTVFocusableElements();
    const target =
      elements.find(element => element.hasAttribute('data-tv-autofocus')) ||
      elements.find(element => element.hasAttribute('data-tv-card')) ||
      elements.find(element => element.hasAttribute('data-tv-primary-focus')) ||
      elements[0];

    return target ? focusWithoutJank(target) : false;
  };

  api.moveFocus = (direction) => {
    const current = document.activeElement;
    if (!(current instanceof HTMLElement)) return false;

    // Discovery is deliberately performed at keypress time. React route
    // changes, lazy rows, search results and modal content are therefore
    // immediately eligible without maintaining a mutation-driven cache.
    const candidates = api.getTVFocusCandidates()
      .filter(candidate => candidate.element !== current);
    const next = findNextFocusTarget(toRect(current), candidates, direction);
    if (!next || !(next.element instanceof HTMLElement)) return false;

    try {
      next.element.focus({ preventScroll: true });
    } catch {
      next.element.focus();
    }

    const horizontalMove = direction === 'left' || direction === 'right';
    const carouselRow = next.element.closest('[data-tv-carousel-row]');

    try {
      next.element.scrollIntoView({
        behavior: 'auto',
        block: 'nearest',
        inline: horizontalMove && carouselRow ? 'center' : 'nearest',
      });
    } catch {
      next.element.scrollIntoView();
    }

    return document.activeElement === next.element;
  };

  const handleDpadKeydown = (event) => {
    if (!api.shouldSpatialNavigationHandle(event)) return false;

    const direction = directions[event.key];
    if (!direction) return false;

    // Once an arrow belongs to the TV spatial graph, consume it even when
    // the current element is already at that edge. Otherwise Chromium falls
    // back to page scrolling, which feels like a web page instead of a TV app.
    // Player/native scopes are filtered by shouldSpatialNavigationHandle above.
    api.moveFocus(direction);

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
    return true;
  };

  api.handleDpadKeydown = handleDpadKeydown;
  api.keydownHandler = handleDpadKeydown;

  if (typeof api.focusinHandler === 'function') {
    document.removeEventListener('focusin', api.focusinHandler, true);
  }
  if (api.focusObserver && typeof api.focusObserver.disconnect === 'function') {
    api.focusObserver.disconnect();
  }
  if (api.focusRecoveryRaf) {
    cancelAnimationFrame(api.focusRecoveryRaf);
    api.focusRecoveryRaf = null;
  }
  if (api.focusRecoveryTimer) {
    clearTimeout(api.focusRecoveryTimer);
    api.focusRecoveryTimer = null;
  }

  const handleFocusIn = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const key = focusKeyFor(target);
    if (key) api.lastFocusKey = key;
  };
  api.focusinHandler = handleFocusIn;

  const scheduleFocusRecovery = () => {
    if (!pageFocusIsEmpty() || api.focusRecoveryRaf || api.focusRecoveryTimer) return;

    const remainingNavigationMs =
      Number(api.navigationInProgressUntil || 0) - performance.now();

    if (remainingNavigationMs > 0) {
      api.focusRecoveryTimer = setTimeout(() => {
        api.focusRecoveryTimer = null;
        scheduleFocusRecovery();
      }, Math.min(Math.max(remainingNavigationMs, 80), 1500));
      return;
    }

    api.focusRecoveryRaf = requestAnimationFrame(() => {
      api.focusRecoveryRaf = null;
      if (!pageFocusIsEmpty()) return;
      if (!api.restoreLastFocus()) api.ensureInitialFocus();
    });
  };

  const setupFocusLifecycle = () => {
    if (typeof MutationObserver === 'function' && document.body) {
      api.focusObserver = new MutationObserver(scheduleFocusRecovery);
      api.focusObserver.observe(document.body, { childList: true, subtree: true });
    }
    requestAnimationFrame(() => {
      if (pageFocusIsEmpty()) api.ensureInitialFocus();
    });
  };

  api.destroyDpadRuntime = () => {
    if (api.keydownHandler === handleDpadKeydown) {
      document.removeEventListener('keydown', handleDpadKeydown, true);
      api.keydownHandler = null;
    }
    if (api.focusinHandler === handleFocusIn) {
      document.removeEventListener('focusin', handleFocusIn, true);
      api.focusinHandler = null;
    }
    if (api.focusObserver && typeof api.focusObserver.disconnect === 'function') {
      api.focusObserver.disconnect();
      api.focusObserver = null;
    }
    if (api.focusRecoveryRaf) {
      cancelAnimationFrame(api.focusRecoveryRaf);
      api.focusRecoveryRaf = null;
    }
    if (api.focusRecoveryTimer) {
      clearTimeout(api.focusRecoveryTimer);
      api.focusRecoveryTimer = null;
    }
  };

  document.addEventListener('keydown', handleDpadKeydown, true);
  document.addEventListener('focusin', handleFocusIn, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupFocusLifecycle, { once: true });
  } else {
    setupFocusLifecycle();
  }
})();
`;
}
