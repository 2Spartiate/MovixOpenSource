const TV_BOOTSTRAP_READY = '__MOVIX_TV_BOOTSTRAP_READY';
const TV_STYLE_ID = 'movix-tv-bootstrap-style';

export function buildTvBootstrap(): string {
  return `
(() => {
  const applyTvMarkers = () => {
    window.MOVIX_TV = true;

    const root = document.documentElement;
    if (!root) return false;

    root.classList.add('movix-tv');

    if (!document.getElementById('movix-tv-bootstrap-style')) {
      const style = document.createElement('style');
      style.id = 'movix-tv-bootstrap-style';
      style.textContent = \`
        .movix-tv,
        .movix-tv body {
          scroll-behavior: auto !important;
          scrollbar-width: none !important;
          -ms-overflow-style: none !important;
          overscroll-behavior: none !important;
        }

        .movix-tv::-webkit-scrollbar,
        .movix-tv body::-webkit-scrollbar,
        .movix-tv *::-webkit-scrollbar {
          width: 0 !important;
          height: 0 !important;
          display: none !important;
        }

        .movix-tv :focus-visible {
          outline: 3px solid #dc2626 !important;
          outline-offset: 3px !important;
          box-shadow: 0 0 0 1px rgba(220, 38, 38, 0.35) !important;
        }

        .movix-tv [data-tv-favorite-overlay] {
          display: none !important;
        }

        .movix-tv .hero-progress-fill {
          --hero-duration: 10000ms !important;
          animation-duration: 10000ms !important;
          animation-play-state: running !important;
        }
      \`;
      (document.head || root).appendChild(style);
    }

    return true;
  };

  if (window['__MOVIX_TV_BOOTSTRAP_READY'] === true) {
    applyTvMarkers();
    return;
  }

  window['__MOVIX_TV_BOOTSTRAP_READY'] = true;

  if (!applyTvMarkers()) {
    document.addEventListener('DOMContentLoaded', applyTvMarkers, { once: true });
  }
})();
`;
}
