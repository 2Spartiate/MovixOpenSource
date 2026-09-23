/**
 * Shared handheld + TV DOM adjustments for the remote Movix site.
 * These run inside the live page loaded by the native WebView.
 */
export function buildAppSiteOverrides(): string {
  return `
(() => {
  const READY_KEY = '__MOVIX_APP_COMMON_OVERRIDES_READY';
  if (window[READY_KEY]) return;
  window[READY_KEY] = true;

  const DETAIL_PATH = /^\\/(?:movie|tv|collection)\\/[^/?#]+\\/?$/;

  const normalise = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .replace(/\\s+/g, ' ')
    .trim()
    .toLowerCase();

  const removeTelegramUi = () => {
    document.querySelectorAll('header a[href*="t.me/"], header a[href*="telegram.me/"]').forEach((link) => {
      if (!(link instanceof HTMLElement)) return;
      const href = String(link.getAttribute('href') || '');
      const label = normalise(
        String(link.getAttribute('aria-label') || '') + ' ' +
        String(link.getAttribute('title') || '') + ' ' +
        String(link.textContent || '')
      );
      if (href.includes('movix_site') || label.includes('telegram')) {
        link.remove();
      }
    });

    document.querySelectorAll('a[href*="t.me/movix_site"], a[href*="telegram.me/movix_site"]').forEach((link) => {
      if (!(link instanceof HTMLElement) || link.closest('header')) return;
      let node = link.parentElement;
      for (let depth = 0; node && depth < 7; depth += 1, node = node.parentElement) {
        const text = normalise(node.textContent);
        if (
          text.length > 0 &&
          text.length < 1200 &&
          text.includes('telegram') &&
          (
            text.includes('rejoignez') ||
            text.includes('communaute') ||
            text.includes('join our community') ||
            text.includes('join the community')
          )
        ) {
          node.remove();
          return;
        }
      }
      link.remove();
    });

    document.querySelectorAll('h1, h2, h3, h4').forEach((heading) => {
      const text = normalise(heading.textContent);
      if (
        !text.includes('rejoignez notre communaute') &&
        !text.includes('rejoignez la communaute') &&
        !text.includes('join our community')
      ) return;

      let node = heading.parentElement;
      for (let depth = 0; node && depth < 6; depth += 1, node = node.parentElement) {
        const candidateText = normalise(node.textContent);
        if (candidateText.includes('telegram') && candidateText.length < 1200) {
          node.remove();
          return;
        }
      }
    });
  };

  const replaceHeaderLogo = () => {
    const candidates = Array.from(document.querySelectorAll('header a[href]'));

    candidates.forEach((link) => {
      if (!(link instanceof HTMLAnchorElement)) return;

      let pathname = String(link.getAttribute('href') || '');
      try {
        pathname = new URL(link.href, window.location.href).pathname;
      } catch {
        // Keep the raw href fallback.
      }

      const label = normalise(
        String(link.textContent || '') + ' ' +
        String(link.getAttribute('aria-label') || '')
      );

      if (pathname !== '/' || (label !== 'movix' && !label.includes('movix'))) return;
      if (link.querySelector('img[data-movix-app-brand-logo="1"]')) return;

      const image = document.createElement('img');
      image.src = 'https://raw.githubusercontent.com/2Spartiate/MovixOpenSource/refs/heads/agent/google-tv-clean-baseline-v1/public/movix-logo.png';
      image.alt = 'Movix';
      image.decoding = 'async';
      image.dataset.movixAppBrandLogo = '1';
      image.style.setProperty('display', 'block');
      image.style.setProperty('height', 'clamp(28px, 4vw, 36px)');
      image.style.setProperty('width', 'auto');
      image.style.setProperty('max-width', '120px');
      image.style.setProperty('object-fit', 'contain');

      link.replaceChildren(image);
      link.setAttribute('aria-label', 'Movix');
    });
  };

  const findButton = (root, labels) =>
    Array.from(root.querySelectorAll('button, [role="button"]')).find((candidate) => {
      if (!(candidate instanceof HTMLElement)) return false;
      const label = normalise(
        String(candidate.textContent || '') + ' ' +
        String(candidate.getAttribute('aria-label') || '')
      );
      return labels.some((expected) => label === expected || label.includes(expected));
    });

  const hideDialog = (dialog) => {
    if (!(dialog instanceof HTMLElement)) return;
    dialog.style.setProperty('visibility', 'hidden', 'important');
    dialog.style.setProperty('pointer-events', 'none', 'important');
  };

  const advancePlaybackGate = () => {
    document.querySelectorAll('[role="dialog"]').forEach((dialog) => {
      if (!(dialog instanceof HTMLElement)) return;

      const text = normalise(dialog.textContent);
      const viewAdButton =
        dialog.querySelector('[data-ad-view-button]') ||
        findButton(dialog, [
          'voir une publicite',
          'voir la publicite',
          'view an ad',
          'watch an ad',
        ]);

      if (
        viewAdButton instanceof HTMLElement &&
        (
          text.includes('une pub et c est parti') ||
          text.includes('voir une publicite') ||
          text.includes('view an ad') ||
          text.includes('watch an ad')
        )
      ) {
        hideDialog(dialog);
        if (viewAdButton.dataset.movixAppAdvance !== '1') {
          viewAdButton.dataset.movixAppAdvance = '1';
          queueMicrotask(() => viewAdButton.click());
        }
        return;
      }

      const thanksStep =
        text.includes('merci pour ton aide') ||
        text.includes('thanks for your help') ||
        text.includes('gracias por tu ayuda');

      if (!thanksStep) return;

      const playButton = findButton(dialog, [
        'lecture',
        'regarder',
        'play',
        'playback',
        'watch',
      ]);

      if (!(playButton instanceof HTMLElement)) return;

      hideDialog(dialog);
      if (playButton.dataset.movixAppContinue !== '1') {
        playButton.dataset.movixAppContinue = '1';
        queueMicrotask(() => playButton.click());
      }
    });
  };


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
    if (window.MOVIX_TV !== true) return;
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
    if (window.MOVIX_TV !== true) return;

    document.querySelectorAll('[data-tv-favorite-overlay]').forEach((element) => {
      if (element instanceof HTMLElement) element.remove();
    });

    Array.from(document.querySelectorAll('a[href]'))
      .filter(looksLikePosterCardLink)
      .forEach((link) => {
        let card = link.parentElement;
        if (!(card instanceof HTMLElement)) return;

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
    if (window.MOVIX_TV !== true) return;

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

      if (marked || (hasChevron && looksOverlay)) button.remove();
    });
  };

  const makeMovixBrandInert = () => {
    if (window.MOVIX_TV !== true) return;

    document.querySelectorAll(
      'header [data-tv-header-logo], header a, header [role="link"]'
    ).forEach((element) => {
      if (!(element instanceof HTMLElement)) return;

      const marked = element.hasAttribute('data-tv-header-logo');
      const image = element.querySelector(
        'img[data-movix-app-brand-logo="1"], img[alt="Movix"], img[alt="MOVIX"]'
      );
      const label = normalise(
        String(element.textContent || '') + ' ' +
        String(element.getAttribute('aria-label') || '')
      );

      if (!marked && !image && label !== 'movix') return;

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
    if (window.MOVIX_TV !== true) return;
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

  const installTvHeroAutoplay = () => {
    if (window.MOVIX_TV !== true) return;

    const previous = window.__MOVIX_TV_HERO_AUTOPLAY;
    const onHome = window.location.pathname === '/';

    if (!onHome) {
      if (previous?.timer) clearTimeout(previous.timer);
      if (previous) {
        previous.timer = null;
        previous.root = null;
      }
      return;
    }

    const markedRoot = document.querySelector('[data-tv-hero-slider]');
    const progressRoot = document.querySelector('.hero-progress-fill')?.closest('.embla');
    const fallbackRoot = Array.from(document.querySelectorAll('.embla')).find((candidate) => {
      if (!(candidate instanceof HTMLElement)) return false;
      if (candidate.querySelectorAll('.embla__slide').length < 2) return false;
      return Boolean(candidate.querySelector('button[aria-current="true"]'));
    });

    const root =
      markedRoot instanceof HTMLElement
        ? markedRoot
        : progressRoot instanceof HTMLElement
          ? progressRoot
          : fallbackRoot instanceof HTMLElement
            ? fallbackRoot
            : null;

    if (!root) return;
    if (previous?.root === root && previous.timer) return;
    if (previous?.timer) clearTimeout(previous.timer);

    const runtime = { root, timer: null };
    window.__MOVIX_TV_HERO_AUTOPLAY = runtime;

    const pauseNativeAutoplay = () => {
      const toggle = Array.from(root.querySelectorAll('button')).find((button) => (
        button.querySelector(
          'svg.lucide-pause, .lucide-pause, svg.lucide-play, .lucide-play'
        )
      ));
      if (!(toggle instanceof HTMLButtonElement)) return;

      toggle.setAttribute('data-tv-ignore-focus', '');
      toggle.setAttribute('tabindex', '-1');

      const currentlyRunning = Boolean(
        toggle.querySelector('svg.lucide-pause, .lucide-pause')
      );
      if (!currentlyRunning || toggle.dataset.movixTvNativePaused === '1') return;

      toggle.dataset.movixTvNativePaused = '1';
      toggle.click();
    };

    const getDots = () => {
      const explicit = Array.from(root.querySelectorAll('button[data-tv-hero-dot]'))
        .filter((button) => button instanceof HTMLButtonElement);
      if (explicit.length > 1) return explicit;

      const active = root.querySelector('button[aria-current="true"]');
      const group = active?.parentElement;
      if (!(group instanceof HTMLElement)) return [];

      return Array.from(group.children)
        .filter((child) => child instanceof HTMLButtonElement);
    };

    const schedule = (delay = 10000) => {
      if (runtime.timer) clearTimeout(runtime.timer);
      runtime.timer = setTimeout(advance, delay);
    };

    const advance = () => {
      if (
        window.MOVIX_TV !== true ||
        !root.isConnected ||
        window.location.pathname !== '/'
      ) {
        if (runtime.timer) clearTimeout(runtime.timer);
        runtime.timer = null;
        return;
      }

      const dots = getDots();
      if (dots.length < 2) {
        schedule(500);
        return;
      }

      const activeIndex = dots.findIndex(
        (button) => button.getAttribute('aria-current') === 'true'
      );
      const nextIndex = activeIndex >= 0 ? (activeIndex + 1) % dots.length : 0;
      const next = dots[nextIndex];
      if (next instanceof HTMLButtonElement) next.click();
      schedule(10000);
    };

    pauseNativeAutoplay();
    requestAnimationFrame(pauseNativeAutoplay);
    schedule(10000);
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
    if (window.MOVIX_TV !== true) return;
    if (window.__MOVIX_APP_TV_HISTORY_PATCHED) return;
    window.__MOVIX_APP_TV_HISTORY_PATCHED = true;

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
    // Clean-baseline common policy: identical on handheld and TV.
    replaceHeaderLogo();
    removeTelegramUi();
    advancePlaybackGate();

    // Product behavior below is TV-only.
    makeMovixBrandInert();
    removeFooter();
    removeCarouselArrows();
    removeFavoriteControls();
    markPosterCards();
    disableTvSmoothScroll();
    installTvHeroAutoplay();
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
      window.__MOVIX_APP_COMMON_OVERRIDES_OBSERVER = observer;
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
