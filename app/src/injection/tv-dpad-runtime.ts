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

    try {
      next.element.scrollIntoView({
        behavior: 'auto',
        block: 'nearest',
        inline: 'nearest',
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

    const moved = api.moveFocus(direction);
    if (!moved) return false;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
    return true;
  };

  api.handleDpadKeydown = handleDpadKeydown;
  api.keydownHandler = handleDpadKeydown;
  api.destroyDpadRuntime = () => {
    if (api.keydownHandler === handleDpadKeydown) {
      document.removeEventListener('keydown', handleDpadKeydown, true);
      api.keydownHandler = null;
    }
  };

  document.addEventListener('keydown', handleDpadKeydown, true);
})();
`;
}
