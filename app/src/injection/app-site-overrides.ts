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

  // Never detach nodes owned by the remote React tree. Detaching a child
  // behind React's back can corrupt the next SPA commit. App-only cleanup is
  // therefore expressed as attributes/styles only.
  const hideManagedNode = (element) => {
    if (!(element instanceof HTMLElement)) return;
    element.setAttribute('data-movix-app-hidden', '1');
    element.setAttribute('data-tv-ignore-focus', '');
    element.setAttribute('aria-hidden', 'true');
    element.setAttribute('tabindex', '-1');
    element.style.setProperty('display', 'none', 'important');
    element.style.setProperty('pointer-events', 'none', 'important');
  };

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
        hideManagedNode(link);
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
          hideManagedNode(node);
          return;
        }
      }
      hideManagedNode(link);
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
          hideManagedNode(node);
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

      // Keep React's children intact. Render the app logo as a background and
      // hide the original children visually instead of replacing DOM children.
      link.setAttribute('data-movix-app-brand-logo', '1');
      link.setAttribute('aria-label', 'Movix');
      link.style.setProperty('display', 'block');
      link.style.setProperty('width', 'clamp(84px, 12vw, 120px)');
      link.style.setProperty('height', 'clamp(28px, 4vw, 36px)');
      link.style.setProperty(
        'background-image',
        'url("https://raw.githubusercontent.com/2Spartiate/MovixOpenSource/refs/heads/agent/google-tv-clean-baseline-v1/public/movix-logo.png")'
      );
      link.style.setProperty('background-repeat', 'no-repeat');
      link.style.setProperty('background-position', 'left center');
      link.style.setProperty('background-size', 'contain');
      link.style.setProperty('font-size', '0');
      link.style.setProperty('color', 'transparent');
      Array.from(link.children).forEach((child) => {
        if (child instanceof HTMLElement) {
          child.style.setProperty('visibility', 'hidden', 'important');
        }
      });
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

      // Focus the real React Router link, not its visual parent. This keeps the
      // native PrefetchLink onFocus hook alive on TV, preserves the exact media
      // destination, and lets the focus ring be painted above the poster.
      link.setAttribute('data-tv-focus', '');
      link.setAttribute('data-tv-card', '');
      link.setAttribute('data-tv-focus-id', 'media:' + path);
      link.setAttribute('tabindex', '0');
      link.removeAttribute('data-tv-ignore-focus');
      if (isTransparentOverlay) {
        link.setAttribute('data-tv-card-link', '');
      }

      const row = findCardRow(link);
      if (row) {
        row.setAttribute('data-tv-carousel-row', '');
        row.setAttribute('data-tv-focus-group', 'carousel-row');
      }
    });
  };

  const removeFavoriteControls = () => {
    if (window.MOVIX_TV !== true) return;

    document.querySelectorAll('[data-tv-favorite-overlay]').forEach((element) => {
      if (element instanceof HTMLElement) hideManagedNode(element);
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
          if (hasStar) hideManagedNode(button);
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

      if (marked || (hasChevron && looksOverlay)) hideManagedNode(button);
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

  const markTvHeroFocusPolicy = () => {
    if (window.MOVIX_TV !== true) return;
    if (window.location.pathname !== '/') return;

    const markedRoot = document.querySelector('[data-tv-hero-slider]');
    const progressRoot = document.querySelector('.hero-progress-fill')?.closest('.embla');
    const root =
      markedRoot instanceof HTMLElement
        ? markedRoot
        : progressRoot instanceof HTMLElement
          ? progressRoot
          : null;
    if (!(root instanceof HTMLElement)) return;

    // One and only one TV entry point for the hero: the red Play CTA.
    root.querySelectorAll('[data-tv-primary-focus], [data-tv-autofocus]').forEach((element) => {
      if (!(element instanceof HTMLElement)) return;
      element.removeAttribute('data-tv-primary-focus');
      element.removeAttribute('data-tv-autofocus');
    });

    const playLink = Array.from(root.querySelectorAll('a[href]')).find((link) => (
      link instanceof HTMLAnchorElement &&
      Boolean(link.querySelector('svg.lucide-play, .lucide-play'))
    ));
    if (playLink instanceof HTMLElement) {
      playLink.setAttribute('data-tv-primary-focus', 'hero-play');
      playLink.setAttribute('data-tv-autofocus', '');
      playLink.setAttribute('data-tv-focus-id', 'hero-play');
      playLink.setAttribute('tabindex', '0');
      playLink.removeAttribute('data-tv-ignore-focus');
    }

    // "More info" and slide dots remain clickable on handheld but are outside
    // the TV D-pad graph. Autoplay can still click dots programmatically.
    root.querySelectorAll('a, button').forEach((element) => {
      if (!(element instanceof HTMLElement) || element === playLink) return;
      const isInfo = Boolean(
        element.querySelector('svg.lucide-info, .lucide-info')
      );
      const isDot =
        element.hasAttribute('data-tv-hero-dot') ||
        element.getAttribute('aria-current') === 'true' ||
        normalise(element.getAttribute('aria-label')).includes('slide');

      if (!isInfo && !isDot) return;
      element.setAttribute('data-tv-ignore-focus', '');
      element.setAttribute('tabindex', '-1');
    });
  };

  const syncTvHeaderFocusGate = () => {
    if (window.MOVIX_TV !== true) return;
    const header = document.querySelector('header');
    if (!(header instanceof HTMLElement)) return;

    const gated = window.scrollY > 8;
    const interactive = header.querySelectorAll(
      'a[href], button, input, select, textarea, [role="button"], [tabindex]'
    );

    interactive.forEach((element) => {
      if (!(element instanceof HTMLElement)) return;

      if (gated) {
        if (!element.hasAttribute('data-tv-header-gated-focus')) {
          const previous = element.getAttribute('tabindex');
          element.setAttribute('data-tv-header-gated-tabindex', previous === null ? '__none__' : previous);
          element.setAttribute('data-tv-header-gated-focus', '');
        }
        element.setAttribute('data-tv-ignore-focus', '');
        element.setAttribute('tabindex', '-1');
        return;
      }

      if (!element.hasAttribute('data-tv-header-gated-focus')) return;
      const previous = element.getAttribute('data-tv-header-gated-tabindex');
      element.removeAttribute('data-tv-header-gated-focus');
      element.removeAttribute('data-tv-header-gated-tabindex');

      if (
        !element.hasAttribute('data-movix-brand-inert') &&
        !element.hasAttribute('data-tv-header-telegram')
      ) {
        element.removeAttribute('data-tv-ignore-focus');
      }

      if (previous === '__none__' || previous === null) {
        element.removeAttribute('tabindex');
      } else {
        element.setAttribute('tabindex', previous);
      }
    });

    if (gated && document.activeElement instanceof HTMLElement && document.activeElement.closest('header')) {
      document.activeElement.blur();
      const api = window.__MOVIX_TV_FOCUS;
      if (api && typeof api.ensureInitialFocus === 'function') {
        requestAnimationFrame(() => api.ensureInitialFocus());
      }
    }
  };

  const removeFooter = () => {
    if (window.MOVIX_TV !== true) return;
    document.querySelectorAll('footer').forEach((footer) => hideManagedNode(footer));
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

    // Do not scroll the old route here. React may keep the previous screen
    // painted while the lazy destination resolves; forcing scrollTop=0 at this
    // exact moment exposed Home's first Top-10 card for 1–2 seconds. The site
    // owns its own post-mount ScrollToTop, so only focus recovery belongs here.
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
    markTvHeroFocusPolicy();
    syncTvHeaderFocusGate();
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
    apply();
    if (!window.__MOVIX_TV_HEADER_GATE_READY) {
      window.__MOVIX_TV_HEADER_GATE_READY = true;
      window.addEventListener('scroll', syncTvHeaderFocusGate, { passive: true });
    }
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
