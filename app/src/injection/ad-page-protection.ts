// Top-level, cross-origin ad landing page guard for the native WebView.
// Cross-origin iframe bodies are inaccessible from the parent document.
export function buildAdPageProtection(trustedSiteOrigin: string): string {
  const trustedLiteral = JSON.stringify(trustedSiteOrigin);
  return String.raw`
(() => {
  const trustedSiteOrigin = ${trustedLiteral};
  if (!trustedSiteOrigin || !/^https?:\/\//i.test(trustedSiteOrigin)) return;
  try { if (new URL(trustedSiteOrigin).origin !== trustedSiteOrigin) return; }
  catch { return; }
  if (window.top !== window) return;
  if (window.location.origin === trustedSiteOrigin) return;
  if (window.__MOVIX_AD_PAGE_PROTECTION_READY) return;
  window.__MOVIX_AD_PAGE_PROTECTION_READY = true;

  let blocked = false;
  let scheduled = false;
  let observer = null;
  let backButton = null;

  const goBack = () => {
    // The requested two-step escape, or the known safe origin on short history.
    if (window.history.length >= 3) window.history.go(-2);
    else window.location.replace(trustedSiteOrigin);
  };

  const protect = () => {
    if (blocked || !document.body) return;
    blocked = true;
    if (observer) observer.disconnect();
    // Preserve document.head and cookie/storage state: replace BODY only.
    const body = document.body;
    const screen = document.createElement('main');
    screen.setAttribute('data-movix-ad-protection', '');
    screen.setAttribute('role', 'main');
    screen.style.cssText = 'box-sizing:border-box;min-height:100vh;width:100%;'
      + 'display:flex;flex-direction:column;align-items:center;justify-content:center;'
      + 'gap:24px;padding:28px;background:#090b11;color:#fff;text-align:center;'
      + 'font-family:system-ui,-apple-system,sans-serif';
    const headline = document.createElement('h1');
    headline.textContent = 'Protection antipub';
    headline.style.cssText = 'font-size:clamp(24px,4vw,36px);font-weight:700;margin:0';
    const description = document.createElement('p');
    description.textContent = 'Une page publicitaire indésirable a été détectée.';
    description.style.cssText = 'font-size:17px;max-width:540px;color:#c3c9d4;margin:0';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Retour au lecteur';
    button.setAttribute('autofocus', '');
    button.setAttribute('aria-label', 'Retour au lecteur, deux pages en arrière');
    button.style.cssText = 'background:#b91c1c;color:white;border:2px solid #fff;'
      + 'padding:15px 28px;border-radius:12px;font-size:18px;font-weight:700;'
      + 'min-height:54px;cursor:pointer;outline-offset:4px';
    screen.appendChild(headline);
    screen.appendChild(description);
    screen.appendChild(button);
    backButton = button;
    body.replaceChildren(screen);
    body.style.cssText = 'margin:0;padding:0;min-height:100vh;background:#090b11';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      goBack();
    });
    button.focus();
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => button.focus());
    }
  };

  // Prevent click-through into the former ad even if it registered listeners.
  window.addEventListener('click', event => {
    if (!blocked) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    if (backButton && (event.target === backButton || backButton.contains(event.target))) {
      goBack();
    }
  }, true);

  const scan = () => {
    if (blocked || !document.body) return;
    // Only visible text/title: never script text, URLs or hidden source code.
    const text = String(document.title || '') + ' '
      + String(document.body.innerText || document.body.textContent || '');
    if (/\b(?:vpn|porn|porno)\b/i.test(text.slice(0, 100000))) protect();
  };
  const scheduleScan = () => {
    if (blocked || scheduled) return;
    scheduled = true;
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => { scheduled = false; scan(); });
    } else { scheduled = false; scan(); }
  };
  const start = () => {
    scan();
    if (!blocked && typeof MutationObserver === 'function' && document.documentElement) {
      observer = new MutationObserver(scheduleScan);
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else { start(); }
})();
true;
`;
}
