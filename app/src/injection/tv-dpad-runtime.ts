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

  api.activeHeaderShortcut = null;
  api.activeShortcutScope = null;
  api.activeShortcutTrigger = null;

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

    // The HLS player owns its transport arrows (seek/fullscreen). Its TV quick
    // menu is the exception: once open, ordinary spatial navigation should
    // move between the menu rows.
    if (
      target.closest('[data-hls-player-root]') &&
      !target.closest('[data-tv-playback-quick-menu]')
    ) {
      return false;
    }

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

  const isHeaderElement = (element) =>
    element instanceof HTMLElement && Boolean(element.closest('header'));

  const pageIsAtRealTop = () => {
    const scrollTop = Math.max(
      Number(window.scrollY || 0),
      Number(document.documentElement?.scrollTop || 0),
      Number(document.body?.scrollTop || 0),
    );
    if (scrollTop > 8) return false;

    if (window.location.pathname === '/') {
      const hero = document.querySelector('[data-tv-hero-slider]');
      if (hero instanceof HTMLElement) {
        const rect = hero.getBoundingClientRect();
        // Home starts with the hero below the fixed header. If its top has
        // crossed the header band, an internal/container scroll has moved.
        if (rect.top < 40) return false;
      }
    }
    return true;
  };

  const getHeroPlay = () => {
    const target = document.querySelector(
      '[data-tv-primary-focus="hero-play"], [data-tv-focus-id="hero-play"]'
    );
    return target instanceof HTMLElement ? target : null;
  };

  const getRowCards = (row) => {
    if (!(row instanceof HTMLElement)) return [];
    return api.getTVFocusableElements().filter((element) =>
      element instanceof HTMLElement &&
      element.hasAttribute('data-tv-card') &&
      element.closest('[data-tv-carousel-row]') === row
    );
  };

  const getAdjacentCardInRow = (current, row, direction) => {
    const cards = getRowCards(row);
    const index = cards.indexOf(current);
    if (index < 0) return null;
    const delta = direction === 'right' ? 1 : -1;
    return cards[index + delta] || null;
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
    const shortcutScope = element.closest('[data-tv-shortcut-scope]');

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

      // Shortcut menus are isolated navigation surfaces. Even when every item
      // currently fits and no internal scroll is needed, never continue up to
      // body/window and pan the underlying Home page.
      if (shortcutScope instanceof HTMLElement && scroller === shortcutScope) {
        return true;
      }

      scroller = scroller.parentElement;
    }

    if (shortcutScope instanceof HTMLElement) return true;

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

  const centerCarouselTarget = (element, row, direction) => {
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

    // Embla translates its track instead of changing scrollLeft. Give the
    // focused card's React onFocus a frame to call emblaApi.scrollTo(index).
    // If the card is still at/outside the viewport edge, invoke Embla's real
    // hidden arrow control programmatically. The button stays in React's tree
    // (only visually hidden on TV), so this reaches the live carousel API.
    const pageX = window.scrollX;
    const pageY = window.scrollY;
    const nudgeIfNeeded = () => {
      if (!(element instanceof HTMLElement) || !element.isConnected) return;
      const rect = element.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const left = Math.max(0, rowRect.left);
      const right = Math.min(window.innerWidth, rowRect.right);
      const edge = Math.min(120, Math.max(48, rect.width * 0.45));
      const needsNudge =
        (direction === 'right' && rect.right >= right - edge) ||
        (direction === 'left' && rect.left <= left + edge);

      if (needsNudge) {
        const arrows = Array.from(row.querySelectorAll('button[data-tv-carousel-arrow]'))
          .filter((button) => button instanceof HTMLButtonElement);
        const arrow = direction === 'right' ? arrows[arrows.length - 1] : arrows[0];
        if (arrow instanceof HTMLButtonElement) {
          try { arrow.click(); } catch {}
        }
      }

      try {
        window.scrollTo({ left: pageX, top: pageY, behavior: 'auto' });
      } catch {
        window.scrollTo(pageX, pageY);
      }
    };

    requestAnimationFrame(() => requestAnimationFrame(nudgeIfNeeded));
    return true;
  };

  const revealFocusedElement = (element, direction) => {
    if (!(element instanceof HTMLElement)) return false;

    const horizontalMove = direction === 'left' || direction === 'right';
    const carouselRow = element.closest('[data-tv-carousel-row]');

    if (horizontalMove && carouselRow instanceof HTMLElement) {
      return centerCarouselTarget(element, carouselRow, direction);
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

  api.restoreContentFocus = () => {
    if (!api.lastFocusKey) return false;
    const match = api.getTVFocusableElements()
      .find(element =>
        !isHeaderElement(element) &&
        focusKeyFor(element) === api.lastFocusKey
      );
    return match ? focusWithoutJank(match) : false;
  };

  api.restoreLastFocus = () => {
    if (!pageFocusIsEmpty()) return false;
    return api.restoreContentFocus();
  };

  api.ensureInitialFocus = (allowContentFallback = false) => {
    if (!pageFocusIsEmpty()) return false;

    // A dialog that explicitly owns autofocus gets first refusal.
    const managedDialog = document.querySelector(
      '[role="dialog"][aria-modal="true"] [autofocus], ' +
      '[role="dialog"][aria-modal="true"][data-tv-manage-autofocus]'
    );
    if (managedDialog) return false;

    const elements = api.getTVFocusableElements()
      .filter(element => !isHeaderElement(element));

    // Automatic TV focus is hero-only. Never auto-scroll the Home down to the
    // first media card merely because the Hero took a little longer to mount.
    const heroPlay = getHeroPlay();
    if (heroPlay instanceof HTMLElement && elements.includes(heroPlay)) {
      api.heroAutofocusPending = false;
      return focusWithoutJank(heroPlay, false);
    }

    if (api.restoreLastFocus()) return true;
    if (!allowContentFallback) return false;

    // A real D-pad press is explicit user navigation, so non-Hero routes may
    // fall back to their primary control / first card at that point.
    const primary = elements.find(element => element.hasAttribute('data-tv-primary-focus'));
    const contentCard = elements.find(element => element.hasAttribute('data-tv-card'));
    const target =
      primary ||
      contentCard ||
      elements[0];

    return target ? focusWithoutJank(target) : false;
  };

  api.moveFocus = (direction) => {
    if (pageFocusIsEmpty()) {
      return api.ensureInitialFocus(true);
    }

    const current = document.activeElement;
    if (!(current instanceof HTMLElement)) return false;

    const activeScope = current.closest('[data-tv-shortcut-scope]');
    const candidates = api.getTVFocusCandidates()
      .filter(candidate => candidate.element !== current)
      .filter(candidate => {
        if (activeScope instanceof HTMLElement) {
          return activeScope.contains(candidate.element);
        }
        return !isHeaderElement(candidate.element);
      });
    const currentRect = toRect(current);
    const horizontal = direction === 'left' || direction === 'right';
    const vertical = direction === 'up' || direction === 'down';
    const currentRow = current.closest('[data-tv-carousel-row]');

    // Horizontal TV navigation is strictly local to the active carousel.
    // Offscreen cards remain measurable on TV (content-visibility override),
    // so DOM order can select the next real React link even beyond the screen.
    if (horizontal && currentRow instanceof HTMLElement) {
      const rowTarget = getAdjacentCardInRow(current, currentRow, direction);
      if (rowTarget instanceof HTMLElement) {
        try {
          rowTarget.focus({ preventScroll: true });
        } catch {
          rowTarget.focus();
        }
        revealFocusedElement(rowTarget, direction);
        return document.activeElement === rowTarget;
      }
      return false;
    }

    // Vertical poster navigation remains row-first and ignores horizontal
    // misalignment: pick the closest media row, then the closest card in it.
    let next = null;
    if (
      current.hasAttribute('data-tv-card') &&
      vertical &&
      currentRow instanceof HTMLElement
    ) {
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
        currentRect,
        currentRow,
        toRect(currentRow),
        cardCandidates,
        direction,
      );
    }

    // Header chrome is not part of ordinary D-pad navigation. From content,
    // vertical movement remains within content; at the upper edge ↑ returns
    // to the hero/top and then stops instead of falling into Search/Profile.
    if (!next && vertical && !isHeaderElement(current)) {
      next = findNextFocusTarget(currentRect, candidates, direction);

      if (!next && direction === 'up' && !pageIsAtRealTop()) {
        const heroPlay = getHeroPlay();
        if (heroPlay) {
          return focusWithoutJank(heroPlay);
        }
        try {
          window.scrollTo({ top: 0, left: window.scrollX, behavior: 'auto' });
        } catch {
          window.scrollTo(window.scrollX, 0);
        }
        return true;
      }
    }

    if (!next) {
      next = findNextFocusTarget(currentRect, candidates, direction);
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

  const rememberCurrentContentFocus = () => {
    const current = document.activeElement;
    if (!(current instanceof HTMLElement) || isHeaderElement(current)) return;
    if (current.closest('[data-tv-shortcut-scope]')) return;
    const key = focusKeyFor(current);
    if (key) api.lastFocusKey = key;
  };

  const findHeaderShortcutTarget = (kind) => {
    const header = document.querySelector('header');
    if (!(header instanceof HTMLElement)) return null;

    const marked = header.querySelector('[data-tv-header-shortcut="' + kind + '"]');
    if (marked instanceof HTMLElement) return marked;

    if (kind === 'search') {
      const search = Array.from(
        header.querySelectorAll('input[type="search"], input[type="text"]')
      ).find((element) => element instanceof HTMLInputElement && element.offsetParent !== null);
      return search instanceof HTMLElement ? search : null;
    }

    if (kind === 'explore') {
      const explore = Array.from(header.querySelectorAll('[data-explore-trigger]'))
        .find((element) => element instanceof HTMLElement && element.offsetParent !== null);
      return explore instanceof HTMLElement ? explore : null;
    }

    if (kind === 'account') {
      const avatar = Array.from(header.querySelectorAll('img')).find((image) => {
        if (!(image instanceof HTMLImageElement)) return false;
        const label = String(image.alt || '').toLowerCase();
        return label.includes('profil') || label.includes('profile') || label.includes('account');
      });
      if (avatar instanceof HTMLElement) {
        const owner = avatar.closest(
          'button, [role="button"], [class*="cursor-pointer"]'
        );
        if (owner instanceof HTMLElement) return owner;
      }
    }

    return null;
  };

  const getHeaderPolicy = () => window.__MOVIX_TV_HEADER_POLICY || null;

  const unlockHeaderElement = (element) => {
    if (!(element instanceof HTMLElement)) return;
    const policy = getHeaderPolicy();
    if (policy && typeof policy.restoreInteractive === 'function') {
      policy.restoreInteractive(element);
      return;
    }
    element.removeAttribute('data-tv-ignore-focus');
    if (element.getAttribute('tabindex') === '-1') element.removeAttribute('tabindex');
    element.style.setProperty('pointer-events', 'auto', 'important');
  };

  const unlockShortcutScope = (scope) => {
    if (!(scope instanceof HTMLElement)) return false;

    scope.setAttribute('data-tv-shortcut-scope', '');
    if (scope.closest('header')) {
      scope.setAttribute('data-tv-header-active-scope', '');
    }

    scope.querySelectorAll(
      'a[href], button, input, select, textarea, [role="button"], [tabindex], [data-tv-focus]'
    ).forEach((element) => {
      if (!(element instanceof HTMLElement)) return;
      unlockHeaderElement(element);
    });
    return true;
  };

  const clearShortcutMarkers = () => {
    document.querySelectorAll('[data-tv-header-shortcut-active]').forEach((element) => {
      if (element instanceof HTMLElement) {
        element.removeAttribute('data-tv-header-shortcut-active');
      }
    });
    document.querySelectorAll('[data-tv-header-active-scope]').forEach((element) => {
      if (element instanceof HTMLElement) {
        element.removeAttribute('data-tv-header-active-scope');
      }
    });
    document.querySelectorAll('[data-tv-shortcut-scope]').forEach((element) => {
      if (element instanceof HTMLElement) {
        element.removeAttribute('data-tv-shortcut-scope');
      }
    });

    const policy = getHeaderPolicy();
    if (policy && typeof policy.lock === 'function') {
      policy.lock();
    }
  };

  const findOpenedShortcutScope = (kind, trigger) => {
    if (kind === 'search') {
      const input = trigger instanceof HTMLInputElement ? trigger : null;
      const inputRect = input?.getBoundingClientRect?.();

      const panels = Array.from(document.querySelectorAll('body div')).filter((element) => {
        if (!(element instanceof HTMLElement)) return false;
        if (!element.querySelector('a[href*="/search?q="]')) return false;
        if (element.querySelectorAll('button').length < 1) return false;

        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;

        const style = window.getComputedStyle(element);
        const z = Number.parseInt(style.zIndex || '0', 10);
        const positioned = style.position === 'fixed' || style.position === 'absolute';
        if (!positioned || z < 1000) return false;

        if (inputRect) {
          const horizontalOverlap =
            rect.right >= inputRect.left - 48 &&
            rect.left <= inputRect.right + 48;
          const belowInput = rect.top >= inputRect.top - 8;
          if (!horizontalOverlap || !belowInput) return false;
        }

        return true;
      });

      const panel = panels
        .sort((a, b) => {
          const ar = a.getBoundingClientRect();
          const br = b.getBoundingClientRect();
          return (ar.width * ar.height) - (br.width * br.height);
        })[0];

      if (panel instanceof HTMLElement) {
        panel.setAttribute('data-tv-search-suggestions', '');
        panel.setAttribute('data-tv-shortcut-scroll-container', '');
        panel.style.setProperty('max-height', 'calc(100vh - 96px)', 'important');
        panel.style.setProperty('overflow-y', 'auto', 'important');
        panel.style.setProperty('overscroll-behavior', 'contain', 'important');
        panel.style.setProperty('scroll-behavior', 'auto', 'important');
        return panel;
      }
    }

    if (kind === 'account') {
      const root = trigger?.parentElement;
      if (root instanceof HTMLElement) {
        const panels = Array.from(root.querySelectorAll('div')).filter((element) => {
          if (!(element instanceof HTMLElement)) return false;
          const rect = element.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return false;
          const classes = String(element.className || '');
          const focusableCount = element.querySelectorAll(
            'a[href], button, [role="button"], [tabindex]'
          ).length;
          return (
            focusableCount >= 2 &&
            (
              (classes.includes('absolute') && classes.includes('top-full')) ||
              classes.includes('overflow-hidden')
            )
          );
        });

        const panel = panels
          .sort((a, b) => {
            const ar = a.getBoundingClientRect();
            const br = b.getBoundingClientRect();
            return (ar.width * ar.height) - (br.width * br.height);
          })[0];

        if (panel instanceof HTMLElement) {
          panel.setAttribute('data-tv-shortcut-scroll-container', '');
          panel.style.setProperty('max-height', 'calc(100vh - 76px)', 'important');
          panel.style.setProperty('overflow-y', 'auto', 'important');
          panel.style.setProperty('overscroll-behavior', 'contain', 'important');
          panel.style.setProperty('scroll-behavior', 'auto', 'important');
          return panel;
        }

        return root;
      }
    }

    if (kind === 'explore') {
      const portal = Array.from(document.querySelectorAll('[data-lenis-prevent]'))
        .find((element) => {
          if (!(element instanceof HTMLElement)) return false;
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
      if (portal instanceof HTMLElement) return portal;

      const header = document.querySelector('header');
      if (header instanceof HTMLElement) {
        const panels = Array.from(header.querySelectorAll('div')).filter((element) => {
          if (!(element instanceof HTMLElement)) return false;
          const rect = element.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0 || rect.top < 48) return false;
          return element.querySelectorAll('a[href], button').length >= 3;
        });
        if (panels[0] instanceof HTMLElement) return panels[0];
      }
    }

    return null;
  };

  const syncSearchSuggestionScope = () => {
    if (api.activeHeaderShortcut !== 'search') return null;
    const trigger = api.activeShortcutTrigger;
    const scope = findOpenedShortcutScope('search', trigger);
    if (!(scope instanceof HTMLElement)) {
      if (
        api.activeShortcutScope instanceof HTMLElement &&
        !api.activeShortcutScope.isConnected
      ) {
        api.activeShortcutScope = null;
      }
      return null;
    }

    api.activeShortcutScope = scope;
    unlockShortcutScope(scope);
    return scope;
  };
  api.syncSearchSuggestionScope = syncSearchSuggestionScope;

  const focusFirstScopeItem = (scope, trigger) => {
    if (!(scope instanceof HTMLElement)) return false;
    const candidates = api.getTVFocusableElements()
      .filter((element) =>
        scope.contains(element) &&
        element !== trigger &&
        !element.hasAttribute('data-movix-brand-inert')
      )
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return ar.top - br.top || ar.left - br.left;
      });

    return candidates[0] instanceof HTMLElement
      ? focusWithoutJank(candidates[0], false)
      : false;
  };

  const deactivateHeaderShortcut = (toggleUi = false, restoreFocus = true) => {
    const kind = api.activeHeaderShortcut;
    const trigger = api.activeShortcutTrigger;

    if (toggleUi && (kind === 'account' || kind === 'explore') && trigger instanceof HTMLElement) {
      try { trigger.click(); } catch {}
    }

    const active = document.activeElement;
    if (active instanceof HTMLElement && (
      active.hasAttribute('data-tv-header-shortcut-active') ||
      active.closest('[data-tv-shortcut-scope]')
    )) {
      try { active.blur(); } catch {}
    }

    api.activeHeaderShortcut = null;
    api.activeShortcutScope = null;
    api.activeShortcutTrigger = null;
    clearShortcutMarkers();

    if (restoreFocus) {
      const restored = api.restoreContentFocus();
      const heroPlay = getHeroPlay();
      if (!restored && heroPlay) focusWithoutJank(heroPlay);
    }
  };
  api.deactivateHeaderShortcut = deactivateHeaderShortcut;

  const activateHeaderShortcut = (kind) => {
    const target = findHeaderShortcutTarget(kind);
    if (!(target instanceof HTMLElement)) return false;

    if (api.activeHeaderShortcut === kind) {
      if (kind === 'search') {
        try { target.focus({ preventScroll: true }); } catch { target.focus(); }
        return true;
      }
      deactivateHeaderShortcut(true, true);
      return true;
    }

    if (api.activeHeaderShortcut) {
      deactivateHeaderShortcut(true, false);
    }

    rememberCurrentContentFocus();
    api.activeHeaderShortcut = kind;
    api.activeShortcutTrigger = target;

    if (kind === 'search') {
      target.setAttribute('data-tv-header-shortcut-active', '');
      unlockHeaderElement(target);
      try {
        target.focus({ preventScroll: true });
      } catch {
        target.focus();
      }
      if (target instanceof HTMLInputElement) {
        try { target.select(); } catch {}
      }
      return document.activeElement === target;
    }

    try { target.click(); } catch {
      api.activeHeaderShortcut = null;
      api.activeShortcutTrigger = null;
      return false;
    }

    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (api.activeHeaderShortcut !== kind) return;
      const scope = findOpenedShortcutScope(kind, target);
      if (!(scope instanceof HTMLElement)) return;

      api.activeShortcutScope = scope;
      unlockShortcutScope(scope);
      focusFirstScopeItem(scope, target);
    }));
    return true;
  };
  api.activateHeaderShortcut = activateHeaderShortcut;

  const shortcutForEvent = (event) => {
    if (event.repeat) return null;

    const target = event.target instanceof HTMLElement
      ? event.target
      : (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    if (target) {
      const tag = target.tagName.toLowerCase();
      if (
        target.isContentEditable ||
        tag === 'textarea' ||
        tag === 'select' ||
        (tag === 'input' && !['button', 'submit', 'reset'].includes(
          (target.getAttribute('type') || 'text').toLowerCase()
        )) ||
        target.closest(
          '[data-tv-consume-arrows], [data-tv-player-control], [data-tv-dpad-scope="native"], [data-hls-player-root]'
        )
      ) {
        return null;
      }
    }

    const key = String(event.key || '');
    const code = String(event.code || '');
    const legacy = Number(event.keyCode || event.which || 0);

    if (key === '1' || code === 'Digit1' || code === 'Numpad1' || legacy === 49 || legacy === 97) {
      return 'search';
    }
    if (key === '2' || code === 'Digit2' || code === 'Numpad2' || legacy === 50 || legacy === 98) {
      return 'account';
    }
    if (key === '3' || code === 'Digit3' || code === 'Numpad3' || legacy === 51 || legacy === 99) {
      return 'explore';
    }

    return null;
  };

  const consumeEvent = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
  };

  const handleDpadKeydown = (event) => {
    const shortcut = shortcutForEvent(event);
    if (shortcut && activateHeaderShortcut(shortcut)) {
      consumeEvent(event);
      return true;
    }

    const direction = directions[event.key];
    if (!direction) return false;

    const active = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    if (api.activeHeaderShortcut === 'search') {
      const input = api.activeShortcutTrigger instanceof HTMLInputElement
        ? api.activeShortcutTrigger
        : null;
      const scope = syncSearchSuggestionScope();

      // Search keeps the IME completely native until real suggestions exist.
      // Once the dropdown is present, ↓ deliberately exits the keyboard and
      // enters the first result, turning autocomplete into a proper TV menu.
      if (
        direction === 'down' &&
        input instanceof HTMLInputElement &&
        active === input &&
        scope instanceof HTMLElement
      ) {
        try { input.blur(); } catch {}
        if (focusFirstScopeItem(scope, input)) {
          consumeEvent(event);
          return true;
        }
      }

      // ↑ from the first suggestion returns to the Search input and therefore
      // re-opens the Android TV keyboard/voice path.
      if (
        direction === 'up' &&
        scope instanceof HTMLElement &&
        active instanceof HTMLElement &&
        scope.contains(active)
      ) {
        const items = api.getTVFocusableElements()
          .filter((element) => scope.contains(element))
          .sort((a, b) => {
            const ar = a.getBoundingClientRect();
            const br = b.getBoundingClientRect();
            return ar.top - br.top || ar.left - br.left;
          });

        if (items[0] === active && input instanceof HTMLInputElement) {
          try { input.focus({ preventScroll: true }); } catch { input.focus(); }
          consumeEvent(event);
          return true;
        }
      }
    }

    // Plain text editing remains native whenever no suggestion transition above
    // applies, preserving Android TV keyboard and voice behavior.
    if (!api.shouldSpatialNavigationHandle(event)) return false;

    // Once an arrow belongs to the TV spatial graph, consume it even when
    // the current element is already at that edge. Otherwise Chromium falls
    // back to page scrolling, which feels like a web page instead of a TV app.
    // Player/native scopes are filtered by shouldSpatialNavigationHandle above.
    api.moveFocus(direction);

    consumeEvent(event);
    return true;
  };

  api.handleDpadKeydown = handleDpadKeydown;
  api.keydownHandler = handleDpadKeydown;

  if (typeof api.focusinHandler === 'function') {
    document.removeEventListener('focusin', api.focusinHandler, true);
  }
  if (typeof api.backShortcutHandler === 'function') {
    window.removeEventListener('movix-tv-back', api.backShortcutHandler);
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

    if (isHeaderElement(target)) {
      const intentional =
        target.hasAttribute('data-tv-header-shortcut-active') ||
        target.closest('[data-tv-header-active-scope]');
      if (!intentional) {
        try { target.blur(); } catch {}
        api.restoreContentFocus();
      }
      return;
    }

    if (target.closest('[data-tv-shortcut-scope]')) return;

    if (api.activeHeaderShortcut) {
      deactivateHeaderShortcut(false, false);
    }

    const key = focusKeyFor(target);
    if (key) api.lastFocusKey = key;
  };
  api.focusinHandler = handleFocusIn;

  const handleTvBack = (event) => {
    if (!api.activeHeaderShortcut) return;
    deactivateHeaderShortcut(true, true);
    if (event?.cancelable) event.preventDefault();
  };
  api.backShortcutHandler = handleTvBack;
  window.addEventListener('movix-tv-back', handleTvBack);

  const scheduleFocusRecovery = () => {
    if (!pageFocusIsEmpty() || api.focusRecoveryRaf || api.focusRecoveryTimer) return;

    const remainingHeroWait =
      Number(api.heroAutofocusReadyAt || 0) - performance.now();
    if (remainingHeroWait > 0) {
      api.focusRecoveryTimer = setTimeout(() => {
        api.focusRecoveryTimer = null;
        scheduleFocusRecovery();
      }, Math.min(Math.max(remainingHeroWait, 40), 250));
      return;
    }

    api.focusRecoveryRaf = requestAnimationFrame(() => {
      api.focusRecoveryRaf = null;
      if (!pageFocusIsEmpty()) return;

      // Automatic recovery is deliberately Hero-only. If the Hero is still
      // absent, remain visually at the top and let a real D-pad press choose a
      // fallback on routes that genuinely have no Hero.
      api.ensureInitialFocus(false);
    });
  };

  const setupFocusLifecycle = () => {
    if (typeof MutationObserver === 'function' && document.body) {
      api.focusObserver = new MutationObserver(() => {
        syncSearchSuggestionScope();
        scheduleFocusRecovery();
      });
      api.focusObserver.observe(document.body, { childList: true, subtree: true });
    }

    if (pageFocusIsEmpty()) {
      api.heroAutofocusPending = true;
      // Give the remote Hero a short, deterministic mount window so the page
      // appears settled before focus lands on Play, without ever auto-scrolling
      // to the first content row.
      api.heroAutofocusReadyAt = performance.now() + 300;
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
    if (api.backShortcutHandler === handleTvBack) {
      window.removeEventListener('movix-tv-back', handleTvBack);
      api.backShortcutHandler = null;
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
