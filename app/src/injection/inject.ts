import { buildAppSiteOverrides } from './app-site-overrides';
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
  } = {},
): string {
  const appSiteOverrides = buildAppSiteOverrides();
  const castShim = buildCastShim();
  const pipShim = buildPictureInPictureShim(
    options.pictureInPictureMode ?? 'disabled',
  );
  const playbackAwakeShim = buildPlaybackAwakeShim();
  const tvBootstrap = options.tvMode ? buildTvBootstrap() : '';
  const tvDpadRuntime = options.tvMode
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

  // Block popup/new-window advertising before any page JS can register
  // its own opener. The native WebView layer also rejects onOpenWindow.
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

  // Popup blocker + app DOM overrides run before the remote site scripts.
  return `
${popupBlocker}

${appSiteOverrides}

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
