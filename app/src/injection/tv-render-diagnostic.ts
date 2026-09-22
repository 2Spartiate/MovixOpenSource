export function buildTvRenderDiagnostic(): string {
  return `
(() => {
  if (window.__MOVIX_TV_RENDER_DIAG_INSTALLED) return;
  window.__MOVIX_TV_RENDER_DIAG_INSTALLED = true;

  const errors = [];
  let serviceWorkerRegistrations = null;

  const safeString = (value) => {
    try {
      if (value instanceof Error) return value.message || String(value);
      if (typeof value === 'string') return value;
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };

  const send = (payload) => {
    try {
      window.ReactNativeWebView?.postMessage(
        'MOVIX_TV_DIAG:' + JSON.stringify(payload)
      );
    } catch {}
  };

  const snapshot = (phase) => {
    let root = null;
    let rootStyle = null;
    let rootRect = null;
    let bodyText = '';

    try {
      root = document.getElementById('root');
      if (root) {
        const style = window.getComputedStyle(root);
        const rect = root.getBoundingClientRect();
        rootStyle = {
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
        };
        rootRect = {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      }
      bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 180);
    } catch {}

    let uaData = null;
    try {
      const data = navigator.userAgentData;
      if (data) {
        uaData = {
          mobile: data.mobile,
          platform: data.platform,
          brands: Array.isArray(data.brands) ? data.brands : undefined,
        };
      }
    } catch {}

    send({
      phase,
      href: location.href,
      readyState: document.readyState,
      rootExists: !!root,
      rootChildren: root ? root.childElementCount : -1,
      bodyChildren: document.body ? document.body.childElementCount : -1,
      rootStyle,
      rootRect,
      bodyText,
      serviceWorkerControlled: !!navigator.serviceWorker?.controller,
      serviceWorkerRegistrations,
      userAgent: navigator.userAgent,
      uaData,
      lastError: errors.length ? errors[errors.length - 1] : null,
      errorCount: errors.length,
    });
  };

  window.addEventListener('error', (event) => {
    const entry = {
      type: 'error',
      message: event.message || 'window error',
      source: event.filename || '',
      line: event.lineno || 0,
      column: event.colno || 0,
    };
    errors.push(entry);
    if (errors.length > 10) errors.shift();
    send({ phase: 'js-error', ...entry });
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    const entry = {
      type: 'unhandledrejection',
      message: safeString(event.reason),
    };
    errors.push(entry);
    if (errors.length > 10) errors.shift();
    send({ phase: 'js-error', ...entry });
  });

  try {
    if (navigator.serviceWorker?.getRegistrations) {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => {
          serviceWorkerRegistrations = registrations.length;
          send({
            phase: 'sw-state',
            registrations: registrations.length,
            controlled: !!navigator.serviceWorker.controller,
          });
        })
        .catch(() => {});
    }
  } catch {}

  snapshot('before-content');

  document.addEventListener('DOMContentLoaded', () => {
    snapshot('dom-content-loaded');
  }, { once: true });

  window.addEventListener('load', () => {
    snapshot('window-load');
  }, { once: true });

  setTimeout(() => snapshot('after-1000ms'), 1000);
  setTimeout(() => snapshot('after-5000ms'), 5000);
})();
`;
}
