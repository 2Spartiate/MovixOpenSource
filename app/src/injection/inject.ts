import { buildBridgeRuntime } from './bridge-runtime';
import { buildCastShim } from './cast-shim';
import {
  buildPictureInPictureShim,
  type PictureInPictureShimMode,
} from './picture-in-picture-shim';
import { buildPlaybackAwakeShim } from './playback-awake-shim';
import { buildTvBootstrap } from './tv-bootstrap';
import { buildTvDomDiscoveryRuntime } from './tv-focus-dom';
import { buildTvDpadRuntime } from './tv-dpad-runtime';
import { findNextFocusTarget } from './tv-spatial-engine';
import { USERSCRIPT_SOURCE } from './userscript-source';

export function buildInjectedJavaScript(
  options: {
    pictureInPictureMode?: PictureInPictureShimMode;
    mediaProxyRoutingEnabled?: boolean;
    mediaProxyCapabilityEnabled?: boolean;
    mediaProxyXhrRoutingEnabled?: boolean;
    journalConsoleEnabled?: boolean;
    mediaProxyScheme?: string | null;
    tvMode?: boolean;
    tvDpadEnabled?: boolean;
  } = {},
): string {
  const castShim = buildCastShim();
  const pipShim = buildPictureInPictureShim(
    options.pictureInPictureMode ?? 'disabled',
  );
  const playbackAwakeShim = buildPlaybackAwakeShim();
  const tvBootstrap = options.tvMode ? buildTvBootstrap() : '';
  const tvDpadRuntime = options.tvMode && options.tvDpadEnabled !== false
    ? buildTvDpadRuntime(
        `(${findNextFocusTarget.toString()})`,
        buildTvDomDiscoveryRuntime(),
      )
    : '';
  const bridge = buildBridgeRuntime({
    mediaProxyRoutingEnabled: options.mediaProxyRoutingEnabled,
    mediaProxyCapabilityEnabled: options.mediaProxyCapabilityEnabled,
    mediaProxyXhrRoutingEnabled: options.mediaProxyXhrRoutingEnabled,
    journalConsoleEnabled: options.journalConsoleEnabled,
    mediaProxyScheme: options.mediaProxyScheme,
  });

  // Cast shim FIRST — must be on window before any page JS runs.
  // Block popup/new-window advertising at the JavaScript boundary as early as
  // possible. The native WebView layer also rejects onOpenWindow events.
  const popupBlocker = `
(() => {
  const blockedOpen = () => null;
  try {
    Object.defineProperty(window, 'open', {
      value: blockedOpen,
      writable: false,
      configurable: false,
    });
  } catch {
    try { window.open = blockedOpen; } catch {}
  }
})();
`;

  return `
${popupBlocker}

${castShim}

${pipShim}

${playbackAwakeShim}

${bridge}

${tvBootstrap}

${tvDpadRuntime}

// --- Userscript Movix ---
${USERSCRIPT_SOURCE}

true;
`;
}
