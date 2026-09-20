const express = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { isIP } = require('node:net');
const signing = require('./mediaSigning');
const { createStreamedNativeService, parseStreamedEmbed, mediaUrl } = require('./streamedNative');

const MEDIA_ROUTE = '/livetv/streamed/media';
const SAFE_FAILURE_REASONS = new Set([
  'URL Streamed invalide', 'CDN Streamed inconnu', 'Destination Streamed non publique',
  'Réponse CDN invalide', 'Trop de redirections Streamed', 'Segment Streamed invalide',
  'Décodeur Streamed occupé', 'Décodage Streamed expiré', 'Décodage Streamed impossible',
  'Décodeur Streamed arrêté', 'Réponse Streamed invalide', 'Message Streamed invalide',
  'Lecteur Streamed invalide', 'Hôte Streamed inconnu', 'Adresse golf introuvable',
  'Lecteur golf introuvable', 'Lecteur golf natif indisponible',
  'Proxy SOCKS5 Streamed indisponible', 'Proxy SOCKS5 Streamed invalide',
]);
const SAFE_FAILURE_CODES = new Set([
  'ENOENT', 'EACCES', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ECONNREFUSED',
  'ETIMEDOUT', 'ENETUNREACH', 'EHOSTUNREACH', 'ABORT_ERR',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET', 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
]);

function registerStreamedNativeRoutes(router, { source, verifyAccessKey, pickProxy, proxyBase,
  native = createStreamedNativeService({ pickProxy }), signatures = signing, logger = console }) {
  const limit = rateLimit({
    windowMs: 60000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false,
    // Même contrat d'ingress que les autres routes Main API derrière Cloudflare.
    keyGenerator: req => {
      const forwarded = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',')[0]?.trim();
      return ipKeyGenerator(typeof forwarded === 'string' && isIP(forwarded) ? forwarded : req.ip);
    },
    validate: { xForwardedForHeader: false, ip: false },
  });
  const findStream = async req => {
    if (!/^streamed_[a-zA-Z0-9_-]{1,250}$/.test(req.params.channelId) || !/^[a-f0-9]{24}$/.test(req.params.streamKey)) return null;
    const streams = await source.getStreams(req.params.channelId);
    return streams.find(stream => stream._streamedKey === req.params.streamKey);
  };
  const signedUrl = value => {
    mediaUrl(value.url);
    if (!proxyBase) throw new Error('Relais Streamed indisponible');
    const ttl = Math.max(1, Math.floor((value.expiresAt - Date.now()) / 1000));
    return signatures.buildSignedProxyUrl(proxyBase, '/streamed-proxy', value.url, {
      ttlSeconds: ttl, extraParams: { referer: value.referer },
    });
  };

  // L'extension effectue le POST amont depuis l'IP du spectateur. Ce décodeur
  // borné ne contacte aucun média et n'accorde aucune URL de proxy à un visiteur.
  router.post('/streamed/decode/:channelId/:streamKey', limit, express.json({ limit: '16kb' }), async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    try {
      const stream = await findStream(req);
      if (!stream) return res.status(404).json({ error: 'Lecteur Streamed introuvable' });
      const requested = parseStreamedEmbed(req.body?.embedUrl);
      const known = parseStreamedEmbed(stream.url);
      if (req.body.embedUrl !== stream.url && !(known.source === 'golf' && requested.source === 'ingest')) {
        return res.status(400).json({ error: 'Lecteur Streamed invalide' });
      }
      const result = await native.decode(req.body);
      return res.json({ url: result.url, referer: result.referer });
    } catch { return res.status(502).json({ error: 'Décodage Streamed indisponible' }); }
  });

  router.get('/streamed/native/:channelId/:streamKey', limit, async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    try {
      const key = req.headers['x-access-key'];
      if (typeof key !== 'string' || !(await verifyAccessKey(key)).vip) return res.status(403).json({ error: 'VIP requis pour le relais natif' });
      if (!signatures.signingConfigured() || !proxyBase) return res.status(503).json({ error: 'Relais Streamed indisponible' });
      const stream = await findStream(req);
      if (!stream) return res.status(404).json({ error: 'Lecteur Streamed introuvable' });
      const result = await native.resolve(stream.url);
      const ttl = Math.max(1, Math.min(7200, signatures.SIGNATURE_TTL || 7200));
      return res.json({ url: signedUrl({ ...result, expiresAt: Date.now() + ttl * 1000 }) });
    } catch { return res.status(502).json({ error: 'Lecteur natif Streamed indisponible' }); }
  });

  // Compatibilité avec les liens déjà délivrés : même autorisation et même
  // échéance, mais tout téléchargement média passe désormais par proxiesembed.
  router.get('/streamed/media.m3u8', async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    let stage = 'token'; let host;
    try {
      if (typeof req.query.token !== 'string' || req.query.token.length > 16000) return res.sendStatus(403);
      const decoded = signatures.decodeSignedToken(MEDIA_ROUTE, req.query.token);
      if (!decoded) return res.sendStatus(403);
      const target = JSON.parse(decoded);
      if (!Number.isFinite(target.expiresAt) || target.expiresAt <= Date.now() ||
        !['https://embed.st/', 'https://exposestrat.com/'].includes(target.referer)) return res.sendStatus(403);
      if (target.embedUrl) {
        stage = 'resolve';
        parseStreamedEmbed(target.embedUrl);
        host = 'embed.st';
        const fresh = await native.resolve(target.embedUrl);
        target.url = fresh.url;
        target.referer = fresh.referer;
      }
      stage = 'redirect';
      host = new URL(target.url).hostname;
      return res.redirect(307, signedUrl(target));
    } catch (error) {
      // execFile inclut la commande et les URLs signées dans error.message :
      // seuls les motifs connus et les codes techniques sont journalisés.
      const code = error?.code ?? error?.cause?.code;
      logger.warn('[STREAMED] Échec du relais média', {
        stage, host,
        reason: SAFE_FAILURE_REASONS.has(error?.message) ? error.message : 'Erreur amont',
        code: SAFE_FAILURE_CODES.has(code) || (Number.isInteger(code) && code > 0 && code < 100) ? code : undefined,
        status: /^Streamed HTTP (\d{3})$/.exec(error?.message)?.[1],
      });
      return res.status(502).send('Flux Streamed indisponible');
    }
  });
}

module.exports = { registerStreamedNativeRoutes };
