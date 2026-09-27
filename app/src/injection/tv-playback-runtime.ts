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

  const onWatchRoute = () => window.location.pathname.startsWith('/watch/');

  const getOpenPlayerPanel = () => {
    const open = api.openPlayerPanel;
    if (!open) return null;
    if (!onWatchRoute() || open.route !== window.location.pathname + window.location.search ||
        !(open.element instanceof HTMLElement) || !open.element.isConnected ||
        !visible(open.element)) {
      api.openPlayerPanel = null;
      return null;
    }
    return open;
  };

  const focusPlayPause = () => {
    if (!onWatchRoute() || getQuickMenu() || api.panelPending || getOpenPlayerPanel()) return false;
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
      if (!onWatchRoute() || getQuickMenu() || api.panelPending || getOpenPlayerPanel()) return;
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
    if (getQuickMenu()) return true;
    const candidates = Array.from(document.querySelectorAll(
      '[role="dialog"], [role="menu"], [data-source-menu], [data-tv-playback-quick-menu], [data-tv-dpad-scope="native"]'
    ));
    return candidates.some((element) => {
      if (!(element instanceof HTMLElement) || !visible(element)) return false;
      return !(root instanceof HTMLElement) || root.contains(element) || element.getAttribute('aria-modal') === 'true';
    });
  };

  const MENU_ID = 'movix-tv-injected-playback-menu';
  const MENU_STYLE_ID = 'movix-tv-injected-playback-menu-style';

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

  const getQuickMenu = () => {
    const menu = document.getElementById(MENU_ID);
    if (menu && (!onWatchRoute() ||
        api.quickMenuRoute !== window.location.pathname + window.location.search)) {
      menu.remove();
      return null;
    }
    return menu;
  };

  const closeQuickMenu = (restoreFocus = true) => {
    const menu = getQuickMenu();
    if (menu) menu.remove();
    api.quickMenuIndex = 0;
    if (restoreFocus) setTimeout(focusPlayPause, 0);
  };

  const findActionButton = (root, labels, explicitSelector) => {
    if (!onWatchRoute()) return null;
    const scopes = [];
    for (let node = root, depth = 0; node instanceof HTMLElement && depth < 10;
         node = node.parentElement, depth += 1) scopes.push(node);
    scopes.push(document);
    for (const scope of scopes) {
      if (explicitSelector) {
        const exact = scope.querySelector(explicitSelector);
        if (exact instanceof HTMLElement && !exact.disabled && exact.isConnected) return exact;
      }
      const match = Array.from(scope.querySelectorAll('button, [role="button"]')).find((button) => {
        if (!(button instanceof HTMLElement) || !button.isConnected || button.disabled ||
            (scope === document && !visible(button)) ||
            button.closest('[data-tv-playback-quick-menu]')) return false;
        const signature = buttonSignature(button);
        return labels.some((label) => signature === label || signature.includes(label)) ||
          (explicitSelector && Boolean(button.querySelector(
            'svg.lucide-settings, svg.lucide-settings-2, .lucide-settings'
          )));
      });
      if (match) return match;
    }
    return null;
  };

  const waitForPanel = async (findPanel) => {
    const started = performance.now();
    while (performance.now() - started < 3500) {
      const panel = findPanel();
      if (panel instanceof HTMLElement && visible(panel)) return panel;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return null;
  };

  const getSettingsPanel = () => {
    const panel = document.querySelector('.settings-menu[data-player-menu="settings"], .settings-menu');
    return panel instanceof HTMLElement && visible(panel) ? panel : null;
  };

  const getEpisodesPanel = () => {
    const exact = document.querySelector('[data-tv-episodes-menu]');
    if (exact instanceof HTMLElement && visible(exact)) return exact;
    return Array.from(document.querySelectorAll('div')).find((node) => {
      if (!(node instanceof HTMLElement) || !visible(node)) return false;
      const classes = String(node.className || '');
      return (classes.includes('z-[11000]') || classes.includes('z-[12000]')) &&
        Boolean(node.querySelector('h3') && node.querySelector('.overflow-y-auto'));
    }) || null;
  };

  const getPanelFocusables = (panel) => Array.from(panel.querySelectorAll(
    'button, a[href], input, select, textarea, [role="button"], [role="slider"], [tabindex]'
  )).filter((item) => item instanceof HTMLElement && !item.disabled &&
    item.getAttribute('tabindex') !== '-1' && visible(item) &&
    !item.closest('[aria-hidden="true"], [inert]'));

  const focusPanelItem = (item) => {
    if (!(item instanceof HTMLElement)) return false;
    try { item.focus({ preventScroll: true }); } catch { item.focus(); }
    try { item.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch {}
    return document.activeElement === item;
  };

  const getPanelCloseButton = (panel) => {
    const heading = panel.querySelector('h3');
    const headerButton = heading?.parentElement?.querySelector('button');
    if (headerButton instanceof HTMLElement) return headerButton;
    return Array.from(panel.querySelectorAll('button')).find((button) =>
      button.querySelector('svg.lucide-x, .lucide-x') ||
      ['fermer', 'close'].includes(buttonSignature(button))) || null;
  };

  const ensurePanelFocusStyle = () => {
    if (document.getElementById('movix-tv-player-panel-focus')) return;
    const style = document.createElement('style');
    style.id = 'movix-tv-player-panel-focus';
    style.textContent = '[data-tv-injected-panel] :is(button,a,[tabindex]):focus{' +
      'outline:3px solid #ef4444!important;outline-offset:2px!important;}';
    (document.head || document.documentElement).appendChild(style);
  };

  const ownPanel = (kind, panel) => {
    ensurePanelFocusStyle();
    panel.setAttribute('data-tv-injected-panel', kind);
    api.openPlayerPanel = {
      kind, element: panel, route: window.location.pathname + window.location.search,
    };
  };

  const closePlayerPanel = (open) => {
    const button = getPanelCloseButton(open.element);
    if (!(button instanceof HTMLElement)) return false;
    api.openPlayerPanel = null;
    button.click();
    schedulePlayPauseFocus(300);
    return true;
  };

  const openExistingEpisodes = async (root) => {
    const button = findActionButton(root, ['episodes', 'episode'], null);
    if (!(button instanceof HTMLElement)) return false;
    api.panelPending = true;
    closeQuickMenu(false);
    try {
      button.click();
      const panel = await waitForPanel(getEpisodesPanel);
      if (!(panel instanceof HTMLElement)) return false;
      ownPanel('episodes', panel);
      const items = getPanelFocusables(panel);
      focusPanelItem(items.find((item) => item.closest('.overflow-y-auto')) ||
        items.find((item) => item !== getPanelCloseButton(panel)) || items[0]);
      return true;
    } finally {
      api.panelPending = false;
    }
  };

  const openExistingSettings = async (root) => {
    const existing = getSettingsPanel();
    const button = findActionButton(
      root, ['parametres', 'settings'], '[data-tv-player-menu-trigger="settings"]'
    );
    if (!existing && !(button instanceof HTMLElement)) return false;
    api.panelPending = true;
    closeQuickMenu(false);
    try {
      if (!existing) button.click();
      const panel = await waitForPanel(getSettingsPanel);
      if (!(panel instanceof HTMLElement)) return false;
      ownPanel('settings', panel);
      const quality = panel.querySelector('[data-tv-settings-tab="quality"]');
      if (quality instanceof HTMLElement && visible(quality)) quality.click();
      focusPanelItem(quality instanceof HTMLElement && visible(quality)
        ? quality : getPanelFocusables(panel)[0]);
      return true;
    } finally {
      api.panelPending = false;
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
    if (!(video instanceof HTMLVideoElement) || getQuickMenu()) return false;

    await waitForFullscreenExit(video, root);
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
      return button;
    };

    const episodeButton = findActionButton(activeRoot, ['episodes', 'episode'], null);
    if (episodeButton instanceof HTMLElement) {
      addAction('Épisodes', 'ouvrir', () => openExistingEpisodes(activeRoot));
    }

    addAction('Qualité et langues', 'Sources VOSTFR/VF, audio, sous-titres',
      () => openExistingSettings(activeRoot));

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    api.quickMenuRoute = window.location.pathname + window.location.search;
    api.quickMenuIndex = 0;

    requestAnimationFrame(() => {
      focusPanelItem(card.querySelector('.movix-tv-menu-action'));
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

  const keyArrow = (event) => {
    const code = String(event.code || '');
    const key = String(event.key || '');
    const legacy = Number(event.keyCode || event.which || 0);
    return code.startsWith('Arrow') ? code : key.startsWith('Arrow') ? key :
      ({ 19: 'ArrowUp', 20: 'ArrowDown', 21: 'ArrowLeft', 22: 'ArrowRight',
         37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown' })[legacy] || '';
  };

  const isEnterKey = (event) => event.key === 'Enter' || event.code === 'Enter' ||
    event.code === 'NumpadEnter' || event.keyCode === 23 || event.keyCode === 66;

  const getQuickMenuActions = () => {
    const menu = getQuickMenu();
    return menu instanceof HTMLElement
      ? Array.from(menu.querySelectorAll('.movix-tv-menu-action')) : [];
  };

  const handleQuickMenuKeydown = (event) => {
    const actions = getQuickMenuActions();
    if (isZeroKey(event) || ['Escape', 'Backspace', 'BrowserBack'].includes(event.key)) {
      consume(event);
      closeQuickMenu();
      return true;
    }
    const arrow = keyArrow(event);
    if ((arrow === 'ArrowUp' || arrow === 'ArrowDown') && actions.length) {
      const focused = actions.indexOf(document.activeElement);
      const current = focused >= 0 ? focused : Number(api.quickMenuIndex || 0);
      const delta = arrow === 'ArrowDown' ? 1 : -1;
      api.quickMenuIndex = Math.max(0, Math.min(actions.length - 1, current + delta));
      focusPanelItem(actions[api.quickMenuIndex]);
    } else if (isEnterKey(event) && actions.length) {
      const focused = actions.indexOf(document.activeElement);
      actions[focused >= 0 ? focused : Number(api.quickMenuIndex || 0)].click();
    }
    consume(event);
    return true;
  };

  const getPanelHorizontalNeighbor = (items, active, direction) => {
    if (!(active instanceof HTMLElement)) return null;
    const rect = active.getBoundingClientRect();
    const x = (rect.left + rect.right) / 2;
    const y = (rect.top + rect.bottom) / 2;
    return items.map((item) => {
      if (item === active) return null;
      const candidate = item.getBoundingClientRect();
      const dx = (candidate.left + candidate.right) / 2 - x;
      const dy = Math.abs((candidate.top + candidate.bottom) / 2 - y);
      if (dx * direction < 4 || dy > Math.max(rect.height, candidate.height) * 0.65) return null;
      return { item, score: Math.abs(dx) + dy * 2 };
    }).filter(Boolean).sort((a, b) => a.score - b.score)[0]?.item || null;
  };

  const handlePlayerPanelKeydown = (event, open) => {
    const panel = open.element;
    if (isZeroKey(event) || ['Escape', 'Backspace', 'BrowserBack'].includes(event.key)) {
      consume(event);
      if (open.kind === 'episodes') {
        const dropdown = Array.from(panel.querySelectorAll('.top-full')).find((node) =>
          node instanceof HTMLElement && visible(node) && node.querySelector('button'));
        const season = dropdown?.parentElement?.querySelector('button');
        if (season instanceof HTMLElement) {
          season.click();
          focusPanelItem(season);
          return true;
        }
      }
      closePlayerPanel(open);
      return true;
    }

    const items = getPanelFocusables(panel);
    const current = items.includes(document.activeElement)
      ? document.activeElement : items[Number(api.panelFocusIndex || 0)] || null;
    const arrow = keyArrow(event);
    if (arrow) {
      if (current instanceof HTMLElement && current.closest(
        'input, textarea, select, [role="slider"], [data-tv-consume-arrows]'
      )) return false;
      let next = null;
      if (open.kind === 'episodes') {
        const dropdown = Array.from(panel.querySelectorAll('.top-full')).find((node) =>
          node instanceof HTMLElement && visible(node) && node.querySelector('button'));
        const choices = dropdown instanceof HTMLElement ? getPanelFocusables(dropdown) : items;
        if (arrow === 'ArrowUp' || arrow === 'ArrowDown') {
          const delta = arrow === 'ArrowDown' ? 1 : -1;
          const index = choices.indexOf(current);
          next = choices[Math.max(0, Math.min(choices.length - 1,
            index < 0 ? 0 : index + delta))];
        }
      } else {
        const tabs = items.filter((item) => item.hasAttribute('data-tv-settings-tab'));
        const close = getPanelCloseButton(panel);
        const body = items.filter((item) => item !== close && !tabs.includes(item));
        const activeTab = tabs.find((item) => item.getAttribute('aria-pressed') === 'true') || tabs[0];
        if ((arrow === 'ArrowLeft' || arrow === 'ArrowRight') && tabs.includes(current)) {
          const delta = arrow === 'ArrowRight' ? 1 : -1;
          next = tabs[Math.max(0, Math.min(tabs.length - 1, tabs.indexOf(current) + delta))];
        } else if (arrow === 'ArrowLeft' || arrow === 'ArrowRight') {
          next = getPanelHorizontalNeighbor(body, current, arrow === 'ArrowRight' ? 1 : -1);
        } else {
          const delta = arrow === 'ArrowDown' ? 1 : -1;
          if (current === close) next = delta > 0 ? activeTab : close;
          else if (tabs.includes(current)) next = delta > 0 ? body[0] : close;
          else {
            const index = body.indexOf(current) + delta;
            next = index < 0 ? activeTab : body[Math.min(body.length - 1, index)];
          }
        }
      }
      consume(event);
      if (next instanceof HTMLElement) {
        focusPanelItem(next);
        api.panelFocusIndex = getPanelFocusables(panel).indexOf(next);
      }
      return true;
    }

    if (isEnterKey(event)) {
      consume(event);
      if (current instanceof HTMLElement) current.click();
      else focusPanelItem(items[0]);
      return true;
    }

    // A panel opened by this menu owns numeric keys, including 1/2/3.
    if (/^[1-9]$/.test(String(event.key || ''))) {
      consume(event);
      return true;
    }
    return false;
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

    if (getQuickMenu()) return handleQuickMenuKeydown(event);
    if (api.panelPending) {
      consume(event);
      return true;
    }
    const open = getOpenPlayerPanel();
    if (open) return handlePlayerPanelKeydown(event, open);

    if (!onWatchRoute()) return false;

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

    const open = getOpenPlayerPanel();
    if (open && closePlayerPanel(open)) {
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
