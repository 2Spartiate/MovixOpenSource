import { buildAppSiteOverrides } from './app-site-overrides';
import { buildParentalControlsRuntime } from './parental-injection';
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
import { buildTvPlaybackRuntime } from './tv-playback-runtime';
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
  const parentalControlsRuntime = buildParentalControlsRuntime();
  const castShim = buildCastShim();
  const pipShim = buildPictureInPictureShim(
    options.pictureInPictureMode ?? 'disabled',
  );
  const playbackAwakeShim = buildPlaybackAwakeShim();
  const tvBootstrap = options.tvMode ? buildTvBootstrap() : '';
  const tvPlaybackRuntime = options.tvMode ? buildTvPlaybackRuntime() : '';
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

  // Android app safety policy: the upstream site's adult ad toggle defaults
  // to enabled. Override its persisted preference at document start, before
  // React mounts, and repair it if a later settings event turns it back on.
  // Do not monkey-patch localStorage or remove third-party player iframes.
  const adultAdOptOut = `
(() => {
  const enforceSafeAds = () => {
    try { window.localStorage.setItem('settings_ad_popup_adult', 'false'); } catch {}
  };
  enforceSafeAds();
  window.addEventListener('ad_popup_adult_changed', enforceSafeAds, true);
  window.addEventListener('storage', (event) => {
    if (event.key === 'settings_ad_popup_adult') enforceSafeAds();
  }, true);
})();
`;

  // Keep the clean-baseline shared policy. TV adds only its marker/runtime
  // around that same WebView bootstrap; handheld never receives TV code.
  return `
${popupBlocker}

${adultAdOptOut}

${tvBootstrap}

${appSiteOverrides}

${parentalControlsRuntime}

${castShim}

${pipShim}

${playbackAwakeShim}

${bridge}

${tvPlaybackRuntime}

${tvDpadRuntime}

// --- Userscript Movix ---
${USERSCRIPT_SOURCE}

true;
`;
}
