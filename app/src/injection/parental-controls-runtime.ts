/// <reference lib="dom" />
/**
 * Device-local parental controls for the remote site actually loaded by the
 * native WebView. This runtime is installed on handheld and TV before the site
 * JavaScript. It deliberately does not send a PIN or verifier to the native
 * bridge, account sync, or a remote service.
 */

type MediaKind = 'movie' | 'tv';
type MediaRoute = { type: MediaKind; id: string; watch: boolean };
type MediaFacts = {
  age: number | null;
  genres: Array<{ id: number; name: string }> | null;
  keywords: Array<{ id: number; name: string }> | null;
  title?: string;
};
type Preferences = { enabled: boolean; maximumAge: number; lockHorror: boolean; animeHome: boolean };

export function parentalMediaRoute(pathname: string): MediaRoute | null {
  const anime = pathname.match(/^\/watch\/anime\/([^/?#]+)\/season\//);
  if (anime) return { type: 'tv', id: decodeURIComponent(anime[1]), watch: true };
  const match = pathname.match(/^\/(watch\/)?(movie|tv)\/([^/?#]+)(?:\/|$)/);
  if (!match) return null;
  return { type: match[2] as MediaKind, id: decodeURIComponent(match[3]), watch: !!match[1] };
}

export function parentalCertificationAge(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const cert = value.trim().toUpperCase();
  if (['TP', 'TP+', 'G', 'PG', 'TV-Y', 'TV-G', 'TV-PG', 'U', '0', 'T', 'ALL', 'L', 'AA', 'A', 'ATP'].includes(cert)) return 0;
  const ages: Record<string, number> = {
    '6': 6, '6+': 6, '7': 7, 'TV-Y7': 7, '10': 10,
    '12': 12, '12A': 12, 'PG12': 12, 'IIB': 12,
    'PG-13': 13, 'R13': 13, 'R-13': 13, '+13': 13,
    '14': 14, '14A': 14, '14+': 14, 'TV-14': 14,
    '15': 15, 'MA 15+': 15, 'M': 15, 'R15+': 15, 'K15': 15, 'B': 15, 'B-15': 15,
    '16': 16, '+16': 16, 'NC16': 16, 'K-16': 16, 'N-16': 16, '16+': 16,
    'R': 17, 'TV-MA': 17, 'NC-17': 17,
    '18': 18, '18+': 18, '18A': 18, 'R18+': 18, 'M18': 18, 'III': 18,
    'R-18': 18, '18SG': 18, 'N-18': 18, 'C': 18, 'D': 18, '19': 19, '21+': 21,
  };
  return ages[cert] ?? null;
}

export function parentalPreferredAge(type: MediaKind, ratingData: any, adult = false): number | null {
  if (adult) return 18;
  const regions: any[] = Array.isArray(ratingData?.results) ? ratingData.results : [];
  const ordered = [
    ...regions.filter(region => region.iso_3166_1 === 'FR'),
    ...regions.filter(region => region.iso_3166_1 === 'US'),
    ...regions.filter(region => !['FR', 'US'].includes(region.iso_3166_1)),
  ];
  for (const region of ordered) {
    const values = type === 'movie'
      ? [...(region.release_dates || [])]
          .sort((a, b) => Number(b.type === 2 || b.type === 3) - Number(a.type === 2 || a.type === 3))
          .map(entry => entry.certification)
      : [region.rating];
    for (const value of values) {
      const age = parentalCertificationAge(value);
      if (age !== null) return age;
    }
  }
  return null;
}

export function parentalLockReason(prefs: Preferences, type: MediaKind, facts: MediaFacts): 'age' | 'horror' | 'unknown' | null {
  if (!prefs.enabled) return null;
  if (facts.age === null) return 'unknown';
  if (facts.age > prefs.maximumAge) return 'age';
  if (prefs.lockHorror && (facts.genres === null || facts.keywords === null)) return 'unknown';
  if (!prefs.lockHorror) return null;
  if (type === 'movie' && facts.genres?.some(genre => genre.id === 27)) return 'horror';
  if (facts.genres?.some(genre => /^(horror|horreur)$/i.test(genre.name.trim()))) return 'horror';
  if (facts.keywords?.some(tag => /\b(horror|horreur)\b/i.test(tag.name))) return 'horror';
  return null; // TV genre 10765 (Science Fiction & Fantasy) is not Horror.
}

export function parentalHomeTarget(pathname: string, prefs: Preferences): string | null {
  return pathname === '/' && prefs.enabled && prefs.animeHome ? '/anime' : null;
}

function installParentalControlsRuntime() {
  if ((window as any).__MOVIX_PARENTAL_NATIVE_V1) return;
  (window as any).__MOVIX_PARENTAL_NATIVE_V1 = true;
  const PIN_KEY = 'movix_parental_pin_v1';
  const PREF_KEY = 'movix_parental_preferences_v1';
  const ITERATIONS = 310000;
  const defaults: Preferences = { enabled: false, maximumAge: 12, lockHorror: false, animeHome: false };
  const allowed = new Set<string>();
  const requests = new Map<string, Promise<MediaFacts>>();
  const captured = new Map<string, { details?: any; ratings?: any }>();
  let tmdbKey = '';
  let routeToken = 0;
  let pendingWatch: string | null = null;
  let sectionUnlocked = false;
  let sectionMode: 'create' | 'unlock' | 'change' | 'settings' = 'unlock';
  let firstPin = '';
  let sectionError = '';
  let mediaError = '';
  let mediaKey = '';
  let activePath = '';
  let renderScheduled = false;
  let lastPinInput: HTMLInputElement | null = null;
  const inertState = new Map<Element, { inert: boolean; aria: string | null }>();

  const dictionary = {
    fr: {
      title: 'Contrôle parental', desc: 'Réglez les accès sur cet appareil, avec ou sans connexion.',
      priorityNav: 'Priorité',
      local: 'Ce PIN et ces réglages restent sur cet appareil. Ce verrou local ne protège pas les accès hors de Movix.',
      create: 'Créez un PIN de 6 à 8 chiffres.', confirmPin: 'Confirmer le nouveau PIN',
      newPin: 'Nouveau PIN (6 à 8 chiffres)', currentPin: 'PIN actuel', enterPin: 'PIN parental',
      unlock: 'Saisissez votre PIN pour continuer.', changeHint: 'PIN actuel, puis nouveau PIN deux fois.',
      invalid: 'Le PIN doit contenir 6 à 8 chiffres.', mismatch: 'Les PIN ne correspondent pas.',
      wrong: 'PIN incorrect. Réessayez.', storage: "Impossible d'enregistrer sur cet appareil.",
      cancel: 'Annuler', confirm: 'Confirmer', checking: 'Vérification…',
      enabled: 'Activer le contrôle parental', age: 'Verrouiller les médias déconseillés au-dessus de {age} ans',
      decrease: "Diminuer l'âge limite", increase: "Augmenter l'âge limite", years: 'ans',
      horror: 'Verrouiller la catégorie Horreur', anime: 'Home par défaut : Anime', change: 'Changer le PIN',
      agreement: 'Accord parental nécessaire', rating: 'Vérification de la classification…',
      back: 'Retour', erase: 'Effacer un chiffre', keypad: 'Clavier numérique du PIN',
    },
    en: {
      title: 'Parental controls', desc: 'Set access rules on this device, signed in or not.',
      priorityNav: 'Priority',
      local: 'This PIN and these settings stay on this device. This local guard does not protect access outside Movix.',
      create: 'Create a 6 to 8 digit PIN.', confirmPin: 'Confirm new PIN',
      newPin: 'New PIN (6 to 8 digits)', currentPin: 'Current PIN', enterPin: 'Parental PIN',
      unlock: 'Enter your PIN to continue.', changeHint: 'Current PIN, then new PIN twice.',
      invalid: 'The PIN must contain 6 to 8 digits.', mismatch: 'The PIN entries do not match.',
      wrong: 'Incorrect PIN. Try again.', storage: 'Could not save on this device.',
      cancel: 'Cancel', confirm: 'Confirm', checking: 'Checking…',
      enabled: 'Enable parental controls', age: 'Lock titles rated above age {age}',
      decrease: 'Decrease age limit', increase: 'Increase age limit', years: 'years',
      horror: 'Lock Horror category', anime: 'Default Home: Anime', change: 'Change PIN',
      agreement: 'Parental approval required', rating: 'Checking the age rating…',
      back: 'Back', erase: 'Delete a digit', keypad: 'PIN number pad',
    },
  };
  const strings = () => {
    let language = document.documentElement.lang || '';
    try { language = localStorage.getItem('i18nextLng') || language; } catch {}
    return /^en\b/i.test(language) ? dictionary.en : dictionary.fr;
  };
  const lockIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1"/></svg>';
  const readPin = () => {
    try {
      const value = JSON.parse(localStorage.getItem(PIN_KEY) || 'null');
      return value?.version === 1 && value.iterations === ITERATIONS && /^[a-f0-9]{32}$/.test(value.salt)
        && /^[a-f0-9]{64}$/.test(value.hash) ? value : null;
    } catch { return null; }
  };
  const prefs = (): Preferences => {
    try {
      const value = JSON.parse(localStorage.getItem(PREF_KEY) || 'null');
      return {
        enabled: value?.enabled === true && !!readPin(),
        maximumAge: Number.isInteger(value?.maximumAge) ? Math.max(0, Math.min(21, value.maximumAge)) : 12,
        lockHorror: value?.lockHorror === true,
        animeHome: value?.animeHome === true,
      };
    } catch { return { ...defaults }; }
  };
  const savePrefs = (value: Preferences) => {
    if (!readPin()) throw new Error('PIN required');
    localStorage.setItem(PREF_KEY, JSON.stringify(value));
    allowed.clear();
    window.dispatchEvent(new Event('movix-parental-changed'));
    schedule();
  };
  const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  const derive = async (pin: string, salt: string) => {
    const bytes = new Uint8Array((salt.match(/.{2}/g) || []).map(x => parseInt(x, 16)));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: bytes, iterations: ITERATIONS, hash: 'SHA-256' }, key, 256)));
  };
  const valid = (pin: string) => /^\d{6,8}$/.test(pin);
  const verify = async (pin: string) => {
    const verifier = readPin();
    if (!verifier || !valid(pin)) return false;
    try {
      const hash = await derive(pin, verifier.salt);
      let difference = 0;
      for (let i = 0; i < 64; i++) difference |= hash.charCodeAt(i) ^ verifier.hash.charCodeAt(i);
      return difference === 0;
    } catch { return false; }
  };
  const writePin = async (pin: string) => {
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    localStorage.setItem(PIN_KEY, JSON.stringify({ version: 1, salt, hash: await derive(pin, salt), iterations: ITERATIONS }));
    allowed.clear();
  };

  const style = () => {
    if (document.getElementById('movix-parental-native-style')) return;
    const tag = document.createElement('style');
    tag.id = 'movix-parental-native-style';
    tag.textContent = `
      .movix-parental { color:#f9fafb; font:inherit; scroll-margin-top:9rem }
      .movix-parental *, #movix-parental-overlay * { box-sizing:border-box }
      .movix-parental-header { display:flex; align-items:center; gap:.75rem; margin-bottom:1.5rem }
      .movix-parental-icon { display:grid; place-items:center; width:2.5rem; height:2.5rem; flex:none; border:1px solid #7f1d1d; border-radius:.75rem; color:#f87171; background:#450a0a60 }
      .movix-parental h2 { font-size:1.25rem; font-weight:600; margin:0 }
      .movix-parental p, #movix-parental-overlay p { color:#9ca3af; font-size:.875rem; margin:.25rem 0 }
      .movix-parental-panel { max-width:44rem; border:1px solid #37415180; border-radius:1rem; background:#1f29374d; padding:1rem; margin-bottom:1rem }
      .movix-parental-row { display:flex; justify-content:space-between; align-items:center; gap:1rem; min-height:3.5rem; border-bottom:1px solid #37415180; padding:.7rem .2rem }
      .movix-parental-row:last-child { border:0 }
      .movix-parental-row[aria-disabled=true] { opacity:.48 }
      .movix-parental button, #movix-parental-overlay button { cursor:pointer; border:1px solid #4b5563; border-radius:.7rem; color:white; background:#374151; padding:.6rem .9rem; font:inherit }
      .movix-parental button:disabled, #movix-parental-overlay button:disabled { opacity:.45; cursor:default }
      .movix-parental button:focus-visible, .movix-parental input:focus-visible, #movix-parental-overlay button:focus-visible, #movix-parental-overlay input:focus-visible, [data-movix-parental-nav] button:focus-visible { outline:3px solid #f87171; outline-offset:3px }
      .movix-parental .primary, #movix-parental-overlay .primary { background:#b91c1c; border-color:#dc2626; font-weight:600 }
      .movix-parental .switch { min-width:3.2rem; background:#374151 }
      .movix-parental .switch[aria-checked=true] { background:#b91c1c }
      .movix-parental .step { display:flex; align-items:center; gap:.6rem }
      .movix-parental .step button { font-size:1.2rem; min-width:2.7rem; min-height:2.7rem; padding:.2rem }
      .movix-parental label, #movix-parental-overlay label { display:block; margin:.7rem 0; color:#e5e7eb; font-size:.875rem }
      .movix-parental input[type=password], #movix-parental-overlay input[type=password] { display:block; width:100%; max-width:20rem; margin-top:.3rem; padding:.65rem; border:1px solid #6b7280; border-radius:.7rem; background:#111827; color:white; font:inherit }
      .movix-parental-error { color:#fca5a5 !important; min-height:1.3rem }
      .movix-parental-actions { display:flex; flex-wrap:wrap; gap:.7rem; margin-top:1rem }
      .movix-parental-pad { display:grid; grid-template-columns:repeat(3,minmax(3rem,5rem)); gap:.4rem; margin:.8rem 0 }
      .movix-parental-pad button { min-height:2.7rem }
      [data-movix-parental-nav] button { color:#f87171 !important }
      [data-movix-parental-nav][data-active=true] button { background:#7f1d1d80 !important }
      #movix-parental-overlay { position:fixed; inset:0; z-index:2147483647; background:#03040bee; display:flex; align-items:center; justify-content:center; overflow:auto; padding:1rem; color:white }
      #movix-parental-overlay .movix-parental-dialog { width:min(100%,28rem); max-height:calc(100dvh - 2rem); overflow:auto; border:1px solid #991b1b90; border-radius:1.2rem; padding:1.4rem; background:#111827; box-shadow:0 1rem 4rem #000 }
      #movix-parental-overlay h2 { font-size:1.45rem; margin:.3rem 0 .8rem }
      @media(max-width:1023px) { .movix-parental { padding-bottom:7rem } }
    `;
    (document.head || document.documentElement).appendChild(tag);
  };
  const keypad = () => (window as any).MOVIX_TV === true
    ? `<div class="movix-parental-pad" data-parental-pin-keypad aria-label="${strings().keypad}">${[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map(n => n === '' ? '<span></span>' : `<button type="button" data-digit="${n}" aria-label="${n === '⌫' ? strings().erase : n}">${n}</button>`).join('')}</div>`
    : '';
  const pinField = (name: string, label: string) => `<label>${label}<input data-tv-parental-pin-input name="${name}" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off" required></label>`;
  const padClick = (event: Event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-digit]');
    if (!button) return false;
    const scope = button.closest('form') || button.closest('[role=dialog]');
    const input = scope?.querySelector<HTMLInputElement>('input:focus')
      || (lastPinInput && scope?.contains(lastPinInput) ? lastPinInput : null)
      || scope?.querySelector<HTMLInputElement>('input[type=password]');
    if (!input) return true;
    const digit = button.dataset.digit || '';
    input.value = digit === '⌫' ? input.value.slice(0, -1) : (input.value + digit).slice(0, 8);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
    return true;
  };

  const renderSection = (section: HTMLElement) => {
    const t = strings();
    const p = prefs();
    if (!readPin()) sectionMode = 'create';
    else if (!sectionUnlocked && sectionMode !== 'change') sectionMode = 'unlock';
    if (sectionUnlocked && sectionMode === 'unlock') sectionMode = 'settings';
    const form = sectionMode === 'create' || sectionMode === 'unlock' || sectionMode === 'change';
    section.innerHTML = `<div class="movix-parental-header" data-settings-search-title data-settings-search-keywords="pin,age,âge,horreur,horror,anime,parental">
        <span class="movix-parental-icon" aria-hidden="true">${lockIcon}</span><div><h2>${t.title}</h2><p>${t.desc}</p></div></div>
      <div class="movix-parental-panel"><p>${t.local}</p></div>
      ${!form && sectionError ? `<p class="movix-parental-error" role="alert">${sectionError}</p>` : ''}
      ${form ? `<form class="movix-parental-panel" data-pin-form><p>${sectionMode === 'create' ? t.create : sectionMode === 'change' ? t.changeHint : t.unlock}</p>
        ${sectionMode === 'change' ? pinField('current', t.currentPin) : ''}
        ${sectionMode === 'unlock' ? pinField('pin', t.enterPin) : pinField('next', t.newPin)}
        ${sectionMode !== 'unlock' ? pinField('confirm', t.confirmPin) : ''}
        ${keypad()}<p class="movix-parental-error" role="alert">${sectionError}</p>
        <div class="movix-parental-actions"><button type="submit" class="primary">${t.confirm}</button><button type="button" data-action="cancel">${t.cancel}</button></div></form>` :
      `<div class="movix-parental-panel">
        <div class="movix-parental-row"><span>${t.enabled}</span><button type="button" class="switch" role="switch" aria-label="${t.enabled}" aria-checked="${p.enabled}" data-setting="enabled">${p.enabled ? '✓' : '○'}</button></div>
        <div class="movix-parental-row" aria-disabled="${!p.enabled}"><span>${t.age.replace('{age}', String(p.maximumAge))}</span><div class="step"><button type="button" data-age="-1" aria-label="${t.decrease}" ${!p.enabled || p.maximumAge === 0 ? 'disabled' : ''}>−</button><strong>${p.maximumAge} ${t.years}</strong><button type="button" data-age="1" aria-label="${t.increase}" ${!p.enabled || p.maximumAge === 21 ? 'disabled' : ''}>+</button></div></div>
        <div class="movix-parental-row" aria-disabled="${!p.enabled}"><span>${t.horror}</span><button type="button" class="switch" role="switch" aria-label="${t.horror}" aria-checked="${p.lockHorror}" data-setting="lockHorror" ${!p.enabled ? 'disabled' : ''}>${p.lockHorror ? '✓' : '○'}</button></div>
        <div class="movix-parental-row" aria-disabled="${!p.enabled}"><span>${t.anime}</span><button type="button" class="switch" role="switch" aria-label="${t.anime}" aria-checked="${p.animeHome}" data-setting="animeHome" ${!p.enabled ? 'disabled' : ''}>${p.animeHome ? '✓' : '○'}</button></div>
        <div class="movix-parental-row"><button type="button" data-action="change">${t.change}</button></div>
      </div>`}`;
  };

  const activateSection = () => {
    const section = document.querySelector<HTMLElement>('[data-movix-parental-section]');
    if (!section) return;
      if (!sectionUnlocked) { sectionMode = readPin() ? 'unlock' : 'create'; sectionError = ''; renderSection(section); }
    const offset = window.innerWidth < 1024 ? 112 : 96;
    window.scrollTo({ top: Math.max(0, window.scrollY + section.getBoundingClientRect().top - offset), behavior: 'auto' });
    document.querySelectorAll('[data-movix-parental-nav]').forEach(node => node.setAttribute('data-active', 'true'));
    section.querySelector<HTMLInputElement>('input[type=password]')?.focus({ preventScroll: true });
  };
  const cancelSection = () => {
    const section = document.querySelector<HTMLElement>('[data-movix-parental-section]');
    if (!section) return;
    sectionError = '';
    if (sectionMode === 'change') {
      sectionMode = 'settings';
      renderSection(section);
    } else {
      sectionUnlocked = false;
      sectionMode = readPin() ? 'unlock' : 'create';
      renderSection(section);
      document.getElementById('appearance')?.scrollIntoView({ block: 'start' });
    }
  };
  const ensureSettings = () => {
    if (window.location.pathname !== '/settings') return;
    const source = document.getElementById('source-priority');
    if (!source || (document.getElementById('parental') && !document.querySelector('[data-movix-parental-section]'))) return; // deployed SPA implementation owns its section
    style();
    let section = document.querySelector<HTMLElement>('[data-movix-parental-section]');
    if (!section) {
      section = document.createElement('section');
      section.id = 'parental';
      section.setAttribute('data-movix-parental-section', '');
      section.className = 'movix-parental';
      source.parentElement?.insertBefore(section, source);
      renderSection(section);
      section.addEventListener('click', event => {
        if (padClick(event)) return;
        const button = (event.target as Element).closest<HTMLButtonElement>('button');
        if (!button) return;
        if (button.dataset.action === 'cancel') { cancelSection(); return; }
        if (button.dataset.action === 'change') { sectionMode = 'change'; sectionError = ''; renderSection(section!); section!.querySelector('input')?.focus(); return; }
        const p = prefs();
        if (button.dataset.setting) {
          const key = button.dataset.setting as 'enabled' | 'lockHorror' | 'animeHome';
          try { savePrefs({ ...p, [key]: !p[key] }); renderSection(section!); section!.querySelector<HTMLElement>(`[data-setting="${key}"]`)?.focus({ preventScroll: true }); }
          catch { sectionError = strings().storage; renderSection(section!); }
          return;
        }
        if (button.dataset.age) {
          const next = Math.max(0, Math.min(21, p.maximumAge + Number(button.dataset.age)));
          try {
            savePrefs({ ...p, maximumAge: next }); renderSection(section!);
            const target = section!.querySelector<HTMLElement>(`[data-age="${button.dataset.age}"]:not(:disabled)`)
              || section!.querySelector<HTMLElement>(`[data-age="${button.dataset.age === '1' ? '-1' : '1'}"]`);
            target?.focus({ preventScroll: true });
          } catch { sectionError = strings().storage; renderSection(section!); }
        }
      });
      section.addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.target as HTMLFormElement;
        const submit = form.querySelector<HTMLButtonElement>('button[type=submit]');
        const data = new FormData(form);
        const current = String(data.get('current') || data.get('pin') || '');
        const next = String(data.get('next') || '');
        const confirm = String(data.get('confirm') || '');
        sectionError = '';
        if (sectionMode !== 'unlock' && !valid(next)) sectionError = strings().invalid;
        else if (sectionMode !== 'unlock' && next !== confirm) sectionError = strings().mismatch;
        else {
          submit!.disabled = true; submit!.textContent = strings().checking;
          try {
            if (sectionMode === 'create' && !readPin()) { await writePin(next); sectionUnlocked = true; sectionMode = 'settings'; }
            else if (sectionMode === 'unlock' && await verify(current)) { sectionUnlocked = true; sectionMode = 'settings'; }
            else if (sectionMode === 'change' && await verify(current)) { await writePin(next); sectionUnlocked = true; sectionMode = 'settings'; }
            else sectionError = strings().wrong;
          } catch { sectionError = strings().storage; }
        }
        renderSection(section!);
        if (sectionMode !== 'settings') section!.querySelector<HTMLInputElement>('input')?.focus();
        else section!.querySelector<HTMLElement>('[data-setting=enabled]')?.focus({ preventScroll: true });
      });
    }
    // React owns the surrounding lists. Reinsert only our own nodes if a render
    // removed them; never replace a React child or its event listener.
    const title = source.querySelector('h2')?.textContent?.trim();
    const lists = [
      document.querySelector('[data-settings-sidebar-scroll] ul'),
      document.querySelector('main .lg\\:hidden.fixed .overflow-x-auto > div'),
    ];
    for (const [index, list] of lists.entries()) {
      if (!list || list.querySelector('[data-movix-parental-nav]')) continue;
      const buttons = Array.from(list.querySelectorAll<HTMLButtonElement>('button'));
      const sourceButton = buttons.find(button => {
        const label = button.textContent?.trim();
        return label === strings().priorityNav || label === title;
      });
      if (!sourceButton) continue;
      const item = document.createElement(index === 0 ? 'li' : 'span');
      item.setAttribute('data-movix-parental-nav', '');
      if (index === 1) item.className = 'flex flex-shrink-0';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = index === 0 ? 'relative w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium border border-transparent focus-visible:outline-red-400' : 'flex w-[92px] flex-shrink-0 flex-col items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-center';
      button.innerHTML = index === 0 ? `<span aria-hidden="true">${lockIcon}</span><span></span>` : `<span aria-hidden="true">${lockIcon}</span><span class="text-[10px] font-medium whitespace-nowrap"></span>`;
      button.lastElementChild!.textContent = strings().title;
      button.addEventListener('click', activateSection);
      item.appendChild(button);
      list.insertBefore(item, sourceButton.parentElement?.parentElement === list ? sourceButton.parentElement : sourceButton);
    }
    if (window.location.hash === '#parental') {
      if (!section.dataset.hashSeen) { section.dataset.hashSeen = 'true'; requestAnimationFrame(activateSection); }
    }
  };

  const learnTmdb = (url: string, body?: any) => {
    let parsed: URL;
    try { parsed = new URL(url, window.location.href); } catch { return; }
    if (parsed.hostname !== 'api.themoviedb.org') return;
    const key = parsed.searchParams.get('api_key');
    if (key) tmdbKey = key;
    const match = parsed.pathname.match(/^\/3\/(movie|tv)\/(\d+)(?:\/(release_dates|content_ratings))?$/);
    if (!match || !body) return;
    const id = `${match[1]}:${match[2]}`;
    const old = captured.get(id) || {};
    if (match[3]) old.ratings = body;
    else {
      old.details = body;
      if (body.release_dates || body.content_ratings) old.ratings = body.release_dates || body.content_ratings;
    }
    captured.set(id, old);
  };
  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') window.fetch = function (...args: Parameters<typeof fetch>) {
    const url = String(args[0] instanceof Request ? args[0].url : args[0]);
    learnTmdb(url);
    return originalFetch.apply(this, args).then(response => {
      if (url.includes('api.themoviedb.org/3/')) response.clone().json().then(body => learnTmdb(url, body)).catch(() => {});
      return response;
    });
  };
  const xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: any[]) {
    const href = String(url);
    learnTmdb(href);
    if (href.includes('api.themoviedb.org/3/')) this.addEventListener('loadend', () => {
      try { learnTmdb(href, JSON.parse(this.responseText)); } catch {}
    }, { once: true });
    return xhrOpen.apply(this, [method, url, ...rest] as Parameters<typeof xhrOpen>);
  };
  const awaitKey = async () => {
    for (let i = 0; i < 70 && !tmdbKey; i++) await new Promise(resolve => setTimeout(resolve, 100));
    return tmdbKey;
  };
  const fetchFacts = (route: MediaRoute): Promise<MediaFacts> => {
    const key = `${route.type}:${route.id}`;
    if (requests.has(key)) return requests.get(key)!;
    const request = (async () => {
      const apiKey = await awaitKey();
      const saved = captured.get(key) || {};
      const id = /^\d+$/.test(route.id) ? route.id : '';
      const get = async (path: string) => {
        if (!apiKey || !id) return null;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8500);
        try {
          const separator = path.includes('?') ? '&' : '?';
          const response = await originalFetch(`https://api.themoviedb.org/3/${route.type}/${id}${path}${separator}api_key=${encodeURIComponent(apiKey)}`, { signal: controller.signal });
          return response.ok ? await response.json() : null;
        } catch { return null; }
        finally { clearTimeout(timeout); }
      };
      const [details, ratings] = await Promise.all([
        get('?append_to_response=keywords'),
        get(route.type === 'movie' ? '/release_dates' : '/content_ratings'),
      ]);
      const media = details || saved.details;
      const tags = route.type === 'movie' ? media?.keywords?.keywords : media?.keywords?.results;
      return {
        age: parentalPreferredAge(route.type, ratings || saved.ratings, media?.adult === true),
        genres: Array.isArray(media?.genres) ? media.genres : null,
        keywords: Array.isArray(tags) ? tags : null,
        title: media?.title || media?.name,
      };
    })().finally(() => requests.delete(key));
    requests.set(key, request);
    return request;
  };

  const restoreInert = () => {
    for (const [node, state] of inertState) {
      if (state.inert) node.setAttribute('inert', ''); else node.removeAttribute('inert');
      if (state.aria === null) node.removeAttribute('aria-hidden'); else node.setAttribute('aria-hidden', state.aria);
    }
    inertState.clear();
  };
  const applyInert = (overlay: HTMLElement) => {
    if (!document.body) return;
    for (const node of Array.from(document.body.children)) {
      if (node === overlay || node.tagName === 'SCRIPT' || inertState.has(node)) continue;
      inertState.set(node, { inert: node.hasAttribute('inert'), aria: node.getAttribute('aria-hidden') });
      node.setAttribute('inert', ''); node.setAttribute('aria-hidden', 'true');
    }
    if (!overlay.contains(document.activeElement)) overlay.querySelector<HTMLElement>('input,button')?.focus({ preventScroll: true });
  };
  const removeOverlay = () => { document.getElementById('movix-parental-overlay')?.remove(); restoreInert(); };
  const goBack = () => { pendingWatch = null; if (history.length > 1) history.back(); else window.location.assign('/'); };
  const showOverlay = (state: 'checking' | 'locked', route: MediaRoute) => {
    style();
    const t = strings();
    let overlay = document.getElementById('movix-parental-overlay') as HTMLElement | null;
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'movix-parental-overlay';
      overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('data-tv-manage-autofocus', '');
      document.body?.appendChild(overlay);
      overlay.addEventListener('click', event => {
        if (padClick(event)) return;
        if ((event.target as Element).closest('[data-parental-back]')) goBack();
      });
      overlay.addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.target as HTMLFormElement;
        const input = form.querySelector<HTMLInputElement>('input');
        const button = form.querySelector<HTMLButtonElement>('button[type=submit]');
        const pin = input?.value || '';
        if (button) { button.disabled = true; button.textContent = strings().checking; }
        if (await verify(pin) && mediaKey) {
          allowed.add(mediaKey);
          mediaError = '';
          removeOverlay();
          if (pendingWatch && parentalMediaRoute(window.location.pathname)?.id === route.id) resumeWatch();
        } else {
          mediaError = strings().wrong;
          input!.value = '';
          showOverlay('locked', route);
        }
      });
    }
    const content = state === 'checking'
      ? `<p role="status">${t.rating}</p>`
      : `<form>${pinField('pin', t.enterPin)}${keypad()}<p class="movix-parental-error" role="alert">${mediaError}</p><div class="movix-parental-actions"><button type="submit" class="primary">${t.confirm}</button><button type="button" data-parental-back>${t.back}</button></div></form>`;
    overlay.innerHTML = `<div class="movix-parental-dialog"><div class="movix-parental-icon" aria-hidden="true">${lockIcon}</div><h2>${t.agreement}</h2>${content}${state === 'checking' ? `<button type="button" data-parental-back>${t.back}</button>` : ''}</div>`;
    applyInert(overlay);
  };
  const resumeWatch = () => {
    const target = pendingWatch;
    pendingWatch = null;
    if (!target) return;
    history.replaceState(history.state, '', target);
    window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
    schedule();
  };
  const checkRoute = async (route: MediaRoute, token: number) => {
    const key = `${route.type}:${route.id}`;
    mediaKey = key;
    if (allowed.has(key)) { removeOverlay(); resumeWatch(); return; }
    showOverlay('checking', route);
    let facts: MediaFacts = { age: null, genres: null, keywords: null };
    try { facts = await fetchFacts(route); } catch {}
    if (token !== routeToken || parentalMediaRoute(window.location.pathname)?.id !== route.id) return;
    if (parentalLockReason(prefs(), route.type, facts)) showOverlay('locked', route);
    else { allowed.add(key); removeOverlay(); resumeWatch(); }
  };

  const originalPush = history.pushState;
  const originalReplace = history.replaceState;
  const originalPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args: Parameters<typeof originalPlay>) {
    const route = parentalMediaRoute(window.location.pathname);
    if (prefs().enabled && ((pendingWatch && !allowed.has(mediaKey))
      || (route && !allowed.has(`${route.type}:${route.id}`)))) {
      return Promise.reject(new DOMException('Parental approval required', 'NotAllowedError'));
    }
    return originalPlay.apply(this, args);
  };
  // A watch route is diverted before React Router can start its player. A
  // popstate notification reconciles the router if it cached the requested URL.
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = method === 'pushState' ? originalPush : originalReplace;
    history[method] = function (state: any, title: string, url?: string | URL | null) {
      let destination: URL | null = null;
      try { if (url) destination = new URL(String(url), window.location.href); } catch {}
      const route = destination?.origin === window.location.origin ? parentalMediaRoute(destination.pathname) : null;
      if (route?.watch && prefs().enabled && !allowed.has(`${route.type}:${route.id}`)) {
        pendingWatch = destination!.pathname + destination!.search + destination!.hash;
        const result = original.call(this, state, title, `/${route.type}/${encodeURIComponent(route.id)}`);
        queueMicrotask(() => { window.dispatchEvent(new PopStateEvent('popstate', { state: history.state })); schedule(); });
        return result;
      }
      const result = original.call(this, state, title, url);
      schedule();
      return result;
    };
  }
  if (prefs().enabled) {
    const initial = parentalMediaRoute(window.location.pathname);
    if (initial?.watch) {
      pendingWatch = window.location.pathname + window.location.search + window.location.hash;
      originalReplace.call(history, history.state, '', `/${initial.type}/${encodeURIComponent(initial.id)}`);
    }
    const home = parentalHomeTarget(window.location.pathname, prefs());
    if (home) originalReplace.call(history, history.state, '', home);
  }

  const apply = () => {
    if (!document.body) return;
    const path = window.location.pathname;
    if (path !== activePath) {
      activePath = path; routeToken++;
      if (path !== '/settings') { sectionUnlocked = false; sectionMode = 'unlock'; }
      const route = parentalMediaRoute(path);
      const pendingRoute = pendingWatch && parentalMediaRoute(pendingWatch);
      if (pendingRoute && (!route || route.type !== pendingRoute.type || route.id !== pendingRoute.id)) pendingWatch = null;
      if (!prefs().enabled || !route) {
        mediaKey = ''; removeOverlay();
      } else if (!allowed.has(`${route.type}:${route.id}`)) void checkRoute(route, routeToken);
      else { removeOverlay(); resumeWatch(); }
    }
    if (path === '/settings') ensureSettings();
    if (document.getElementById('movix-parental-overlay')) applyInert(document.getElementById('movix-parental-overlay')!);
  };
  function schedule() {
    if (renderScheduled) return;
    renderScheduled = true;
    requestAnimationFrame(() => { renderScheduled = false; apply(); });
  }
  window.addEventListener('popstate', schedule);
  document.addEventListener('focusin', event => {
    if (event.target instanceof HTMLInputElement && event.target.hasAttribute('data-tv-parental-pin-input')) lastPinInput = event.target;
  });
  window.addEventListener('scroll', () => {
    const section = document.querySelector<HTMLElement>('[data-movix-parental-section]');
    if (!section || !sectionUnlocked || window.location.pathname !== '/settings') return;
    const rect = section.getBoundingClientRect();
    if (rect.bottom < 80 || rect.top > window.innerHeight - 40) {
      sectionUnlocked = false; sectionMode = 'unlock'; sectionError = '';
      renderSection(section);
      document.querySelectorAll('[data-movix-parental-nav]').forEach(node => node.removeAttribute('data-active'));
    }
  }, { passive: true });
  window.addEventListener('storage', schedule);
  window.addEventListener('movix-parental-changed', () => { activePath = ''; schedule(); });
  window.addEventListener('movix-tv-back', event => {
    if (document.getElementById('movix-parental-overlay')) {
      event.preventDefault(); event.stopImmediatePropagation(); goBack();
    } else if (window.location.pathname === '/settings' && ['create', 'unlock', 'change'].includes(sectionMode)
      && document.querySelector('[data-movix-parental-section]')) {
      event.preventDefault(); event.stopImmediatePropagation(); cancelSection();
    }
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' && event.key !== 'BrowserBack') return;
    if (document.getElementById('movix-parental-overlay')) { event.preventDefault(); goBack(); }
    else if (window.location.pathname === '/settings' && ['create', 'unlock', 'change'].includes(sectionMode)) { event.preventDefault(); cancelSection(); }
  }, true);
  if (typeof MutationObserver === 'function') new MutationObserver(schedule).observe(document.documentElement, { subtree: true, childList: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true });
  schedule();
}

export function buildParentalControlsRuntime(): string {
  return `(() => {
    const parentalMediaRoute = ${parentalMediaRoute.toString()};
    const parentalCertificationAge = ${parentalCertificationAge.toString()};
    const parentalPreferredAge = ${parentalPreferredAge.toString()};
    const parentalLockReason = ${parentalLockReason.toString()};
    const parentalHomeTarget = ${parentalHomeTarget.toString()};
    (${installParentalControlsRuntime.toString()})();
  })();`;
}
