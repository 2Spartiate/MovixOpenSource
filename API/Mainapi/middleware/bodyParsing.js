'use strict';
const express = require('express');
const { SYNC_LIMITS } = require('../utils/syncPolicy');

const parsedSizes = new WeakMap();
const DEFERRED_POST_PATH = /^\/api\/(?:sync|auth\/(?:bip39\/(?:create|login)|(?:discord|google)\/verify|links\/[^/]+|username))\/?$/i;

function shouldDeferBodyParsing(req) {
  return req.method === 'POST' && DEFERRED_POST_PATH.test(req.path);
}

function createGlobalBodyParsers() {
  const json = express.json({ limit: '8mb' });
  const urlencoded = express.urlencoded({ extended: true, limit: '1mb' });
  const defer = parser => (req, res, next) => shouldDeferBodyParsing(req) ? next() : parser(req, res, next);
  return { json: defer(json), urlencoded: defer(urlencoded) };
}

function rejectOversizedSync(req, res, next) {
  const encoding = String(req.headers['content-encoding'] || 'identity').toLowerCase();
  const length = Number(req.headers['content-length']);
  if (encoding === 'identity' && Number.isFinite(length) && length > SYNC_LIMITS.maxRequestBytes) {
    return res.status(413).json({ success: false, error: 'Requete de synchronisation trop volumineuse' });
  }
  next();
}

function createSyncBodyParsers() {
  return [
    express.json({
      limit: SYNC_LIMITS.maxRequestBytes,
      verify(req, _res, buffer) { parsedSizes.set(req, buffer.length); },
    }),
    express.urlencoded({ extended: true, limit: '1mb' }),
  ];
}

function createAuthBodyParsers() {
  // Les comptes peuvent encore envoyer leur avatar : conserver le plafond historique.
  return [express.json({ limit: '8mb' }), express.urlencoded({ extended: true, limit: '1mb' })];
}

module.exports = {
  createGlobalBodyParsers, createSyncBodyParsers, createAuthBodyParsers,
  rejectOversizedSync, shouldDeferBodyParsing,
  getParsedBodyBytes: req => parsedSizes.get(req),
};
