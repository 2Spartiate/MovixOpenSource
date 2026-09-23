export interface TVArrowTargetSnapshot {
  tagName: string;
  inputType?: string | null;
  contentEditable?: boolean;
  consumesArrows?: boolean;
  role?: string | null;
}

export interface TVCardRowSnapshot<T = unknown> {
  value: T;
  rect: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
    centerX?: number;
    centerY?: number;
  };
  rowKey: unknown;
  rowRect: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
    centerX?: number;
    centerY?: number;
  };
}

/**
 * Vertical TV navigation is row-first for poster cards.
 * The nearest row in the requested direction wins regardless of horizontal
 * alignment; only then do we choose the closest card within that row.
 */
export function findNextCardRowTarget<T>(
  currentRect: TVCardRowSnapshot<T>['rect'],
  currentRowKey: unknown,
  currentRowRect: TVCardRowSnapshot<T>['rowRect'],
  candidates: readonly TVCardRowSnapshot<T>[],
  direction: 'up' | 'down',
): TVCardRowSnapshot<T> | null {
  const centerX = (rect: TVCardRowSnapshot<T>['rect']) =>
    Number.isFinite(rect.centerX) ? rect.centerX! : rect.left + rect.width / 2;
  const centerY = (rect: TVCardRowSnapshot<T>['rowRect']) =>
    Number.isFinite(rect.centerY) ? rect.centerY! : rect.top + rect.height / 2;

  const originX = centerX(currentRect);
  const originRowY = centerY(currentRowRect);
  const sign = direction === 'down' ? 1 : -1;
  const rows = new Map<unknown, { delta: number; items: TVCardRowSnapshot<T>[] }>();

  candidates.forEach((candidate) => {
    if (candidate.rowKey === currentRowKey) return;
    const delta = (centerY(candidate.rowRect) - originRowY) * sign;
    if (!Number.isFinite(delta) || delta <= 0.5) return;

    const existing = rows.get(candidate.rowKey);
    if (existing) {
      existing.items.push(candidate);
      if (delta < existing.delta) existing.delta = delta;
    } else {
      rows.set(candidate.rowKey, { delta, items: [candidate] });
    }
  });

  const nearestRow = Array.from(rows.values())
    .sort((a, b) => a.delta - b.delta)[0];
  if (!nearestRow) return null;

  return nearestRow.items
    .map((candidate, index) => ({
      candidate,
      index,
      horizontalDistance: Math.abs(centerX(candidate.rect) - originX),
      left: candidate.rect.left,
    }))
    .sort((a, b) =>
      a.horizontalDistance - b.horizontalDistance ||
      a.left - b.left ||
      a.index - b.index
    )[0]?.candidate ?? null;
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
  const findNextCardRowTarget = ${findNextCardRowTarget.toString()};
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

  const centerVerticalTarget = (element) => {
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();

    let scroller = element.parentElement;
    while (
      scroller &&
      scroller !== document.body &&
      scroller !== document.documentElement
    ) {
      const style = window.getComputedStyle(scroller);
      const canScroll = scroller.scrollHeight > scroller.clientHeight + 1;
      if (canScroll && style.overflowY !== 'visible') {
        const bounds = scroller.getBoundingClientRect();
        const delta =
          (rect.top + rect.height / 2) -
          (bounds.top + bounds.height / 2);
        const top = Math.max(0, scroller.scrollTop + delta);
        if (typeof scroller.scrollTo === 'function') {
          scroller.scrollTo({ top, left: scroller.scrollLeft, behavior: 'auto' });
        } else {
          scroller.scrollTop = top;
        }
        return true;
      }
      scroller = scroller.parentElement;
    }

    const top = Math.max(
      0,
      window.scrollY + rect.top + rect.height / 2 - window.innerHeight / 2,
    );
    try {
      window.scrollTo({ top, left: window.scrollX, behavior: 'auto' });
    } catch {
      window.scrollTo(window.scrollX, top);
    }
    return true;
  };

  const centerCarouselTarget = (element, row) => {
    if (!(element instanceof HTMLElement) || !(row instanceof HTMLElement)) {
      return false;
    }

    // Prefer a real horizontal scroll container belonging to this row. This
    // keeps left/right movement local to the carousel and never pans the page.
    const boundary = row.parentElement;
    let scroller = element.parentElement;
    while (
      scroller &&
      scroller !== document.body &&
      scroller !== document.documentElement
    ) {
      const style = window.getComputedStyle(scroller);
      const canScroll = scroller.scrollWidth > scroller.clientWidth + 1;
      if (canScroll && style.overflowX !== 'visible') {
        const rect = element.getBoundingClientRect();
        const bounds = scroller.getBoundingClientRect();
        const delta =
          (rect.left + rect.width / 2) -
          (bounds.left + bounds.width / 2);
        const left = Math.max(0, scroller.scrollLeft + delta);
        if (typeof scroller.scrollTo === 'function') {
          scroller.scrollTo({ left, top: scroller.scrollTop, behavior: 'auto' });
        } else {
          scroller.scrollLeft = left;
        }
        return true;
      }
      if (scroller === boundary) break;
      scroller = scroller.parentElement;
    }

    // Embla often moves slides with transforms instead of scrollLeft. Let the
    // browser reveal the focused slide as a fallback, then restore the page
    // coordinates so only the carousel can move.
    const pageX = window.scrollX;
    const pageY = window.scrollY;
    try {
      element.scrollIntoView({
        behavior: 'auto',
        block: 'nearest',
        inline: 'center',
      });
    } catch {
      element.scrollIntoView();
    }
    try {
      window.scrollTo({ left: pageX, top: pageY, behavior: 'auto' });
    } catch {
      window.scrollTo(pageX, pageY);
    }
    return true;
  };

  const revealFocusedElement = (element, direction) => {
    if (!(element instanceof HTMLElement)) return false;

    const horizontalMove = direction === 'left' || direction === 'right';
    const carouselRow = element.closest('[data-tv-carousel-row]');

    if (horizontalMove && carouselRow instanceof HTMLElement) {
      return centerCarouselTarget(element, carouselRow);
    }

    if (direction === 'up' || direction === 'down') {
      return centerVerticalTarget(element);
    }

    try {
      element.scrollIntoView({
        behavior: 'auto',
        block: 'nearest',
        inline: 'nearest',
      });
    } catch {
      element.scrollIntoView();
    }
    return true;
  };

  const focusWithoutJank = (element, scroll = true) => {
    if (!(element instanceof HTMLElement)) return false;
    try {
      element.focus({ preventScroll: true });
    } catch {
      element.focus();
    }
    if (document.activeElement !== element) return false;
    if (scroll) centerVerticalTarget(element);
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
    const contentCard = elements.find(element => element.hasAttribute('data-tv-card'));

    if (api.preferContentAfterNavigation) {
      if (contentCard) {
        api.preferContentAfterNavigation = false;
        api.navigationInProgressUntil = 0;
        return focusWithoutJank(contentCard);
      }

      if (performance.now() < Number(api.navigationInProgressUntil || 0)) {
        return false;
      }

      api.preferContentAfterNavigation = false;
    }

    const target =
      elements.find(element => element.hasAttribute('data-tv-autofocus')) ||
      contentCard ||
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

    // Poster navigation is row-first vertically. While another media row
    // exists above/below, header controls are not eligible at all. This avoids
    // diagonal jumps to Search/Account and makes ↑/↓ advance through rows even
    // when the posters are horizontally staggered.
    let next = null;
    if (
      current.hasAttribute('data-tv-card') &&
      (direction === 'up' || direction === 'down')
    ) {
      const currentRow = current.closest('[data-tv-carousel-row]');
      if (currentRow instanceof HTMLElement) {
        const cardCandidates = candidates
          .filter(candidate =>
            candidate.element instanceof HTMLElement &&
            candidate.element.hasAttribute('data-tv-card')
          )
          .map(candidate => {
            const row = candidate.element.closest('[data-tv-carousel-row]');
            if (!(row instanceof HTMLElement)) return null;
            return {
              ...candidate,
              rowKey: row,
              rowRect: toRect(row),
            };
          })
          .filter(Boolean);

        next = findNextCardRowTarget(
          toRect(current),
          currentRow,
          toRect(currentRow),
          cardCandidates,
          direction,
        );
      }
    }

    // Only when there is no poster row left in that direction do we fall back
    // to the global spatial graph. At the top row this naturally re-enables
    // header controls.
    if (!next) {
      next = findNextFocusTarget(toRect(current), candidates, direction);
    }
    if (!next || !(next.element instanceof HTMLElement)) return false;

    try {
      next.element.focus({ preventScroll: true });
    } catch {
      next.element.focus();
    }

    revealFocusedElement(next.element, direction);

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

    api.focusRecoveryRaf = requestAnimationFrame(() => {
      api.focusRecoveryRaf = null;
      if (!pageFocusIsEmpty()) return;

      // Check immediately on every recovery pass. ensureInitialFocus() will
      // take the first media card as soon as it exists, but deliberately
      // refuses to fall back to the header search while a SPA route is still
      // mounting its content.
      if (api.restoreLastFocus() || api.ensureInitialFocus()) return;

      const remainingNavigationMs =
        Number(api.navigationInProgressUntil || 0) - performance.now();

      if (remainingNavigationMs > 0 && api.preferContentAfterNavigation) {
        api.focusRecoveryTimer = setTimeout(() => {
          api.focusRecoveryTimer = null;
          scheduleFocusRecovery();
        }, Math.min(Math.max(remainingNavigationMs, 80), 250));
      }
    });
  };

  const setupFocusLifecycle = () => {
    if (typeof MutationObserver === 'function' && document.body) {
      api.focusObserver = new MutationObserver(scheduleFocusRecovery);
      api.focusObserver.observe(document.body, { childList: true, subtree: true });
    }

    // The remote SPA usually mounts the header before the media rows. Waiting
    // briefly for a card prevents the search input from stealing initial focus.
    if (pageFocusIsEmpty()) {
      api.preferContentAfterNavigation = true;
      api.navigationInProgressUntil = Math.max(
        Number(api.navigationInProgressUntil || 0),
        performance.now() + 5000,
      );
    }

    requestAnimationFrame(() => {
      if (pageFocusIsEmpty()) scheduleFocusRecovery();
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
