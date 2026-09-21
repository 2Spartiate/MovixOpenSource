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
        .movix-tv :focus-visible {
          outline: 3px solid #ffffff !important;
          outline-offset: 3px !important;
        }

        .movix-tv [data-tv-carousel-arrow],
        .movix-tv [data-tv-favorite-overlay] {
          display: none !important;
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
