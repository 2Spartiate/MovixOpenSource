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

      if (marked || (hasChevron && looksOverlay)) {
        const isLeft = Boolean(
          button.querySelector('svg.lucide-chevron-left, .lucide-chevron-left')
        ) || classes.includes('left-');
        const isRight = Boolean(
          button.querySelector('svg.lucide-chevron-right, .lucide-chevron-right')
        ) || classes.includes('right-');

        button.setAttribute('data-tv-carousel-arrow', '');
        if (isLeft) button.setAttribute('data-tv-carousel-arrow-direction', 'left');
        if (isRight) button.setAttribute('data-tv-carousel-arrow-direction', 'right');
        hideManagedNode(button);
      }
    });
  };

  const makeMovixBrandInert = () => {
    if (window.MOVIX_TV !== true) return;

    const candidates = new Set();
    document.querySelectorAll(
      'header [data-tv-header-logo], header [data-movix-app-brand-logo], header a, header [role="link"]'
    ).forEach((element) => {
      if (element instanceof HTMLElement) candidates.add(element);
    });

    document.querySelectorAll('header img').forEach((image) => {
      if (!(image instanceof HTMLImageElement)) return;
      const signature = normalise(
        String(image.alt || '') + ' ' +
        String(image.getAttribute('src') || '')
      );
      if (!signature.includes('movix')) return;
      const owner = image.closest(
        '[data-tv-header-logo], [data-movix-app-brand-logo], a, [role="link"], [class*="cursor-pointer"]'
      );
      if (owner instanceof HTMLElement) candidates.add(owner);
    });

    candidates.forEach((element) => {
      const marked =
        element.hasAttribute('data-tv-header-logo') ||
        element.hasAttribute('data-movix-app-brand-logo');
      const image = element.querySelector('img');
      const imageSignature = image instanceof HTMLImageElement
        ? normalise(String(image.alt || '') + ' ' + String(image.getAttribute('src') || ''))
        : '';
      const label = normalise(
        String(element.textContent || '') + ' ' +
        String(element.getAttribute('aria-label') || '') + ' ' +
        String(element.style.backgroundImage || '')
      );

      if (
        !marked &&
        !imageSignature.includes('movix') &&
        !label.includes('movix')
      ) return;

      if (element.hasAttribute('href')) element.removeAttribute('href');
      if (element.getAttribute('tabindex') !== '-1') element.setAttribute('tabindex', '-1');
      if (element.getAttribute('aria-disabled') !== 'true') element.setAttribute('aria-disabled', 'true');
      if (!element.hasAttribute('data-tv-ignore-focus')) element.setAttribute('data-tv-ignore-focus', '');
      if (!element.hasAttribute('data-movix-brand-inert')) element.setAttribute('data-movix-brand-inert', '');
      element.style.setProperty('pointer-events', 'none', 'important');
      element.style.setProperty('cursor', 'default', 'important');

      if (document.activeElement === element || element.contains(document.activeElement)) {
        try { document.activeElement?.blur?.(); } catch {}
      }
    });
  };

  const getTvHeroRoot = () => {
    const markedRoot = document.querySelector('[data-tv-hero-slider]');
    if (markedRoot instanceof HTMLElement) return markedRoot;

    const progressRoot = document.querySelector('.hero-progress-fill')?.closest('.embla');
    if (progressRoot instanceof HTMLElement) return progressRoot;

    const fallbackRoot = Array.from(document.querySelectorAll('.embla')).find((candidate) => {
      if (!(candidate instanceof HTMLElement)) return false;
      if (candidate.querySelectorAll('.embla__slide').length < 2) return false;
      return Boolean(candidate.querySelector('button[aria-current="true"]'));
    });
    return fallbackRoot instanceof HTMLElement ? fallbackRoot : null;
  };

  const getTvHeroDots = (root) => {
    if (!(root instanceof HTMLElement)) return [];

    const explicit = Array.from(root.querySelectorAll('button[data-tv-hero-dot]'))
      .filter((button) => button instanceof HTMLButtonElement);
    if (explicit.length > 1) return explicit;

    const active = root.querySelector('button[aria-current="true"]');
    const group = active?.parentElement;
    if (!(group instanceof HTMLElement)) return explicit;

    const siblings = Array.from(group.children)
      .filter((child) => child instanceof HTMLButtonElement);
    return siblings.length > 1 ? siblings : explicit;
  };

  const markTvHeroFocusPolicy = () => {
    if (window.MOVIX_TV !== true) return;
    if (window.location.pathname !== '/') return;

    const root = getTvHeroRoot();
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
      if (playLink.getAttribute('data-tv-primary-focus') !== 'hero-play') {
        playLink.setAttribute('data-tv-primary-focus', 'hero-play');
      }
      if (!playLink.hasAttribute('data-tv-autofocus')) playLink.setAttribute('data-tv-autofocus', '');
      if (playLink.getAttribute('data-tv-focus-id') !== 'hero-play') {
        playLink.setAttribute('data-tv-focus-id', 'hero-play');
      }
      if (playLink.getAttribute('tabindex') !== '0') playLink.setAttribute('tabindex', '0');
      playLink.removeAttribute('data-tv-ignore-focus');
    }

    const dots = new Set(getTvHeroDots(root));

    // "More info" stays available on handheld but never belongs to the TV graph.
    // Hero dots are stronger: on TV they are not user-clickable either. Autoplay
    // still advances them through programmatic .click() calls (isTrusted=false).
    root.querySelectorAll('a, button').forEach((element) => {
      if (!(element instanceof HTMLElement) || element === playLink) return;
      const isInfo = Boolean(
        element.querySelector('svg.lucide-info, .lucide-info')
      );
      const isDot =
        dots.has(element) ||
        element.hasAttribute('data-tv-hero-dot') ||
        element.getAttribute('aria-current') === 'true' ||
        normalise(element.getAttribute('aria-label')).includes('slide');

      if (!isInfo && !isDot) return;
      if (!element.hasAttribute('data-tv-ignore-focus')) element.setAttribute('data-tv-ignore-focus', '');
      if (element.getAttribute('tabindex') !== '-1') element.setAttribute('tabindex', '-1');

      if (isDot) {
        if (!element.hasAttribute('data-tv-hero-user-inert')) {
          element.setAttribute('data-tv-hero-user-inert', '');
        }
        element.style.setProperty('pointer-events', 'none', 'important');
      }
    });
  };

  const markTvHeaderShortcutTargets = () => {
    if (window.MOVIX_TV !== true) return null;
    const header = document.querySelector('header');
    if (!(header instanceof HTMLElement)) return null;

    const search = Array.from(
      header.querySelectorAll('input[type="search"], input[type="text"]')
    ).find((element) => element instanceof HTMLInputElement && element.offsetParent !== null);
    if (search instanceof HTMLElement) {
      search.setAttribute('data-tv-header-shortcut', 'search');
    }

    const explore = Array.from(header.querySelectorAll('[data-explore-trigger]'))
      .find((element) => element instanceof HTMLElement && element.offsetParent !== null);
    if (explore instanceof HTMLElement) {
      explore.setAttribute('data-tv-header-shortcut', 'explore');
    }

    let account = header.querySelector(
      '[data-tv-primary-focus="account"], [data-tv-header-shortcut="account"]'
    );
    if (!(account instanceof HTMLElement)) {
      const avatar = Array.from(header.querySelectorAll('img')).find((image) => {
        if (!(image instanceof HTMLImageElement)) return false;
        const label = normalise(
          String(image.alt || '') + ' ' +
          String(image.getAttribute('title') || '')
        );
        return label.includes('profil') || label.includes('profile') || label.includes('account');
      });
      if (avatar instanceof HTMLElement) {
        account = avatar.closest(
          'button, [role="button"], [class*="cursor-pointer"]'
        );
      }
    }
    if (account instanceof HTMLElement) {
      account.setAttribute('data-tv-header-shortcut', 'account');
    }

    return { header, search, account, explore };
  };

  const restoreTvHeaderInteractive = (element) => {
    if (!(element instanceof HTMLElement)) return;

    const previous = element.getAttribute('data-tv-header-lock-tabindex');
    if (previous === '__none__') {
      element.removeAttribute('tabindex');
    } else if (previous !== null) {
      element.setAttribute('tabindex', previous);
    }
    element.removeAttribute('data-tv-header-lock-tabindex');
    element.removeAttribute('data-tv-header-locked');

    if (
      !element.hasAttribute('data-movix-brand-inert') &&
      !element.hasAttribute('data-tv-header-telegram')
    ) {
      element.removeAttribute('data-tv-ignore-focus');
    }

    element.style.setProperty('pointer-events', 'auto', 'important');
  };

  const lockTvHeaderPointerNavigation = () => {
    if (window.MOVIX_TV !== true) return;
    const targets = markTvHeaderShortcutTargets();
    if (!targets) return;

    const { header } = targets;
    header.setAttribute('data-tv-pointer-locked', '');
    header.style.setProperty('pointer-events', 'none', 'important');

    const interactive = header.querySelectorAll(
      'a[href], button, input, select, textarea, [role="button"], [tabindex], [data-tv-focus]'
    );

    interactive.forEach((element) => {
      if (!(element instanceof HTMLElement)) return;

      const activeScope = element.closest('[data-tv-header-active-scope]');
      const activeShortcut =
        element.hasAttribute('data-tv-header-shortcut-active') ||
        activeScope instanceof HTMLElement;

      if (activeShortcut) {
        restoreTvHeaderInteractive(element);
        return;
      }

      if (!element.hasAttribute('data-tv-header-locked')) {
        const previous = element.getAttribute('tabindex');
        element.setAttribute(
          'data-tv-header-lock-tabindex',
          previous === null ? '__none__' : previous
        );
        element.setAttribute('data-tv-header-locked', '');
      }

      element.setAttribute('data-tv-ignore-focus', '');
      element.setAttribute('tabindex', '-1');
      element.style.setProperty('pointer-events', 'none', 'important');
    });

    // If Chromium/WebView ever retained a stale header focus across a React
    // commit, eject it synchronously. Normal D-pad navigation should never
    // enter header chrome at all.
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      active.closest('header') &&
      !active.hasAttribute('data-tv-header-shortcut-active') &&
      !(active.closest('[data-tv-header-active-scope]') instanceof HTMLElement)
    ) {
      try { active.blur(); } catch {}
      const api = window.__MOVIX_TV_FOCUS;
      if (api && typeof api.restoreContentFocus === 'function') {
        api.restoreContentFocus();
      }
    }
  };

  const exposeTvHeaderPointerPolicy = () => {
    if (window.MOVIX_TV !== true) return;
    const api = window.__MOVIX_TV_HEADER_POLICY || (window.__MOVIX_TV_HEADER_POLICY = {});
    api.lock = lockTvHeaderPointerNavigation;
    api.restoreInteractive = restoreTvHeaderInteractive;
    api.targets = markTvHeaderShortcutTargets;
  };

  const ensureTvHomeLayout = () => {
    if (window.MOVIX_TV !== true || window.location.pathname !== '/') return;

    const parents = Array.from(document.querySelectorAll('.home-section'))
      .map((section) => section.parentElement)
      .filter((parent) => parent instanceof HTMLElement);
    const parent = parents.find((candidate) => (
      Array.from(candidate.children)
        .filter((child) => child instanceof HTMLElement && child.classList.contains('home-section'))
        .length >= 5
    ));
    if (!(parent instanceof HTMLElement)) return;

    const direct = Array.from(parent.children)
      .filter((child) => child instanceof HTMLElement);
    const homeSections = direct.filter((child) => child.classList.contains('home-section'));
    if (homeSections.length < 5) return;

    const byText = (patterns) => homeSections.find((section) => {
      const text = normalise(section.textContent);
      return patterns.some((pattern) => text.includes(pattern));
    });

    const trending =
      byText(['tendances', 'trending']) ||
      homeSections[1] ||
      null;
    if (!(trending instanceof HTMLElement)) return;

    let recent =
      byText([
        'dernieres series',
        'series recentes',
        'recent shows',
        'latest shows',
        'recent tv',
      ]) || null;

    // Legacy remote Home keeps the featured LazySection as a direct non-home
    // child. In that layout category[0] is recent-tv and is the fifth direct
    // .home-section. This structural fallback works before LazySection renders
    // its title, so the row can be visually promoted while still a skeleton.
    if (!(recent instanceof HTMLElement)) {
      const hasLegacyFeaturedSlot = direct.some((child, index) => (
        !child.classList.contains('home-section') &&
        index > direct.indexOf(trending) &&
        index < direct.length - 1
      ));
      recent = hasLegacyFeaturedSlot ? homeSections[4] : homeSections[2];
    }
    if (!(recent instanceof HTMLElement) || recent === trending) return;

    parent.setAttribute('data-tv-home-order', '');
    parent.style.setProperty('display', 'flex');
    parent.style.setProperty('flex-direction', 'column');
    parent.style.setProperty('width', '100%');

    direct.forEach((child, index) => {
      child.style.setProperty('order', String(index * 10));
    });
    const trendingOrder = direct.indexOf(trending) * 10;
    recent.style.setProperty('order', String(trendingOrder + 1));
    recent.setAttribute('data-tv-home-recent-shows', '');

    // Hide the legacy "Notre suggestion" as soon as its async content appears.
    direct.forEach((child) => {
      const text = normalise(child.textContent);
      if (
        text.includes('notre suggestion') ||
        text.includes('team selection') ||
        text.includes('selection de l equipe')
      ) {
        hideManagedNode(child);
      }
    });
  };

  const installTvUserClickGuards = () => {
    if (window.MOVIX_TV !== true) return;
    if (window.__MOVIX_TV_USER_CLICK_GUARD_READY) return;
    window.__MOVIX_TV_USER_CLICK_GUARD_READY = true;

    document.addEventListener('click', (event) => {
      if (event.isTrusted !== true) return;
      const target = event.target instanceof Element
        ? event.target.closest('[data-movix-brand-inert], [data-tv-hero-user-inert]')
        : null;
      if (!(target instanceof HTMLElement)) return;

      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
    }, true);
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

    const root = getTvHeroRoot();

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

    const getDots = () => getTvHeroDots(root);

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
    exposeTvHeaderPointerPolicy();
    lockTvHeaderPointerNavigation();
    ensureTvHomeLayout();
    installTvUserClickGuards();
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
    if (typeof MutationObserver === 'function' && document.documentElement) {
      const observer = new MutationObserver(scheduleApply);
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-current', 'href'],
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
