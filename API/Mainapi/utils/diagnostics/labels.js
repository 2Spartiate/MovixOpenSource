'use strict';

const MAX_LABEL = 240;
const MAX_EXAMPLE = 512;
const SENSITIVE_QUERY = /^(?:access_?token|api_?key|auth(?:orization)?|cookie|key|password|secret|signature|sig|token)$/i;
const SELECTOR_QUERY = new Set(['action', 'route', 'order', 'type']);

function bounded(value, limit = MAX_LABEL) {
  const text = String(value == null ? '' : value).replace(/[\r\n\t]+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, Math.max(0, limit - 1))}…` : text;
}

function normalizePart(part) {
  const value = decodeSafe(part).toLowerCase();
  if (!value) return '';
  if (/^\d+$/.test(value)) return ':id';
  if (/^[0-9a-f]{8}-[0-9a-f-]{12,}$/i.test(value)) return ':id';
  if (/^[0-9a-f]{16,}$/i.test(value)) return ':hash';
  if (/^[a-z0-9_-]{24,}$/i.test(value) && /\d/.test(value)) return ':id';
  return bounded(value.replace(/[^a-z0-9._-]+/g, '-'), 80) || ':value';
}

function decodeSafe(value) {
  try { return decodeURIComponent(String(value)); } catch { return String(value); }
}

function normalizedPath(pathname) {
  const raw = String(pathname || '/').split('/').filter(Boolean);
  // These path components are credentials, and also create one group per user/key.
  const vip = raw.findIndex((part) => decodeSafe(part).toLowerCase() === 'vip-keys');
  if (vip >= 0 && raw[vip + 1]) raw[vip + 1] = ':key';
  const webhook = raw.findIndex((part) => part.toLowerCase() === 'webhooks');
  if (webhook >= 0 && raw[webhook + 2]) raw[webhook + 2] = ':token';
  if (/^(live|movie|series)$/i.test(raw[0] || '') && raw.length >= 4) {
    raw[1] = ':user'; raw[2] = ':password';
  }
  const parts = raw.map((part) => /^:(key|token|user|password)$/.test(part) ? part : normalizePart(part));
  return `/${parts.join('/')}`.replace(/\/$/, '') || '/';
}

function headerValue(input, name) {
  try {
    const got = input?.getHeader?.(name);
    if (got != null) return Array.isArray(got) ? got[0] : got;
  } catch { /* diagnostics must not affect requests */ }
  const headers = input?.headers;
  if (headers && typeof headers === 'object') {
    const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
    if (key && headers[key] != null) return Array.isArray(headers[key]) ? headers[key][0] : headers[key];
  }
  return undefined;
}

function hostOnly(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  try { return new URL(text.includes('://') ? text : `http://${text}`).host.toLowerCase(); } catch {
    return text.replace(/^\[|\]$/g, '').split('/')[0].toLowerCase();
  }
}

function parseHttpInput(input) {
  const object = input && typeof input === 'object' ? input : null;
  const raw = typeof input === 'string' || input instanceof URL ? String(input) :
    (object?.href || object?.url || object?.path || object?.pathname || '/');
  let url;
  try {
    url = new URL(raw, 'http://diagnostic.invalid');
  } catch { url = new URL('http://diagnostic.invalid/'); }
  const logicalHost = hostOnly(headerValue(object, 'host')) || hostOnly(object?.servername) ||
    hostOnly(object?.hostname) || hostOnly(object?.host) ||
    (url.hostname !== 'diagnostic.invalid' ? url.host.toLowerCase() : 'unknown');
  return { object, url, logicalHost };
}

function httpLabel(input, method = 'GET') {
  try {
    const { object, url, logicalHost } = parseHttpInput(input);
    const actualMethod = bounded(object?.method || object?.options?.method || method || 'GET', 16).toUpperCase();
    const selectors = [];
    for (const [key, value] of url.searchParams) {
      if (SELECTOR_QUERY.has(key.toLowerCase())) {
        // Small query enums (e.g. KissKH order=1/2) carry meaning; numeric path
        // IDs, including seasons/episodes 1..9, do not need separate groups.
        const selector = /^\d$/.test(value) ? value : normalizePart(value);
        selectors.push(`${key.toLowerCase()}=${selector}`);
      }
    }
    const selectorText = selectors.length ? `?${selectors.slice(0, 4).join('&')}` : '';
    const operation = bounded(`${actualMethod} ${logicalHost}${normalizedPath(url.pathname)}${selectorText}`);
    const safeQuery = [];
    for (const [key, value] of url.searchParams) {
      if (!SENSITIVE_QUERY.test(key) && (SELECTOR_QUERY.has(key.toLowerCase()) || /^(?:page|size|limit|offset)$/i.test(key))) {
        safeQuery.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
      }
    }
    const protocol = url.protocol === 'http:' || url.protocol === 'https:' ? url.protocol : 'https:';
    const example = bounded(`${protocol}//${logicalHost}${normalizedPath(url.pathname)}${safeQuery.length ? `?${safeQuery.join('&')}` : ''}`, MAX_EXAMPLE);
    return { operation, destination: bounded(logicalHost, 180) || 'unknown', example };
  } catch {
    return { operation: 'GET unknown/', destination: 'unknown', example: 'unknown' };
  }
}

function redisKeyFamily(key) {
  const value = String(key == null ? '' : key).replace(/\\/g, '/').trim();
  if (!value) return 'none';
  const pieces = value.split(/[:/]+/).filter(Boolean).slice(0, 6).map(normalizePart);
  return bounded(pieces.join(':') || 'value', 160);
}

function redisLabel(command) {
  const name = bounded(command?.name || command?.command || (Array.isArray(command) ? command[0] : command) || 'unknown', 48).toUpperCase();
  const args = command?.args || (Array.isArray(command) ? command.slice(1) : []);
  const key = Array.isArray(args) && args.length ? args[0] : '';
  const family = /^(AUTH|HELLO|QUIT|PING|INFO|CLIENT|SELECT)$/i.test(name) ? 'control' : redisKeyFamily(key);
  return {
    operation: bounded(`${name} ${family}`),
    destination: 'redis',
    example: bounded(`${name} ${family}`, MAX_EXAMPLE)
  };
}

function sqlFingerprint(sql) {
  let text = String(sql == null ? '' : sql)
    .replace(/'(?:''|\\.|[^'])*'/g, '?')
    .replace(/"(?:""|\\.|[^"])*"/g, '?')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\r\n]*/g, ' ')
    .replace(/#[^\r\n]*/g, ' ')
    .replace(/\b(?:0x[0-9a-f]+|\d+(?:\.\d+)?)\b/gi, '?')
    .replace(/\s+/g, ' ').trim();
  if (!text) text = 'UNKNOWN';
  return bounded(text, MAX_EXAMPLE);
}

function sqlLabel(sql) {
  const fingerprint = sqlFingerprint(sql);
  const keyword = (fingerprint.match(/^[A-Z]+/i)?.[0] || 'SQL').toUpperCase();
  return { operation: bounded(`${keyword} ${fingerprint}`, MAX_LABEL), destination: 'mysql', example: fingerprint };
}

module.exports = { httpLabel, redisLabel, sqlLabel, sqlFingerprint };
