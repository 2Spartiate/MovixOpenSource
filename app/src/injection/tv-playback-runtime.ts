export function buildTvPlaybackRuntime(): string {
  return `
(() => {
  if (window.MOVIX_TV !== true) return;

  const api = window.__MOVIX_TV_PLAYBACK || (window.__MOVIX_TV_PLAYBACK = {});

  if (typeof api.keydownHandler === 'function') {
    document.removeEventListener('keydown', api.keydownHandler, true);
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

  const closeQuickMenu = () => {
    const menu = getQuickMenu();
    if (menu) menu.remove();
    setTimeout(focusPlayPause, 0);
  };

  const findActionButton = (root, labels, explicitSelector) => {
    if (explicitSelector && root instanceof HTMLElement) {
      const explicit = root.querySelector(explicitSelector);
      if (explicit instanceof HTMLElement && visible(explicit)) return explicit;
    }
    const scope = root instanceof HTMLElement ? root : document;
    return Array.from(scope.querySelectorAll('button, [role="button"]')).find((button) => {
      if (!(button instanceof HTMLElement) || !visible(button)) return false;
      const signature = buttonSignature(button);
      return labels.some((label) => signature === label || signature.includes(label));
    }) || null;
  };

  const openExistingEpisodes = (root) => {
    const button = findActionButton(root, ['episodes', 'episode'], null);
    closeQuickMenu();
    if (button instanceof HTMLElement) {
      button.click();
      return true;
    }
    try { window.dispatchEvent(new Event('movix-tv-open-episodes')); } catch {}
    return false;
  };

  const openExistingSettings = (root) => {
    const button = findActionButton(
      root,
      ['parametres', 'settings', 'sources'],
      '[data-tv-player-menu-trigger="settings"]'
    );
    closeQuickMenu();
    if (button instanceof HTMLElement) {
      button.click();
      return true;
    }
    try { window.dispatchEvent(new Event('movix-tv-open-sources')); } catch {}
    return false;
  };

  const openQuickMenu = (video, root) => {
    if (!(video instanceof HTMLVideoElement) || getQuickMenu()) return false;
    ensureQuickMenuStyle();

    const overlay = document.createElement('div');
    overlay.id = MENU_ID;
    overlay.setAttribute('data-tv-playback-quick-menu', '');
    overlay.setAttribute('data-tv-shortcut-scope', '');
    overlay.setAttribute('role', 'dialog');
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
      return button;
    };

    const profileButton = addAction('', '', () => {
      const next = getPlaybackProfile() === 'vo-fr' ? 'vf' : 'vo-fr';
      setPlaybackProfile(next);
      updateProfileLabel();
    });

    const updateProfileLabel = () => {
      const profile = getPlaybackProfile();
      profileButton.innerHTML = profile === 'vf'
        ? '<span>Mode : VF</span><span class="movix-tv-menu-sub">audio français</span>'
        : '<span>Mode : VOSTFR</span><span class="movix-tv-menu-sub">VO + sous-titres FR</span>';
    };
    updateProfileLabel();

    const episodeButton = findActionButton(root, ['episodes', 'episode'], null);
    if (episodeButton instanceof HTMLElement) {
      addAction('Épisodes', 'ouvrir', () => openExistingEpisodes(root));
    }

    addAction('Sources avancées', 'ouvrir les réglages', () => openExistingSettings(root));
    addAction('Fermer', '0 ou Back', closeQuickMenu);

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      try { profileButton.focus({ preventScroll: true }); } catch { profileButton.focus(); }
    });
    return true;
  };

  const toggleQuickMenu = (video, root) => {
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

    const video = getActiveVideo();
    if (!(video instanceof HTMLVideoElement)) return false;
    const root = getPlayerRoot(video);

    if (isZeroKey(event)) {
      toggleQuickMenu(video, root);
      consume(event);
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
    if (getQuickMenu()) {
      closeQuickMenu();
      if (event?.cancelable) event.preventDefault();
      return;
    }

    const video = getActiveVideo();
    if (!(video instanceof HTMLVideoElement) || !isFullscreen(video)) return;
    const root = getPlayerRoot(video);
    void exitFullscreen(video, root);
    if (event?.cancelable) event.preventDefault();
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
  api.keydownHandler = handleKeydown;
  api.backHandler = handleTvBack;

  document.addEventListener('keydown', handleKeydown, true);
  window.addEventListener('movix-tv-back', handleTvBack);

  const setupFocus = () => {
    if (!document.body || typeof MutationObserver !== 'function') {
      schedulePlayPauseFocus();
      return;
    }
    api.focusObserver = new MutationObserver(() => schedulePlayPauseFocus(120));
    api.focusObserver.observe(document.body, { childList: true, subtree: true });
    schedulePlayPauseFocus();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupFocus, { once: true });
  } else {
    setupFocus();
  }
})();
`;
}
