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

  const consume = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
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
    const video = getActiveVideo();
    if (!(video instanceof HTMLVideoElement) || !isFullscreen(video)) return;
    const root = getPlayerRoot(video);
    void exitFullscreen(video, root);
    if (event?.cancelable) event.preventDefault();
  };

  api.getActiveVideo = getActiveVideo;
  api.getPlayerRoot = getPlayerRoot;
  api.focusPlayPause = focusPlayPause;
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
