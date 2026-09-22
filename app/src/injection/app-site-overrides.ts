/**
 * App-only DOM overrides for the remote Movix site loaded by the native WebView.
 *
 * Important: the Android/iOS shell loads a remote URL, so changing ../src/**
 * alone does not change the site already deployed on that URL. These overrides
 * deliberately operate on the live DOM inside the app without requiring a web
 * deployment.
 */
export function buildAppSiteOverrides(): string {
  return `
(() => {
  const READY_KEY = '__MOVIX_APP_SITE_OVERRIDES_READY';
  if (window[READY_KEY]) return;
  window[READY_KEY] = true;

  const normalise = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .replace(/\\s+/g, ' ')
    .trim()
    .toLowerCase();

  const isPosterLink = (element) => {
    if (!(element instanceof HTMLAnchorElement)) return false;
    return Boolean(
      element.querySelector('img[src*="image.tmdb.org"]') ||
      element.querySelector('img[alt*="poster" i]')
    );
  };

  const markCarouselCards = () => {
    const posterLinks = Array.from(document.querySelectorAll('a[href]'))
      .filter(isPosterLink);

    posterLinks.forEach((link) => {
      link.setAttribute('data-tv-focus', '');
      link.setAttribute('data-tv-card', '');

      let node = link.parentElement;
      for (let depth = 0; node && depth < 7; depth += 1, node = node.parentElement) {
        const classes = String(node.className || '');
        const classList = node.classList;
        const explicitRow =
          node.hasAttribute('data-tv-carousel-row') ||
          classList?.contains('content-row-container') ||
          classList?.contains('group/carousel') ||
          Boolean(node.querySelector('.embla-slide'));

        const posterCount = node.querySelectorAll
          ? Array.from(node.querySelectorAll('a[href]')).filter(isPosterLink).length
          : 0;

        if (explicitRow || posterCount >= 3) {
          node.setAttribute('data-tv-carousel-row', '');
          node.setAttribute('data-tv-focus-group', 'carousel-row');
          break;
        }
      }
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

    // Fallback for a slightly different deployed markup.
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

      // Let React finish committing the unlocked state before closing it.
      requestAnimationFrame(() => button.click());
    });
  };

  const apply = () => {
    removeTelegramUi();
    makeMovixBrandInert();
    removeFooter();
    removeCarouselArrows();
    markCarouselCards();
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
