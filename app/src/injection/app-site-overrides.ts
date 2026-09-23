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

  const apply = () => {
    removeTelegramUi();
    advancePlaybackGate();
  };

  const start = () => {
    apply();
    if (typeof MutationObserver === 'function' && document.documentElement) {
      const observer = new MutationObserver(() => apply());
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
