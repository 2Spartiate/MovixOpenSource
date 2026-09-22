/**
 * App-only DOM overrides for the remote Movix site loaded by the native WebView.
 *
 * The native shell loads a remote URL. Changes under ../src/** are therefore
 * not enough until that frontend is deployed. Everything in this file operates
 * on the live document that is actually visible in the app.
 */
export function buildAppSiteOverrides(): string {
  return `
(() => {
  const READY_KEY = '__MOVIX_APP_SITE_OVERRIDES_READY';
  if (window[READY_KEY]) return;
  window[READY_KEY] = true;

  const DETAIL_PATH = /^\\/(?:movie|tv|collection)\\/[^/?#]+\\/?$/;

  const normalise = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .replace(/\\s+/g, ' ')
    .trim()
    .toLowerCase();

  const linkPath = (element) => {
    if (!(element instanceof HTMLAnchorElement)) return '';
    try {
      const url = new URL(element.href, window.location.href);
      if (url.origin !== window.location.origin) return '';
      return url.pathname;
    } catch {
      return '';
    }
  };

  const isMediaDetailLink = (element) => {
    if (!(element instanceof HTMLAnchorElement)) return false;
    return DETAIL_PATH.test(linkPath(element));
  };

  const looksLikePosterCardLink = (element) => {
    if (!isMediaDetailLink(element)) return false;

    const classes = String(element.className || '');
    if (
      classes.includes('absolute') &&
      (classes.includes('inset-0') || classes.includes('inset-x-0'))
    ) {
      return true;
    }

    if (element.querySelector('img')) return true;

    const parent = element.parentElement;
    if (!parent) return false;
    if (parent.querySelector('img')) return true;

    const grandParent = parent.parentElement;
    return Boolean(grandParent?.querySelector('img'));
  };

  const findCardRow = (link) => {
    let node = link.parentElement;
    for (let depth = 0; node && depth < 9; depth += 1, node = node.parentElement) {
      if (!(node instanceof HTMLElement)) continue;

      const classes = String(node.className || '');
      const classList = node.classList;
      const explicitRow =
        node.hasAttribute('data-tv-carousel-row') ||
        classList?.contains('content-row-container') ||
        classList?.contains('group/carousel') ||
        classes.includes('embla__viewport') ||
        classes.includes('embla__container');

      if (explicitRow) return node;
    }
    return null;
  };

  const markPosterCards = () => {
    if (window.MOVIX_TV !== true) return;

    const detailLinks = Array.from(document.querySelectorAll('a[href]'))
      .filter(looksLikePosterCardLink);

    detailLinks.forEach((link) => {
      const classes = String(link.className || '');
      const isTransparentOverlay =
        classes.includes('absolute') &&
        (classes.includes('inset-0') || classes.includes('inset-x-0'));

      const path = linkPath(link);
      let focusTarget = link;

      if (isTransparentOverlay && link.parentElement instanceof HTMLElement) {
        focusTarget = link.parentElement;
        focusTarget.setAttribute('data-tv-card-proxy', '');
        focusTarget.setAttribute('data-tv-focus', '');
        focusTarget.setAttribute('data-tv-card', '');
        focusTarget.setAttribute('data-tv-focus-id', 'media:' + path);
        focusTarget.setAttribute('role', 'button');
        focusTarget.setAttribute('tabindex', '0');

        link.setAttribute('data-tv-card-link', '');
        link.setAttribute('data-tv-ignore-focus', '');
        link.setAttribute('tabindex', '-1');
      } else {
        link.setAttribute('data-tv-focus', '');
        link.setAttribute('data-tv-card', '');
        link.setAttribute('data-tv-focus-id', 'media:' + path);
        link.setAttribute('tabindex', '0');
      }

      const row = findCardRow(link);
      if (row) {
        row.setAttribute('data-tv-carousel-row', '');
        row.setAttribute('data-tv-focus-group', 'carousel-row');
      }
    });
  };

  const installCardActivation = () => {
    if (window.__MOVIX_APP_CARD_ACTIVATION_READY) return;
    window.__MOVIX_APP_CARD_ACTIVATION_READY = true;

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;

      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return;
      if (!active.hasAttribute('data-tv-card-proxy')) return;

      const link = active.querySelector('a[data-tv-card-link]');
      if (!(link instanceof HTMLAnchorElement)) return;

      event.preventDefault();
      event.stopPropagation();
      link.click();
    }, true);
  };

  const removeFavoriteControls = () => {
    document.querySelectorAll('[data-tv-favorite-overlay]').forEach((element) => {
      if (element instanceof HTMLElement) element.remove();
    });

    // The currently deployed frontend may not contain the TV marker above.
    // Restrict the fallback to media-card containers so rating stars and
    // account/favorites pages are not affected.
    Array.from(document.querySelectorAll('a[href]'))
      .filter(looksLikePosterCardLink)
      .forEach((link) => {
        let card = link.parentElement;
        if (!(card instanceof HTMLElement)) return;

        // Search list cards can wrap more markup than carousel cards.
        if (!card.querySelector('img') && card.parentElement instanceof HTMLElement) {
          card = card.parentElement;
        }

        card.querySelectorAll('button').forEach((button) => {
          if (!(button instanceof HTMLElement)) return;
          const hasStar = Boolean(
            button.querySelector('svg.lucide-star, .lucide-star')
          );

          if (hasStar) button.remove();
        });
      });
  };

  const removeCarouselArrows = () => {
    document.querySelectorAll('button').forEach((button) => {
      if (!(button instanceof HTMLElement)) return;

      const classes = String(button.className || '');
      const marked = button.hasAttribute('data-tv-carousel-arrow');
      const hasChevron = Boolean(
        button.querySelector(
          'svg.lucide-chevron-left, svg.lucide-chevron-right, .lucide-chevron-left, .lucide-chevron-right'
        )
      );
      const looksOverlay =
        classes.includes('absolute') &&
        (
          classes.includes('left-') ||
          classes.includes('right-') ||
          classes.includes('inset-y-0')
        );

      if (marked || (hasChevron && looksOverlay)) {
        button.remove();
      }
    });
  };

  const removeTelegramUi = () => {
    document.querySelectorAll('a[href*="t.me/movix_site"]').forEach((link) => {
      if (!(link instanceof HTMLElement)) return;

      if (link.closest('header')) {
        link.remove();
        return;
      }

      const grid = link.closest('div.grid');
      if (grid instanceof HTMLElement) {
        const wrapper = grid.parentElement;
        if (wrapper && wrapper.children.length === 1) wrapper.remove();
        else grid.remove();
        return;
      }

      link.remove();
    });

    document.querySelectorAll('h1, h2, h3').forEach((heading) => {
      const text = normalise(heading.textContent);
      if (
        text.includes('rejoignez notre communaute') ||
        text.includes('join our community')
      ) {
        const grid = heading.closest('div.grid');
        if (grid instanceof HTMLElement) {
          const wrapper = grid.parentElement;
          if (wrapper && wrapper.children.length === 1) wrapper.remove();
          else grid.remove();
        }
      }
    });
  };

  const makeMovixBrandInert = () => {
    document.querySelectorAll('header a, header [role="link"]').forEach((element) => {
      if (!(element instanceof HTMLElement)) return;
      if (normalise(element.textContent) !== 'movix') return;

      element.removeAttribute('href');
      element.setAttribute('tabindex', '-1');
      element.setAttribute('aria-disabled', 'true');
      element.setAttribute('data-tv-ignore-focus', '');
      element.setAttribute('data-movix-brand-inert', '');
      element.style.pointerEvents = 'none';
      element.style.cursor = 'default';
    });
  };

  const removeFooter = () => {
    document.querySelectorAll('footer').forEach((footer) => footer.remove());
  };

  const disableTvSmoothScroll = () => {
    if (window.MOVIX_TV !== true) return;

    const lenis = window.lenis;
    if (lenis && typeof lenis.destroy === 'function') {
      try { lenis.destroy(); } catch {}
      try { delete window.lenis; } catch {}
    } else if (lenis && typeof lenis.stop === 'function') {
      try { lenis.stop(); } catch {}
    }

    document.documentElement.style.scrollBehavior = 'auto';
    if (document.body) document.body.style.scrollBehavior = 'auto';
  };

  const skipPostAdThanks = () => {
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
    dialogs.forEach((dialog) => {
      if (!(dialog instanceof HTMLElement)) return;
      const text = normalise(dialog.textContent);

      const unlocked =
        text.includes('merci pour ton aide') ||
        text.includes('thanks for your help') ||
        text.includes('gracias por tu ayuda');

      if (!unlocked) return;

      const button = Array.from(dialog.querySelectorAll('button')).find((candidate) => {
        const label = normalise(candidate.textContent);
        return (
          label === 'lecture' ||
          label === 'playback' ||
          label === 'play' ||
          label === 'regarder' ||
          label === 'watch'
        );
      });

      if (!(button instanceof HTMLButtonElement)) return;
      if (button.dataset.movixAutoContinue === '1') return;
      button.dataset.movixAutoContinue = '1';
      requestAnimationFrame(() => button.click());
    });
  };

  const markTvRouteTransition = () => {
    if (window.MOVIX_TV !== true) return;

    const api = window.__MOVIX_TV_FOCUS || (window.__MOVIX_TV_FOCUS = {});
    api.preferContentAfterNavigation = true;
    api.navigationInProgressUntil = performance.now() + 5000;

    requestAnimationFrame(() => {
      try {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      } catch {
        window.scrollTo(0, 0);
      }
    });
  };

  const patchHistory = () => {
    if (window.__MOVIX_APP_HISTORY_PATCHED) return;
    window.__MOVIX_APP_HISTORY_PATCHED = true;

    ['pushState', 'replaceState'].forEach((methodName) => {
      const original = history[methodName];
      if (typeof original !== 'function') return;

      history[methodName] = function (...args) {
        const result = original.apply(this, args);
        markTvRouteTransition();
        return result;
      };
    });

    window.addEventListener('popstate', markTvRouteTransition);
  };

  const apply = () => {
    removeTelegramUi();
    makeMovixBrandInert();
    removeFooter();
    removeCarouselArrows();
    removeFavoriteControls();
    markPosterCards();
    disableTvSmoothScroll();
    skipPostAdThanks();
  };

  let raf = 0;
  const scheduleApply = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      apply();
    });
  };

  const start = () => {
    patchHistory();
    installCardActivation();
    apply();

    if (typeof MutationObserver === 'function' && document.documentElement) {
      const observer = new MutationObserver(scheduleApply);
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
      window.__MOVIX_APP_SITE_OVERRIDES_OBSERVER = observer;
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
`;
}
