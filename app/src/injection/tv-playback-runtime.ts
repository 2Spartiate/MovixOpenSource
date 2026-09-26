export function buildTvPlaybackRuntime(): string {
  return `
(() => {
  if (window.MOVIX_TV !== true) return;

  const api = window.__MOVIX_TV_PLAYBACK || (window.__MOVIX_TV_PLAYBACK = {});
  api.runtimeVersion = 'tv-playback-v17';

  if (typeof api.keydownHandler === 'function') {
    window.removeEventListener('keydown', api.keydownHandler, true);
    document.removeEventListener('keydown', api.keydownHandler, true);
  }
  if (typeof api.focusinHandler === 'function') {
    document.removeEventListener('focusin', api.focusinHandler, true);
  }
  if (typeof api.backHandler === 'function') {
    window.removeEventListener('movix-tv-back', api.backHandler);
  }
  if (api.focusObserver && typeof api.focusObserver.disconnect === 'function') {
    api.focusObserver.disconnect();
  }
  if (api.focusTimer) {
    clearTimeout(api.focusTimer);
    api.focusTimer = null;
  }
  if (api.autoProfileTimer) {
    clearTimeout(api.autoProfileTimer);
    api.autoProfileTimer = null;
  }
  api.profileSelectionBusy = false;
  const runtimeGeneration = (api.runtimeGeneration || 0) + 1;
  api.runtimeGeneration = runtimeGeneration;

  const normalise = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .replace(/\\s+/g, ' ')
    .trim()
    .toLowerCase();

  const visible = (element) => {
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  };

  const getActiveVideo = () => {
    const candidates = Array.from(document.querySelectorAll('video'))
      .filter((video) => video instanceof HTMLVideoElement && visible(video))
      .map((video) => {
        const rect = video.getBoundingClientRect();
        return { video, area: rect.width * rect.height };
      })
      .sort((a, b) => b.area - a.area);
    return candidates[0]?.video || null;
  };

  const getPlayerRoot = (video) => {
    if (!(video instanceof HTMLVideoElement)) return null;
    const explicit = video.closest('[data-hls-player-root]');
    if (explicit instanceof HTMLElement) return explicit;
    const player = video.closest('.video-container');
    if (player instanceof HTMLElement) return player;

    let node = video.parentElement;
    let best = node;
    for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
      if (!(node instanceof HTMLElement)) continue;
      const buttons = node.querySelectorAll('button, [role="button"]');
      if (buttons.length >= 2) best = node;
      if (buttons.length >= 4) return node;
    }
    return best instanceof HTMLElement ? best : video.parentElement;
  };

  const buttonSignature = (button) => normalise(
    String(button.textContent || '') + ' ' +
    String(button.getAttribute('aria-label') || '') + ' ' +
    String(button.getAttribute('title') || '')
  );

  const getPlayPauseButton = (root) => {
    if (!(root instanceof HTMLElement)) return null;
    const explicit = root.querySelector('[data-tv-player-play-pause]');
    if (explicit instanceof HTMLElement && visible(explicit)) return explicit;

    const buttons = Array.from(root.querySelectorAll('button, [role="button"]'))
      .filter((button) => button instanceof HTMLElement && visible(button));
    return buttons.find((button) => {
      const signature = buttonSignature(button);
      return (
        signature === 'lecture' ||
        signature === 'play' ||
        signature === 'pause' ||
        signature.includes('lecture pause') ||
        Boolean(button.querySelector('svg.lucide-play, svg.lucide-pause, .lucide-play, .lucide-pause'))
      );
    }) || null;
  };

  const getFullscreenButton = (root, exitMode) => {
    if (!(root instanceof HTMLElement)) return null;
    const buttons = Array.from(root.querySelectorAll('button, [role="button"]'))
      .filter((button) => button instanceof HTMLElement && visible(button));

    const preferred = buttons.find((button) => {
      const signature = buttonSignature(button);
      if (exitMode) {
        return (
          signature.includes('quitter le plein ecran') ||
          signature.includes('exit fullscreen') ||
          Boolean(button.querySelector('svg.lucide-minimize, .lucide-minimize'))
        );
      }
      return (
        signature === 'plein ecran' ||
        signature.includes('fullscreen') ||
        Boolean(button.querySelector('svg.lucide-maximize, .lucide-maximize'))
      );
    });
    if (preferred) return preferred;

    return buttons.find((button) => {
      const signature = buttonSignature(button);
      return signature.includes('plein ecran') || signature.includes('fullscreen');
    }) || null;
  };

  const isFullscreen = (video) => Boolean(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    video?.webkitDisplayingFullscreen
  );

  const focusPlayPause = () => {
    if (getQuickMenu() || api.advancedSettingsPending || getOpenPlayerPanel()) return false;
    const video = getActiveVideo();
    const root = getPlayerRoot(video);
    const button = getPlayPauseButton(root);
    if (!(button instanceof HTMLElement)) return false;
    try { button.focus({ preventScroll: true }); } catch { button.focus(); }
    return document.activeElement === button;
  };

  const schedulePlayPauseFocus = (delay = 180) => {
    if (api.focusTimer) clearTimeout(api.focusTimer);
    api.focusTimer = setTimeout(() => {
      api.focusTimer = null;
      if (getQuickMenu() || api.advancedSettingsPending || getOpenPlayerPanel()) return;
      const video = getActiveVideo();
      const root = getPlayerRoot(video);
      if (!video || !(root instanceof HTMLElement)) return;
      const active = document.activeElement;
      const empty = !active || active === document.body || active === document.documentElement;
      if (empty || !(active instanceof HTMLElement) || !root.contains(active)) {
        focusPlayPause();
      }
    }, delay);
  };

  const seek = (video, delta) => {
    if (!(video instanceof HTMLVideoElement) || !Number.isFinite(video.currentTime)) return false;
    const duration = Number.isFinite(video.duration) ? video.duration : Number.POSITIVE_INFINITY;
    video.currentTime = Math.max(0, Math.min(duration, video.currentTime + delta));
    return true;
  };

  const enterFullscreen = async (video, root) => {
    if (!(video instanceof HTMLVideoElement) || isFullscreen(video)) return true;
    const button = getFullscreenButton(root, false);
    if (button instanceof HTMLElement) {
      button.click();
      setTimeout(focusPlayPause, 220);
      return true;
    }

    const target = root instanceof HTMLElement ? root : video;
    try {
      if (typeof target.requestFullscreen === 'function') {
        await target.requestFullscreen();
        setTimeout(focusPlayPause, 220);
        return true;
      }
      if (typeof video.webkitEnterFullscreen === 'function') {
        video.webkitEnterFullscreen();
        setTimeout(focusPlayPause, 220);
        return true;
      }
    } catch {}
    return false;
  };

  const exitFullscreen = async (video, root) => {
    if (!(video instanceof HTMLVideoElement)) return false;
    if (!isFullscreen(video)) return true;

    try {
      if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
        await document.exitFullscreen();
        setTimeout(focusPlayPause, 220);
        return true;
      }
      if (document.webkitFullscreenElement && typeof document.webkitExitFullscreen === 'function') {
        document.webkitExitFullscreen();
        setTimeout(focusPlayPause, 220);
        return true;
      }
      if (video.webkitDisplayingFullscreen && typeof video.webkitExitFullscreen === 'function') {
        video.webkitExitFullscreen();
        setTimeout(focusPlayPause, 220);
        return true;
      }
    } catch {}

    const button = getFullscreenButton(root, true);
    if (button instanceof HTMLElement) {
      button.click();
      setTimeout(focusPlayPause, 220);
      return true;
    }
    return false;
  };

  const playerControlOwnsArrows = (root) => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !(root instanceof HTMLElement) || !root.contains(active)) {
      return false;
    }
    if (active.matches('input, textarea, select, [role="slider"]')) return true;
    const button = active.closest('button, [role="button"]');
    if (!(button instanceof HTMLElement)) return false;
    return button !== getPlayPauseButton(root);
  };

  const hasPriorityOverlay = (root) => {
    if (getQuickMenu() || getOpenPlayerPanel()) return true;
    const candidates = Array.from(document.querySelectorAll(
      '[role="dialog"], [role="menu"], [data-source-menu], [data-tv-playback-quick-menu], [data-tv-dpad-scope="native"]'
    ));
    return candidates.some((element) => {
      if (!(element instanceof HTMLElement) || !visible(element)) return false;
      return !(root instanceof HTMLElement) || root.contains(element) || element.getAttribute('aria-modal') === 'true';
    });
  };

  const PROFILE_KEY = 'movix.tv.playback.profile.v1';
  const MENU_ID = 'movix-tv-injected-playback-menu';
  const MENU_STYLE_ID = 'movix-tv-injected-playback-menu-style';
  const PANEL_STYLE_ID = 'movix-tv-injected-player-panel-style';
  const AUTO_SETTINGS_STYLE_ID = 'movix-tv-auto-source-selection-style';
  const AUTO_SETTINGS_CLASS = 'movix-tv-auto-source-selection';

  const getPlaybackProfile = () => {
    try { return localStorage.getItem(PROFILE_KEY) === 'vf' ? 'vf' : 'vo-fr'; }
    catch { return 'vo-fr'; }
  };

  const isFrenchLanguage = (value) => {
    const language = normalise(value).split('-')[0];
    return (
      language === 'fr' ||
      language === 'fra' ||
      language === 'fre' ||
      normalise(value).includes('french') ||
      normalise(value).includes('francais')
    );
  };

  const applyProfileToCurrentTracks = (video, profile) => {
    if (!(video instanceof HTMLVideoElement)) return;

    // Best effort on the current manifest only. Cross-source Nexus/Bravo
    // selection remains owned by the full V12 resolver when that frontend is
    // actually deployed; the injected fallback never invents compatibility.
    try {
      const audioTracks = video.audioTracks;
      if (audioTracks && typeof audioTracks.length === 'number') {
        let selected = -1;
        for (let index = 0; index < audioTracks.length; index += 1) {
          const track = audioTracks[index];
          const french = isFrenchLanguage(track.language || track.label || '');
          if (profile === 'vf' ? french : !french) {
            selected = index;
            break;
          }
        }
        if (selected >= 0) {
          for (let index = 0; index < audioTracks.length; index += 1) {
            audioTracks[index].enabled = index === selected;
          }
        }
      }
    } catch {}

    try {
      const tracks = video.textTracks;
      if (tracks && typeof tracks.length === 'number') {
        let frenchSubtitle = -1;
        for (let index = 0; index < tracks.length; index += 1) {
          const track = tracks[index];
          if (isFrenchLanguage(track.language || track.label || '')) {
            frenchSubtitle = index;
            break;
          }
        }
        for (let index = 0; index < tracks.length; index += 1) {
          tracks[index].mode =
            profile === 'vo-fr' && index === frenchSubtitle ? 'showing' : 'disabled';
        }
      }
    } catch {}
  };

  const setPlaybackProfile = (profile) => {
    try { localStorage.setItem(PROFILE_KEY, profile); } catch {}
    const video = getActiveVideo();
    applyProfileToCurrentTracks(video, profile);
    try {
      window.dispatchEvent(new CustomEvent('movix-tv-playback-profile-change', {
        detail: { profile, origin: 'tv-webview-injection' },
      }));
    } catch {}
    return profile;
  };

  const ensureQuickMenuStyle = () => {
    if (document.getElementById(MENU_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = MENU_STYLE_ID;
    style.textContent = [
      '#'+MENU_ID+'{position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.58);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
      '#'+MENU_ID+' .movix-tv-menu-card{width:min(520px,82vw);padding:22px;border:1px solid rgba(239,68,68,.58);border-radius:18px;background:#111;color:#fff;box-shadow:0 24px 80px rgba(0,0,0,.55);}',
      '#'+MENU_ID+' .movix-tv-menu-title{font-size:22px;font-weight:800;margin:0 0 14px;}',
      '#'+MENU_ID+' .movix-tv-menu-action{width:100%;display:flex;align-items:center;justify-content:space-between;gap:18px;margin-top:10px;padding:14px 16px;border-radius:12px;border:1px solid #3f3f46;background:#18181b;color:#fff;font-size:17px;text-align:left;}',
      '#'+MENU_ID+' .movix-tv-menu-action:focus{outline:3px solid #ef4444;outline-offset:2px;background:#3f1418;}',
      '#'+MENU_ID+' .movix-tv-menu-sub{font-size:13px;color:#a1a1aa;font-weight:500;}'
    ].join('');
    (document.head || document.documentElement).appendChild(style);
  };

  const getQuickMenu = () => document.getElementById(MENU_ID);

  const closeQuickMenu = (restorePlayerFocus = true) => {
    const menu = getQuickMenu();
    if (menu) menu.remove();
    api.quickMenuFocusIndex = 0;
    if (restorePlayerFocus && !getOpenPlayerPanel()) setTimeout(focusPlayPause, 0);
  };

  const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  const waitUntil = async (predicate, timeout = 6000, interval = 80) => {
    const started = performance.now();
    while (performance.now() - started < timeout) {
      try {
        const value = predicate();
        if (value) return value;
      } catch {}
      await sleep(interval);
    }
    return null;
  };

  const ensureAutoSettingsStyle = () => {
    if (document.getElementById(AUTO_SETTINGS_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = AUTO_SETTINGS_STYLE_ID;
    style.textContent =
      'html.'+AUTO_SETTINGS_CLASS+' .settings-menu{' +
      'opacity:0!important;visibility:hidden!important;pointer-events:none!important;' +
      'transform:none!important;transition:none!important;}';
    (document.head || document.documentElement).appendChild(style);
  };

  const getSettingsTrigger = (root = getPlayerRoot(getActiveVideo())) => {
    const scope = root instanceof HTMLElement ? root : document;
    const exact = scope.querySelector('[data-tv-player-menu-trigger="settings"]');
    if (exact instanceof HTMLElement) return exact;
    const documentTrigger = document.querySelector('[data-tv-player-menu-trigger="settings"]');
    if (documentTrigger instanceof HTMLElement) return documentTrigger;
    const matchesSettings = (button) => {
      if (!(button instanceof HTMLElement)) return false;
      const signature = buttonSignature(button);
      return signature.includes('parametres') || signature.includes('settings') ||
        Boolean(button.querySelector('svg.lucide-settings, svg.lucide-settings-2, .lucide-settings'));
    };
    return Array.from(scope.querySelectorAll('button, [role="button"]')).find(matchesSettings) ||
      Array.from(document.querySelectorAll('.video-container .control-bar button')).find(matchesSettings) || null;
  };

  const getSettingsPanel = () => {
    const exact = document.querySelector('.settings-menu[data-player-menu="settings"], .settings-menu');
    return exact instanceof HTMLElement ? exact : null;
  };

  const getEpisodesPanel = () => {
    if (api.episodesPanel instanceof HTMLElement && api.episodesPanel.isConnected &&
        visible(api.episodesPanel)) return api.episodesPanel;
    const explicit = document.querySelector('[data-tv-episodes-menu]');
    if (explicit instanceof HTMLElement && visible(explicit)) return explicit;

    // WatchTv/WatchAnime and the HLS internal episode list render their real
    // panel at z-[11000]/z-[12000]. Their scrollable button list distinguishes
    // that panel from controls, source groups and the quick menu, even on the
    // remote frontend before data-tv-episodes-menu has been deployed.
    const candidates = Array.from(document.querySelectorAll('div')).filter((node) => {
      if (!(node instanceof HTMLElement) || !visible(node)) return false;
      const classes = String(node.className || '');
      if (!classes.includes('z-[11000]') && !classes.includes('z-[12000]')) return false;
      return Boolean(node.querySelector('h3') && node.querySelector('.overflow-y-auto button'));
    });
    return candidates[0] || null;
  };

  const getOpenPlayerPanel = () => {
    const settings = getSettingsPanel();
    if (settings instanceof HTMLElement && visible(settings)) {
      settings.setAttribute('data-tv-injected-panel', 'settings');
      return { kind: 'settings', panel: settings };
    }
    const episodes = getEpisodesPanel();
    if (episodes instanceof HTMLElement) {
      episodes.setAttribute('data-tv-injected-panel', 'episodes');
      return { kind: 'episodes', panel: episodes };
    }
    return null;
  };

  const ensurePlayerPanelStyle = () => {
    if (document.getElementById(PANEL_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = PANEL_STYLE_ID;
    style.textContent = '[data-tv-injected-panel] :is(button,a,[tabindex]):focus{' +
      'outline:3px solid #ef4444!important;outline-offset:2px!important;}';
    (document.head || document.documentElement).appendChild(style);
  };

  const getPanelFocusables = (panel) => {
    if (!(panel instanceof HTMLElement)) return [];
    return Array.from(panel.querySelectorAll(
      'button, a[href], input, select, textarea, [role="button"], [role="slider"], [tabindex]'
    )).filter((element) => {
      if (!(element instanceof HTMLElement) || element.disabled ||
          element.getAttribute('tabindex') === '-1' || !visible(element)) return false;
      for (let node = element; node && node !== panel; node = node.parentElement) {
        if (node.getAttribute('aria-hidden') === 'true' || node.hasAttribute('inert')) return false;
        const style = window.getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      }
      return true;
    });
  };

  const focusPanelItem = (item) => {
    if (!(item instanceof HTMLElement)) return false;
    try { item.focus({ preventScroll: true }); } catch { item.focus(); }
    try { item.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch {}
    return document.activeElement === item;
  };

  const getPanelCloseButton = (panel) => {
    const title = panel?.querySelector('h3');
    const headerButton = title?.parentElement?.querySelector('button');
    if (headerButton instanceof HTMLElement) return headerButton;
    return Array.from(panel?.querySelectorAll('button') || []).find((button) =>
      button.querySelector('svg.lucide-x, .lucide-x') ||
      ['fermer', 'close'].includes(buttonSignature(button))
    ) || null;
  };

  const closePlayerPanel = (open) => {
    if (!open) return false;
    const button = getPanelCloseButton(open.panel);
    if (!(button instanceof HTMLElement)) return false;
    if (open.kind === 'settings') api.manualSettingsOpen = false;
    if (open.kind === 'episodes') api.episodesPanel = null;
    api.panelFocusItem = null;
    api.panelFocusIndex = null;
    button.click();
    schedulePlayPauseFocus(350);
    return true;
  };

  const openHiddenQualitySettings = async () => {
    if (api.manualSettingsOpen) return null;
    ensureAutoSettingsStyle();
    document.documentElement.classList.add(AUTO_SETTINGS_CLASS);

    let panel = getSettingsPanel();
    if (!(panel instanceof HTMLElement)) {
      const trigger = getSettingsTrigger();
      if (!(trigger instanceof HTMLElement)) {
        document.documentElement.classList.remove(AUTO_SETTINGS_CLASS);
        return null;
      }
      trigger.click();
      panel = await waitUntil(() => getSettingsPanel(), 3500, 60);
    }
    if (!(panel instanceof HTMLElement)) {
      document.documentElement.classList.remove(AUTO_SETTINGS_CLASS);
      return null;
    }

    const qualityTab = panel.querySelector('[data-tv-settings-tab="quality"]');
    if (qualityTab instanceof HTMLElement && qualityTab.getAttribute('aria-pressed') !== 'true') {
      qualityTab.click();
    }

    const sourceMenu = await waitUntil(
      () => panel.querySelector('[data-source-menu]'),
      2500,
      50
    );
    return sourceMenu instanceof HTMLElement ? { panel, sourceMenu } : { panel, sourceMenu: panel };
  };

  const closeHiddenSettings = async () => {
    if (api.manualSettingsOpen) {
      document.documentElement.classList.remove(AUTO_SETTINGS_CLASS);
      return;
    }
    const panel = getSettingsPanel();
    if (panel instanceof HTMLElement) {
      const closeButton = Array.from(panel.querySelectorAll('button')).find((button) => {
        if (!(button instanceof HTMLElement)) return false;
        const signature = buttonSignature(button);
        return signature === 'fermer' || signature === 'close' ||
          Boolean(button.querySelector('svg.lucide-x, .lucide-x'));
      });
      if (closeButton instanceof HTMLElement) closeButton.click();
      else {
        const trigger = getSettingsTrigger();
        if (trigger instanceof HTMLElement) trigger.click();
      }
    }
    await sleep(50);
    document.documentElement.classList.remove(AUTO_SETTINGS_CLASS);
  };

  const getQualityScanButton = (scope) => {
    if (!(scope instanceof HTMLElement)) return null;
    return Array.from(scope.querySelectorAll('button')).find((button) => {
      if (!(button instanceof HTMLElement)) return false;
      const signature = buttonSignature(button);
      return Boolean(button.querySelector('svg.lucide-gauge, .lucide-gauge')) ||
        ((signature.includes('qualit') || signature.includes('quality')) &&
          (signature.includes('verif') || signature.includes('check')));
    }) || null;
  };

  const runQualityScan = async (scope) => {
    const button = getQualityScanButton(scope);
    if (!(button instanceof HTMLElement)) return false;

    button.click();
    const started = await waitUntil(
      () => !button.isConnected || getQualityScanButton(scope) !== button,
      1800,
      60
    );
    if (!started) return false;
    return Boolean(await waitUntil(() => getQualityScanButton(scope), 50000, 180));
  };

  const findGroupButton = (scope, token) => {
    if (!(scope instanceof HTMLElement)) return null;
    return Array.from(scope.querySelectorAll('button')).find((button) => {
      if (!(button instanceof HTMLElement)) return false;
      const signature = buttonSignature(button);
      return signature.includes(token);
    }) || null;
  };

  const findExpandedGroupPanel = (groupButton) => {
    if (!(groupButton instanceof HTMLElement)) return null;
    let node = groupButton.parentElement;
    for (let depth = 0; node && depth < 5; depth += 1, node = node.parentElement) {
      let sibling = node.nextElementSibling;
      while (sibling) {
        if (
          sibling instanceof HTMLElement &&
          sibling.classList.contains('border-l-2') &&
          sibling.querySelector('button')
        ) {
          return sibling;
        }
        sibling = sibling.nextElementSibling;
      }
    }
    return null;
  };

  const getGroupSourceButtons = async (scope, token) => {
    const groupButton = findGroupButton(scope, token);
    if (!(groupButton instanceof HTMLElement)) return [];

    let panel = findExpandedGroupPanel(groupButton);
    if (!(panel instanceof HTMLElement)) {
      groupButton.click();
      panel = await waitUntil(() => findExpandedGroupPanel(groupButton), 1800, 50);
    }
    if (!(panel instanceof HTMLElement)) return [];

    return Array.from(panel.querySelectorAll('button')).filter((button) => {
      if (!(button instanceof HTMLElement)) return false;
      const signature = buttonSignature(button);
      if (!signature) return false;
      if (signature === 'copier' || signature === 'copy') return false;
      if (signature.includes('copier') || signature.includes('copy')) return false;
      if (signature.includes('epingler') || signature.includes('pin')) return false;
      if (signature.includes('fermer') || signature.includes('close')) return false;
      return true;
    });
  };

  const qualityScoreForButton = (button) => {
    if (!(button instanceof HTMLElement)) return 0;
    const text = String(button.textContent || '');
    if (/\\b4\\s*k\\b/i.test(text) || /\\buhd\\b/i.test(text)) return 2160;
    const heights = Array.from(text.matchAll(/(\\d{3,4})\\s*p\\b/gi))
      .map((match) => Number(match[1]))
      .filter((value) => Number.isFinite(value));
    if (heights.length > 0) return Math.max(...heights);
    if (/\\bfhd\\b/i.test(text)) return 1080;
    if (/\\bhd\\b/i.test(text)) return 720;
    return 0;
  };

  const trackLanguagesForButton = (button, attribute) =>
    String(button.getAttribute(attribute) || '').split(',').map(normalise).filter(Boolean);

  const compatibleCandidate = (button, provider, profile, signature) => {
    const vostfr = signature.includes('vostfr');
    const multi = signature.includes('multi');
    const audio = trackLanguagesForButton(button, 'data-tv-source-audio');
    const subtitles = trackLanguagesForButton(button, 'data-tv-source-subtitles');
    const original = normalise(document.querySelector('[data-tv-original-language]')
      ?.getAttribute('data-tv-original-language'));

    if (profile === 'vf') {
      if (provider === 'nexus' && vostfr) return false;
      if (provider === 'bravo' && multi) return false;
      // Unknown metadata on the legacy remote site is provisional; explicit
      // manifest metadata, when supplied, must actually contain French audio.
      return audio.length === 0 || audio.some(isFrenchLanguage);
    }
    if (provider === 'nexus') return vostfr;
    if (!multi) return false;
    if (audio.length > 0 && !audio.some((language) =>
      original ? language.split('-')[0] === original.split('-')[0] : !isFrenchLanguage(language)
    )) return false;
    if (subtitles.length > 0 && !subtitles.some(isFrenchLanguage)) return false;
    return true;
  };

  const buildProfileCandidates = async (scope, profile) => {
    const nexusButtons = await getGroupSourceButtons(scope, 'nexus');
    const bravoButtons = await getGroupSourceButtons(scope, 'bravo');

    const candidates = [];
    nexusButtons.forEach((button, index) => {
      const signature = buttonSignature(button);
      if (compatibleCandidate(button, 'nexus', profile, signature)) {
        candidates.push({
          provider: 'nexus',
          button,
          index,
          signature,
          quality: qualityScoreForButton(button),
        });
      }
    });

    bravoButtons.forEach((button, index) => {
      const signature = buttonSignature(button);
      if (compatibleCandidate(button, 'bravo', profile, signature)) {
        candidates.push({
          provider: 'bravo',
          button,
          index,
          signature,
          quality: qualityScoreForButton(button),
        });
      }
    });

    return candidates.sort((left, right) =>
      right.quality - left.quality ||
      (left.provider === right.provider ? 0 : (left.provider === 'nexus' ? -1 : 1)) ||
      left.index - right.index
    );
  };

  const scheduleTrackProfileApplication = (profile) => {
    [250, 900, 1800, 3500, 5500].forEach((delay) => {
      setTimeout(() => applyProfileToCurrentTracks(getActiveVideo(), profile), delay);
    });
  };

  const waitForFrontendResolution = (profile) => {
    // A V12/V14 boolean only proves that a listener exists, not that it
    // actually chose a source. Only the versioned completion event counts.
    if (window.__MOVIX_TV_PROFILE_RESOLVER?.version !== 2) return null;
    let finish;
    const promise = new Promise((resolve) => { finish = resolve; });
    const listener = (event) => {
      if (event.detail?.requestedProfile !== profile) return;
      cleanup();
      finish(event.detail);
    };
    const timer = setTimeout(() => { cleanup(); finish(null); }, 18000);
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('movix-tv-playback-profile-result', listener);
    };
    window.addEventListener('movix-tv-playback-profile-result', listener);
    return { promise, cleanup };
  };

  const clickSourceAndConfirm = async (winner) => {
    let finish;
    const confirmation = new Promise((resolve) => { finish = resolve; });
    const listener = (event) => {
      const type = String(event.detail?.type || '');
      if (winner.provider === 'nexus' ? !type.startsWith('nexus') : type !== 'bravo') return;
      cleanup();
      finish(event.detail);
    };
    const timer = setTimeout(() => { cleanup(); finish(null); }, 1500);
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('sourceChange', listener);
    };
    window.addEventListener('sourceChange', listener);
    winner.button.click();
    return confirmation;
  };

  const performBestProfileSource = async (profile, options, requestId) => {
    if (requestId !== api.profileRequestId || api.runtimeGeneration !== runtimeGeneration) {
      return { status: 'superseded', profile };
    }
    api.profileSelectionBusy = true;
    try {
      const frontend = waitForFrontendResolution(profile);
      setPlaybackProfile(profile);

      if (frontend) {
        const result = await frontend.promise;
        if (result?.status === 'selected') {
          scheduleTrackProfileApplication(result.profile || profile);
          return { ...result, status: 'selected', requestedProfile: profile };
        }
      }

      if (requestId !== api.profileRequestId || api.runtimeGeneration !== runtimeGeneration) {
        return { status: 'superseded', profile };
      }

      const opened = await openHiddenQualitySettings();
      if (!opened) {
        return { status: 'settings-unavailable', profile };
      }

      const scope = opened.sourceMenu;
      const qualityVerified = await runQualityScan(scope);

      if (requestId !== api.profileRequestId || api.runtimeGeneration !== runtimeGeneration) {
        await closeHiddenSettings();
        return { status: 'superseded', profile };
      }

      let candidates = await buildProfileCandidates(scope, profile);
      let effectiveProfile = profile;

      if (candidates.length === 0 && profile === 'vo-fr' && options.allowVfFallback === true) {
        candidates = await buildProfileCandidates(scope, 'vf');
        effectiveProfile = 'vf';
      }

      const winner = candidates[0] || null;
      if (!(winner?.button instanceof HTMLElement)) {
        await closeHiddenSettings();
        return { status: 'no-match', profile };
      }

      if (effectiveProfile !== profile) {
        // This is an automatic fallback for this title, not a new persistent
        // user preference. Keep PROFILE_KEY on VOSTFR so the next title tries
        // VOSTFR again.
        try {
          window.dispatchEvent(new CustomEvent('movix-tv-playback-effective-profile', {
            detail: { profile: effectiveProfile, requestedProfile: profile },
          }));
        } catch {}
      }

      const changed = await clickSourceAndConfirm(winner);
      await closeHiddenSettings();
      if (!changed) {
        return { status: 'selection-unconfirmed', profile: effectiveProfile };
      }
      scheduleTrackProfileApplication(effectiveProfile);
      api.lastEffectiveProfile = effectiveProfile;

      return {
        status: 'selected',
        profile: effectiveProfile,
        requestedProfile: profile,
        provider: winner.provider,
        quality: winner.quality,
        qualityVerified,
      };
    } finally {
      if (document.documentElement.classList.contains(AUTO_SETTINGS_CLASS)) {
        await closeHiddenSettings();
      }
      api.profileSelectionBusy = false;
    }
  };

  const selectBestProfileSource = (profile, options = {}) => {
    const requestId = (api.profileRequestId || 0) + 1;
    api.profileRequestId = requestId;
    // A manual toggle supersedes a running automatic scan. It waits for the
    // old hidden panel to close, then selects the requested profile itself.
    const previous = api.profileQueue || Promise.resolve();
    const queued = previous.catch(() => {}).then(() =>
      performBestProfileSource(profile, options, requestId)
    );
    api.profileQueue = queued;
    return queued;
  };

  const scheduleAutomaticProfileSelection = () => {
    if (api.autoProfileTimer || api.profileSelectionBusy) return;
    api.autoProfileTimer = setTimeout(() => {
      api.autoProfileTimer = null;
      const video = getActiveVideo();
      if (!(video instanceof HTMLVideoElement)) return;
      if (!(getSettingsTrigger() instanceof HTMLElement)) return;

      const contentKey = window.location.pathname + window.location.search;
      if (api.autoProfileContentKey === contentKey) return;
      api.autoProfileContentKey = contentKey;

      const profile = getPlaybackProfile();
      void selectBestProfileSource(profile, {
        allowVfFallback: profile === 'vo-fr',
      });
    }, 900);
  };


  const findActionButton = (root, labels, explicitSelector) => {
    if (explicitSelector) {
      const explicit =
        document.querySelector(explicitSelector) ||
        (root instanceof HTMLElement ? root.querySelector(explicitSelector) : null);
      if (explicit instanceof HTMLElement && visible(explicit)) return explicit;
    }
    const scope = root instanceof HTMLElement ? root : document;
    return Array.from(scope.querySelectorAll('button, [role="button"]')).find((button) => {
      if (!(button instanceof HTMLElement) || !visible(button)) return false;
      const signature = buttonSignature(button);
      return labels.some((label) => signature === label || signature.includes(label));
    }) || null;
  };

  const openExistingEpisodes = async (root) => {
    const button = findActionButton(root, ['episodes', 'episode'], null);
    if (!(button instanceof HTMLElement)) return false;
    api.advancedSettingsPending = true;
    try {
      button.click();
      const panel = await waitUntil(() => getEpisodesPanel(), 3500, 50);
      if (!(panel instanceof HTMLElement)) return false;
      api.episodesPanel = panel;
      closeQuickMenu(false);
      const first = getPanelFocusables(panel).find((item) =>
        item.closest('.overflow-y-auto')) || getPanelFocusables(panel)[0];
      focusPanelItem(first);
      return true;
    } finally {
      api.advancedSettingsPending = false;
    }
  };

  const openExistingSettings = async (root) => {
    const existing = getSettingsPanel();
    const button = getSettingsTrigger(root);
    if (!(existing instanceof HTMLElement) && !(button instanceof HTMLElement)) return false;

    api.advancedSettingsPending = true;
    // Manual access wins over a hidden automatic quality scan. The scanner's
    // superseded request must never click this real panel closed afterwards.
    api.profileRequestId = (api.profileRequestId || 0) + 1;
    api.manualSettingsOpen = true;
    document.documentElement.classList.remove(AUTO_SETTINGS_CLASS);
    try {
      if (!(existing instanceof HTMLElement)) button.click();
      const panel = await waitUntil(() => {
        const current = getSettingsPanel();
        return current instanceof HTMLElement && visible(current) ? current : null;
      }, 3500, 50);
      if (!(panel instanceof HTMLElement)) {
        api.manualSettingsOpen = false;
        return false;
      }
      closeQuickMenu(false);
      const qualityTab = panel.querySelector('[data-tv-settings-tab="quality"]');
      const target = qualityTab instanceof HTMLElement && visible(qualityTab)
        ? qualityTab : getPanelFocusables(panel)[0];
      focusPanelItem(target);
      return true;
    } finally {
      api.advancedSettingsPending = false;
    }
  };

  const waitForFullscreenExit = async (video, root) => {
    if (!(video instanceof HTMLVideoElement) || !isFullscreen(video)) return true;

    await exitFullscreen(video, root);
    if (!isFullscreen(video)) return true;

    await new Promise((resolve) => {
      const started = performance.now();
      const tick = () => {
        if (!isFullscreen(video) || performance.now() - started >= 700) {
          resolve(undefined);
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return !isFullscreen(video);
  };

  const openQuickMenu = async (video, root) => {
    if (!(video instanceof HTMLVideoElement) || getQuickMenu() || api.openingQuickMenu) return false;
    api.openingQuickMenu = true;

    if (!(await waitForFullscreenExit(video, root))) {
      api.openingQuickMenu = false;
      return false;
    }
    const activeVideo = getActiveVideo() || video;
    const activeRoot = getPlayerRoot(activeVideo) || root;

    ensureQuickMenuStyle();

    const overlay = document.createElement('div');
    overlay.id = MENU_ID;
    overlay.setAttribute('data-tv-playback-quick-menu', '');
    overlay.setAttribute('data-tv-shortcut-scope', '');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Menu lecture TV');

    const card = document.createElement('div');
    card.className = 'movix-tv-menu-card';

    const title = document.createElement('div');
    title.className = 'movix-tv-menu-title';
    title.textContent = 'Lecture';
    card.appendChild(title);

    const addAction = (label, sublabel, onPress) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'movix-tv-menu-action';
      button.setAttribute('data-tv-focus', '');
      button.innerHTML =
        '<span>' + label + '</span>' +
        '<span class="movix-tv-menu-sub">' + sublabel + '</span>';
      button.addEventListener('click', onPress);
      card.appendChild(button);
      button.addEventListener('focus', () => {
        const actions = Array.from(card.querySelectorAll('.movix-tv-menu-action'));
        api.quickMenuFocusIndex = Math.max(0, actions.indexOf(button));
      });
      return button;
    };

    let profileStatus = '';
    const profileButton = addAction('', '', () => {
      const next = getPlaybackProfile() === 'vo-fr' ? 'vf' : 'vo-fr';
      try { localStorage.setItem(PROFILE_KEY, next); } catch {}
      profileStatus = 'Recherche de la meilleure source…';
      updateProfileLabel();

      void selectBestProfileSource(next, { allowVfFallback: false }).then((result) => {
        if (result?.status === 'selected') {
          const quality = Number(result.quality) > 0 ? ' · ' + result.quality + 'p' : '';
          profileStatus =
            (result.provider === 'nexus' ? 'Nexus' : result.provider === 'bravo' ? 'Bravo' : '') +
            quality + (result.qualityVerified === false ? ' · qualité non vérifiée' : '');
        } else if (result?.status === 'delegated') {
          profileStatus = 'Sélection automatique…';
        } else if (result?.status === 'no-match') {
          profileStatus = 'Aucune source compatible';
        } else if (result?.status === 'selection-unconfirmed') {
          profileStatus = 'Changement de source non confirmé';
        } else {
          profileStatus = '';
        }
        updateProfileLabel();
        requestAnimationFrame(() => {
          if (!getQuickMenu()?.contains(profileButton)) return;
          try { profileButton.focus({ preventScroll: true }); } catch { profileButton.focus(); }
        });
      });
    });

    const updateProfileLabel = () => {
      const profile = getPlaybackProfile();
      const status = profileStatus ||
        (profile === 'vf' ? 'audio français' : 'VO + sous-titres FR');
      profileButton.innerHTML = profile === 'vf'
        ? '<span>Mode : VF</span><span class="movix-tv-menu-sub">' + status + '</span>'
        : '<span>Mode : VOSTFR</span><span class="movix-tv-menu-sub">' + status + '</span>';
    };
    updateProfileLabel();

    const episodeButton = findActionButton(activeRoot, ['episodes', 'episode'], null);
    if (episodeButton instanceof HTMLElement) {
      addAction('Épisodes', 'ouvrir', () => openExistingEpisodes(activeRoot));
    }

    addAction('Sources avancées', 'ouvrir les réglages', () => openExistingSettings(activeRoot));
    addAction('Fermer', '0 ou Back', closeQuickMenu);

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    api.quickMenuFocusIndex = 0;
    api.openingQuickMenu = false;

    requestAnimationFrame(() => {
      try { profileButton.focus({ preventScroll: true }); } catch { profileButton.focus(); }
    });
    return true;
  };

  const toggleQuickMenu = async (video, root) => {
    if (getQuickMenu()) {
      closeQuickMenu();
      return false;
    }
    return openQuickMenu(video, root);
  };

  const consume = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
  };

  const panelOwnsArrows = (active) => active instanceof HTMLElement && Boolean(
    active.closest('input, textarea, select, [role="slider"], [data-tv-consume-arrows]')
  );

  const getEpisodeDropdown = (panel) => Array.from(panel.querySelectorAll('.top-full'))
    .find((node) => node instanceof HTMLElement && visible(node) &&
      node.querySelector('button')) || null;

  const handlePlayerPanelKeydown = (event, open) => {
    const { kind, panel } = open;
    const key = String(event.key || '');
    const code = String(event.code || '');
    const legacy = Number(event.keyCode || event.which || 0);
    let active = panel.contains(document.activeElement) ? document.activeElement : null;

    if (key === 'Escape' || key === 'Backspace' || key === 'BrowserBack' ||
        key === '0' || code === 'Digit0' || code === 'Numpad0') {
      consume(event);
      if (kind === 'episodes') {
        const dropdown = getEpisodeDropdown(panel);
        const seasonButton = dropdown?.parentElement?.querySelector('button');
        if (seasonButton instanceof HTMLElement) {
          seasonButton.click();
          focusPanelItem(seasonButton);
          return true;
        }
      }
      closePlayerPanel(open);
      return true;
    }

    const arrow = code.startsWith('Arrow') ? code : (key.startsWith('Arrow') ? key :
      ({ 19: 'ArrowUp', 20: 'ArrowDown', 21: 'ArrowLeft', 22: 'ArrowRight',
         37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown' })[legacy] || '');
    if (arrow) {
      const items = getPanelFocusables(panel);
      if (!active && Number.isInteger(api.panelFocusIndex)) {
        active = items[Math.min(items.length - 1, Math.max(0, api.panelFocusIndex))] || null;
      }
      if (panelOwnsArrows(active)) return true;
      const tabs = kind === 'settings'
        ? items.filter((item) => item.hasAttribute('data-tv-settings-tab')) : [];
      const close = getPanelCloseButton(panel);
      const body = items.filter((item) => item !== close && !tabs.includes(item));
      const currentTab = tabs.find((item) => item.getAttribute('aria-pressed') === 'true') || tabs[0];
      let next = null;

      if (kind === 'settings' && (arrow === 'ArrowLeft' || arrow === 'ArrowRight') &&
          tabs.includes(active)) {
        const delta = arrow === 'ArrowRight' ? 1 : -1;
        next = tabs[Math.min(tabs.length - 1, Math.max(0, tabs.indexOf(active) + delta))];
      } else if (arrow === 'ArrowUp' || arrow === 'ArrowDown') {
        const delta = arrow === 'ArrowDown' ? 1 : -1;
        if (kind === 'settings' && tabs.includes(active)) {
          next = delta > 0 ? body[0] : close;
        } else if (kind === 'settings' && active === close) {
          next = delta > 0 ? currentTab : close;
        } else if (kind === 'settings' && body.includes(active)) {
          const index = body.indexOf(active) + delta;
          next = index < 0 ? currentTab : body[Math.min(body.length - 1, index)];
        } else {
          const index = items.indexOf(active);
          next = items[Math.min(items.length - 1, Math.max(0, index < 0 ? 0 : index + delta))];
        }
      }
      consume(event);
      if (next instanceof HTMLElement) focusPanelItem(next);
      return true;
    }

    if (key === 'Enter' || code === 'Enter' || code === 'NumpadEnter' ||
        legacy === 23 || legacy === 66) {
      if (active instanceof HTMLElement && !panelOwnsArrows(active)) {
        consume(event);
        active.click();
      } else if (!active) {
        consume(event);
        focusPanelItem(getPanelFocusables(panel)[0]);
      }
      return true;
    }
    return false;
  };

  const getQuickMenuActions = () => {
    const menu = getQuickMenu();
    if (!(menu instanceof HTMLElement)) return [];
    return Array.from(menu.querySelectorAll('.movix-tv-menu-action'));
  };

  // The remote HLS component can call focus() from a React effect after the
  // injected menu mounts. Keep focus in the menu using the browser's *actual*
  // focusin event, not a second visual-selection state or a polling timer.
  const handleFocusIn = (event) => {
    const menu = getQuickMenu();
    if (api.restoringQuickFocus) return;
    if (menu instanceof HTMLElement) {
      if (menu.contains(event.target)) return;
      const actions = getQuickMenuActions();
      const index = Math.min(actions.length - 1, Math.max(0, Number(api.quickMenuFocusIndex || 0)));
      if (actions[index] instanceof HTMLElement) {
        api.restoringQuickFocus = true;
        focusPanelItem(actions[index]);
        api.restoringQuickFocus = false;
      }
      return;
    }

    const open = getOpenPlayerPanel();
    if (!open) return;
    if (open.panel.contains(event.target)) {
      if (event.target instanceof HTMLElement) {
        api.panelFocusItem = event.target;
        api.panelFocusIndex = getPanelFocusables(open.panel).indexOf(event.target);
      }
      return;
    }
    // A nested dialog can own focus outside the settings panel. Only reclaim
    // focus stolen by the playback/page controls behind our active panel.
    if (event.target instanceof HTMLElement &&
        event.target.closest('[role="dialog"], [aria-modal="true"]')) return;
    const items = getPanelFocusables(open.panel);
    const remembered = api.panelFocusItem;
    const target = items.includes(remembered) ? remembered :
      (open.kind === 'settings'
        ? items.find((item) => item.getAttribute('aria-pressed') === 'true') || items[0]
        : items.find((item) => item.closest('.overflow-y-auto')) || items[0]);
    if (target instanceof HTMLElement) {
      api.restoringQuickFocus = true;
      focusPanelItem(target);
      api.restoringQuickFocus = false;
    }
  };

  const handleQuickMenuKeydown = (event) => {
    const menu = getQuickMenu();
    if (!(menu instanceof HTMLElement)) return false;

    const key = String(event.key || '');
    const code = String(event.code || '');

    if (key === '0' || code === 'Digit0' || code === 'Numpad0' ||
        key === 'Escape' || key === 'Backspace' || key === 'BrowserBack') {
      consume(event);
      closeQuickMenu(true);
      return true;
    }

    const legacy = Number(event.keyCode || event.which || 0);
    const arrow = code.startsWith('Arrow') ? code : (key.startsWith('Arrow') ? key :
      ({ 19: 'ArrowUp', 20: 'ArrowDown', 21: 'ArrowLeft', 22: 'ArrowRight',
         37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown' })[legacy] || '');
    if (arrow === 'ArrowUp' || arrow === 'ArrowDown') {
      const actions = getQuickMenuActions();
      if (actions.length === 0) {
        consume(event);
        return true;
      }

      const active = document.activeElement;
      const activeIndex = active instanceof HTMLElement ? actions.indexOf(active) : -1;
      const rememberedIndex = Number.isInteger(api.quickMenuFocusIndex)
        ? Number(api.quickMenuFocusIndex)
        : 0;
      const currentIndex = activeIndex >= 0
        ? activeIndex
        : Math.min(actions.length - 1, Math.max(0, rememberedIndex));
      const delta = arrow === 'ArrowDown' ? 1 : -1;
      const nextIndex = Math.min(actions.length - 1, Math.max(0, currentIndex + delta));
      const target = actions[nextIndex];

      api.quickMenuFocusIndex = nextIndex;
      if (target instanceof HTMLElement) {
        try { target.focus({ preventScroll: true }); } catch { target.focus(); }
      }
      consume(event);
      return true;
    }

    if ((key === 'Enter' || code === 'Enter' || code === 'NumpadEnter' ||
         legacy === 23 || legacy === 66)) {
      const actions = getQuickMenuActions();
      const active = document.activeElement;
      const activeIndex = active instanceof HTMLElement ? actions.indexOf(active) : -1;
      const index = activeIndex >= 0
        ? activeIndex
        : Math.min(actions.length - 1, Math.max(0, Number(api.quickMenuFocusIndex || 0)));
      const target = actions[index];
      if (target instanceof HTMLElement) {
        consume(event);
        target.click();
        return true;
      }
    }

    // Any other key while the modal exists belongs to the modal, never to
    // playback transport, the page, or a carousel behind it.
    consume(event);
    return true;
  };

  const isZeroKey = (event) => {
    const key = String(event.key || '');
    const code = String(event.code || '');
    return key === '0' || code === 'Digit0' || code === 'Numpad0';
  };

  const isNumericOneToNine = (event) => {
    const key = String(event.key || '');
    const code = String(event.code || '');
    return /^[1-9]$/.test(key) || /^Digit[1-9]$/.test(code) || /^Numpad[1-9]$/.test(code);
  };

  const handleKeydown = (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return false;

    if (getQuickMenu() && handleQuickMenuKeydown(event)) return true;

    const open = getOpenPlayerPanel();
    if (open && handlePlayerPanelKeydown(event, open)) return true;

    const video = getActiveVideo();
    if (!(video instanceof HTMLVideoElement)) return false;
    const root = getPlayerRoot(video);

    if (isZeroKey(event)) {
      consume(event);
      void toggleQuickMenu(video, root);
      return true;
    }

    if (isNumericOneToNine(event)) {
      consume(event);
      return true;
    }

    const key = String(event.key || '');
    const code = String(event.code || '');
    const arrow = code.startsWith('Arrow') ? code : (key.startsWith('Arrow') ? key : '');
    if (!arrow) return false;

    if (getQuickMenu()) return false;
    if (hasPriorityOverlay(root) || playerControlOwnsArrows(root)) return false;

    if (arrow === 'ArrowLeft') {
      if (seek(video, -10)) consume(event);
      return true;
    }
    if (arrow === 'ArrowRight') {
      if (seek(video, 10)) consume(event);
      return true;
    }
    if (arrow === 'ArrowUp') {
      consume(event);
      void enterFullscreen(video, root);
      return true;
    }
    if (arrow === 'ArrowDown') {
      consume(event);
      void exitFullscreen(video, root);
      return true;
    }
    return false;
  };

  const handleTvBack = (event) => {
    const consumeTvBack = () => {
      if (event?.cancelable) event.preventDefault();
      if (typeof event?.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    };
    if (getQuickMenu()) {
      closeQuickMenu();
      consumeTvBack();
      return;
    }

    const open = getOpenPlayerPanel();
    if (open && closePlayerPanel(open)) {
      consumeTvBack();
      return;
    }

    const video = getActiveVideo();
    if (!(video instanceof HTMLVideoElement) || !isFullscreen(video)) return;
    const root = getPlayerRoot(video);
    void exitFullscreen(video, root);
    consumeTvBack();
  };

  api.getActiveVideo = getActiveVideo;
  api.getPlayerRoot = getPlayerRoot;
  api.focusPlayPause = focusPlayPause;
  api.openQuickMenu = () => {
    const video = getActiveVideo();
    const root = getPlayerRoot(video);
    return openQuickMenu(video, root);
  };
  api.closeQuickMenu = closeQuickMenu;
  api.selectBestProfileSource = selectBestProfileSource;
  api.scheduleAutomaticProfileSelection = scheduleAutomaticProfileSelection;
  api.keydownHandler = handleKeydown;
  api.focusinHandler = handleFocusIn;
  api.backHandler = handleTvBack;

  window.addEventListener('keydown', handleKeydown, true);
  document.addEventListener('focusin', handleFocusIn, true);
  window.addEventListener('movix-tv-back', handleTvBack);

  const setupFocus = () => {
    if (!document.body || typeof MutationObserver !== 'function') {
      schedulePlayPauseFocus();
      return;
    }
    api.focusObserver = new MutationObserver(() => {
      if (api.manualSettingsOpen && !getSettingsPanel()) api.manualSettingsOpen = false;
      schedulePlayPauseFocus(120);
      scheduleAutomaticProfileSelection();
    });
    api.focusObserver.observe(document.body, { childList: true, subtree: true });
    schedulePlayPauseFocus();
    scheduleAutomaticProfileSelection();
  };

  if (document.readyState === 'loading') {
    ensurePlayerPanelStyle();
    document.addEventListener('DOMContentLoaded', setupFocus, { once: true });
  } else {
    ensurePlayerPanelStyle();
    setupFocus();
  }
})();
`;
}
