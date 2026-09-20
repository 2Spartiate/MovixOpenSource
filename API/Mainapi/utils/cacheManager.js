/**
 * Cache management utilities.
 * Extracted from server.js — centralizes all file-based and memory cache helpers.
 */

const fsp = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const writeFileAtomic = require('write-file-atomic');
const { redis, memoryCache } = require('../config/redis');

// === CACHE DIRECTORIES ===
// NOTE: __dirname is API/utils/, so we go up one level to reach API/
const ANIME_SAMA_CACHE_DIR = path.join(__dirname, '..', 'cache', 'anime-sama');

const CACHE_DIR = {
  ANIME_SAMA: ANIME_SAMA_CACHE_DIR,
  COFLIX: path.join(__dirname, '..', 'cache', 'coflix'),
  FSTREAM: path.join(__dirname, '..', 'cache', 'fstream'),
  CPASMAL: path.join(__dirname, '..', 'cache', 'cpasmal'),
  TVDIRECT: path.join(__dirname, '..', 'cache', 'tvdirect'),
  PURSTREAM: path.join(__dirname, '..', 'cache', 'purstream'),
  NOCTAFLIX: path.join(__dirname, '..', 'cache', 'noctaflix'),
  FTV: path.join(__dirname, '..', 'cache', 'ftv'),
  J1F: path.join(__dirname, '..', 'cache', '1jour1film'),
  SWIFTFLOW: path.join(__dirname, '..', 'cache', 'swiftflow')
};

const DEFAULT_CACHE_REFRESH_WINDOW_MS = 40 * 60 * 1000;

// Cr\u00e9er les dossiers de cache s'ils n'existent pas
(async () => {
  for (const dir of Object.values(CACHE_DIR)) {
    try {
      await fsp.access(dir);
    } catch {
      await fsp.mkdir(dir, { recursive: true });
    }
  }
})();

// Fonction pour g\u00e9n\u00e9rer une cl\u00e9 de cache bas\u00e9e sur les param\u00e8tres
const generateCacheKey = (params) => {
  const stringParams = typeof params === 'string' ? params : JSON.stringify(params);
  return crypto.createHash('md5').update(stringParams).digest('hex');
};

// Fonction pour corriger le type de stream bas\u00e9 sur l'URL
const correctStreamType = (streamData) => {
  if (streamData && streamData.url && streamData.url.includes('.mp4')) {
    return {
      ...streamData,
      type: 'mp4'
    };
  }
  return streamData;
};

// Fonction pour v\u00e9rifier si une donn\u00e9e est en cache avec expiration de 8h
const getFromCacheWithExpiration = async (cacheDir, key, expirationHours = 8) => {
  try {
    // 1. V\u00e9rifier le cache m\u00e9moire (L1) (rapide)
    // Si c'est en m\u00e9moire (TTL 5 min), c'est forc\u00e9ment valide (< 8h)
    const memKey = `${cacheDir}:${key}`;
    const memData = await memoryCache.get(memKey);
    if (memData) {
      if (process.env.DEBUG_CACHE) console.log(`[Cache] Memory hit for ${key}`);
      return memData;
    }

    // 2. V\u00e9rifier le cache fichier (L2) (lent)
    const cacheFilePath = path.join(cacheDir, `${key}.json`);
    let stats;
    try {
      stats = await fsp.stat(cacheFilePath);
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }

    const now = Date.now();
    const fileTime = stats.mtime.getTime();
    const expirationTime = expirationHours * 60 * 60 * 1000; // en millisecondes

    // V\u00e9rifier si le cache a expir\u00e9
    if (now - fileTime > expirationTime) {
      return null;
    }

    const fileContent = await fsp.readFile(cacheFilePath, 'utf8');
    const cacheData = JSON.parse(fileContent);

    // Mettre \u00e0 jour le cache m\u00e9moire pour les prochaines fois
    await memoryCache.set(memKey, cacheData);

    return cacheData;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    console.error(`Erreur lors de la r\u00e9cup\u00e9ration du cache pour ${key}:`, error);
    return null;
  }
};

// Fonction pour sauvegarder des donn\u00e9es en cache
const saveToCache = async (cacheDir, key, data) => {
  try {
    const cacheFilePath = path.join(cacheDir, `${key}.json`);

    // S'assurer que le dossier de cache existe
    await fsp.mkdir(cacheDir, { recursive: true });

    // OPTIMISATION: Utiliser write-file-atomic directement sans lockfile
    // lockfile (utilis\u00e9 dans safeWriteFile) ajoute 50-100ms de latence par \u00e9criture
    // Pour des fichiers de cache temporaires, atomic write suffit largement
    await writeFileAtomic(cacheFilePath, JSON.stringify(data), { encoding: 'utf8', fsync: false });

    // Mettre aussi en cache m\u00e9moire pour \u00e9viter les lectures disque
    await memoryCache.set(`${cacheDir}:${key}`, data);
    return true;
  } catch (error) {
    console.error(`Erreur lors de la sauvegarde en cache pour ${key}:`, error);
    return false;
  }
};

// === CACHE EN MÉMOIRE POUR ÉVITER LES REQUÊTES DUPLIQUÉES ===
// Map pour stocker les promesses en cours d'exécution
const ongoingFStreamRequests = new Map();
const FSTREAM_REQUEST_TIMEOUT = 8000;

// Fonction pour obtenir ou créer une requête FStream partagée
const getOrCreateFStreamRequest = async (cacheKey, requestFunction) => {
  let entry = ongoingFStreamRequests.get(cacheKey);
  if (!entry) {
    const promise = Promise.resolve().then(requestFunction).finally(() => {
      if (ongoingFStreamRequests.get(cacheKey)?.promise === promise) ongoingFStreamRequests.delete(cacheKey);
    });
    entry = { promise };
    ongoingFStreamRequests.set(cacheKey, entry);
  }

  let timer;
  try {
    return await Promise.race([
      entry.promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout of ${FSTREAM_REQUEST_TIMEOUT}ms exceeded`)), FSTREAM_REQUEST_TIMEOUT);
      }),
    ]);
  } finally { clearTimeout(timer); }
};

// Le délai borne l'attente HTTP ; la promesse reste partagée jusqu'à la fin du
// scrape pour qu'une nouvelle requête ne déclenche pas un travail en doublon.

// Fonction pour g\u00e9n\u00e9rer une cl\u00e9 de cache FStream
const generateFStreamCacheKey = (type, id, season = null, episode = null) => {
  const params = { type, id, season, episode };
  return crypto.createHash('md5').update(JSON.stringify(params)).digest('hex');
};

// Fonction pour nettoyer le cache FStream
const clearFStreamCache = async () => {
  try {
    const cacheDir = CACHE_DIR.FSTREAM;
    const files = await fsp.readdir(cacheDir, { withFileTypes: true }).catch((error) => error.code === 'ENOENT' ? [] : Promise.reject(error));
    let deletedFiles = 0;

    for (const file of files) {
      if (file.isFile() && file.name.endsWith('.json')) {
        await invalidateFStreamCache(path.basename(file.name, '.json'));
        deletedFiles++;
      }
    }

    return { success: true, deletedFiles };
  } catch (error) {
    console.error(`[FSTREAM CACHE] Erreur lors du nettoyage: ${error.message}`);
    return { success: false, error: error.message };
  }
};

const { createFStreamCacheStore: createStore } = require('./fstreamCache');
const createFStreamCacheStore = (options = {}) => createStore({ cacheDir: CACHE_DIR.FSTREAM, redis, ...options });
const fstreamCacheStore = createFStreamCacheStore();
const saveFStreamToCache = (cacheKey, data) => fstreamCacheStore.save(cacheKey, data);
const getFStreamFromCache = async (cacheKey) => (await fstreamCacheStore.get(cacheKey))?.data || null;
const invalidateFStreamCache = (cacheKey) => fstreamCacheStore.invalidate(cacheKey);
const getFStreamRefreshInfo = async (cacheKey) => {
  const entry = await fstreamCacheStore.get(cacheKey);
  return { entry, isFresh: fstreamCacheStore.isFresh(entry) };
};
const refreshFStreamCache = (cacheKey, scrape, validate) => fstreamCacheStore.getOrRefresh(cacheKey, scrape, validate);

// Fonction pour vérifier si une donnée est en cache sans vérifier la date d'expiration
const getFromCacheNoExpiration = async (cacheDir, key) => {
  try {
    // 1. Vérifier le cache mémoire (L1)
    const memKey = `${cacheDir}:${key}`;
    const memData = await memoryCache.get(memKey);
    if (memData) {
      return memData;
    }

    const cacheFilePath = path.join(cacheDir, `${key}.json`);
    let fileContent;
    try {
      fileContent = await fsp.readFile(cacheFilePath, 'utf8');
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }

    const cacheData = JSON.parse(fileContent);

    // Validation: s'assurer que les données en cache ne sont pas du texte "Maintenance en cours"
    if (typeof cacheData === 'string' && cacheData.includes('Maintenance en cours')) {
      console.error(`Cache invalide détecté pour ${key} - contient "Maintenance en cours"`);
      try { await fsp.unlink(cacheFilePath); } catch (unlinkError) { }
      return null;
    }

    // Validation: s'assurer que les données en cache sont bien du JSON valide et pas du texte brut
    if (typeof cacheData === 'string' || cacheData === null || cacheData === undefined) {
      console.error(`Cache invalide détecté pour ${key} - données non-JSON ou nulles`);
      try { await fsp.unlink(cacheFilePath); } catch (unlinkError) { }
      return null;
    }

    // Mettre en cache mémoire
    await memoryCache.set(memKey, cacheData);

    return cacheData;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    console.error(`Erreur lors de la récupération du cache pour ${key}:`, error);
    return null;
  }
};

// Vérifier l'âge du cache, avec un délai de 40 minutes par défaut.
const shouldUpdateCache = async (cacheDir, cacheKey, refreshWindowMs = 40 * 60 * 1000) => {
  const cacheFilePath = path.join(cacheDir, `${cacheKey}.json`);
  try {
    const stats = await fsp.stat(cacheFilePath);
    const now = Date.now();
    const fileAge = now - stats.mtime.getTime();
    if (fileAge < refreshWindowMs) {
      return false; // Ne pas mettre à jour le cache
    }
    return true; // Mettre à jour le cache
  } catch (error) {
    // Si le fichier n'existe pas ou erreur de lecture, continuer avec la mise à jour
    return true;
  }
};

// Fonction pour vérifier si le cache French-Stream doit être mis à jour (3 heures)
const getCacheRefreshInfo = async (cacheDir, cacheKey, refreshWindowMs = DEFAULT_CACHE_REFRESH_WINDOW_MS) => {
  const cacheFilePath = path.join(cacheDir, `${cacheKey}.json`);
  try {
    const stats = await fsp.stat(cacheFilePath);
    const now = Date.now();
    const lastModifiedAtMs = stats.mtime.getTime();
    const refreshAvailableAtMs = lastModifiedAtMs + refreshWindowMs;
    const refreshInMs = Math.max(refreshAvailableAtMs - now, 0);

    return {
      shouldRefreshNow: refreshInMs === 0,
      cacheLastModifiedAt: new Date(lastModifiedAtMs).toISOString(),
      refreshAvailableAt: new Date(refreshAvailableAtMs).toISOString(),
      refreshInMs,
      refreshInMinutes: Math.ceil(refreshInMs / 60000)
    };
  } catch (error) {
    return {
      shouldRefreshNow: true,
      cacheLastModifiedAt: null,
      refreshAvailableAt: null,
      refreshInMs: 0,
      refreshInMinutes: 0
    };
  }
};

// Fonction pour rafraichir la date d'un cache sans ecraser son contenu
const touchCacheEntry = async (cacheDir, key) => {
  try {
    const cacheFilePath = path.join(cacheDir, `${key}.json`);
    const now = new Date();
    await fsp.utimes(cacheFilePath, now, now);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }
    console.error(`Erreur lors du rafraichissement du cache pour ${key}:`, error);
    return false;
  }
};

const shouldUpdateCacheFrenchStream = async (cacheDir, cacheKey) => {
  const cacheFilePath = path.join(cacheDir, `${cacheKey}.json`);
  try {
    const stats = await fsp.stat(cacheFilePath);
    const now = Date.now();
    const fileAge = now - stats.mtime.getTime();
    const threeHours = 3 * 60 * 60 * 1000; // 3 heures en millisecondes

    if (fileAge < threeHours) {
      return false; // Ne pas mettre à jour le cache
    }
    return true; // Mettre à jour le cache
  } catch (error) {
    return true;
  }
};

// Fonction pour vérifier si le cache LecteurVideo doit être mis à jour (2 heures)
const shouldUpdateCacheLecteurVideo = async (cacheDir, cacheKey) => {
  const cacheFilePath = path.join(cacheDir, `${cacheKey}.json`);
  try {
    const stats = await fsp.stat(cacheFilePath);
    const now = Date.now();
    const fileAge = now - stats.mtime.getTime();
    const twoHours = 2 * 60 * 60 * 1000; // 2 heures en millisecondes

    if (fileAge < twoHours) {
      return false; // Ne pas mettre à jour le cache
    }
    return true; // Mettre à jour le cache
  } catch (error) {
    return true;
  }
};

// Fonction pour vérifier si le cache doit être mis à jour (24 heures) - utilisée pour la route decode
const shouldUpdateCache24h = async (cacheDir, cacheKey) => {
  const cacheFilePath = path.join(cacheDir, `${cacheKey}.json`);
  try {
    const stats = await fsp.stat(cacheFilePath);
    const now = Date.now();
    const fileAge = now - stats.mtime.getTime();
    const twentyFourHours = 24 * 60 * 60 * 1000; // 24 heures en millisecondes

    if (fileAge < twentyFourHours) {
      return false; // Ne pas mettre à jour le cache
    }
    return true; // Mettre à jour le cache
  } catch (error) {
    return true;
  }
};

const shouldUpdateCache48h = async (cacheDir, cacheKey) => {
  const cacheFilePath = path.join(cacheDir, `${cacheKey}.json`);
  try {
    const stats = await fsp.stat(cacheFilePath);
    const now = Date.now();
    const fileAge = now - stats.mtime.getTime();
    const fortyEightHours = 48 * 60 * 60 * 1000;

    if (fileAge < fortyEightHours) {
      return false;
    }
    return true;
  } catch (error) {
    return true;
  }
};

module.exports = {
  CACHE_DIR,
  ANIME_SAMA_CACHE_DIR,
  generateCacheKey,
  correctStreamType,
  getFromCacheWithExpiration,
  getFromCacheNoExpiration,
  saveToCache,
  touchCacheEntry,
  getCacheRefreshInfo,
  shouldUpdateCache,
  shouldUpdateCacheFrenchStream,
  shouldUpdateCacheLecteurVideo,
  shouldUpdateCache24h,
  shouldUpdateCache48h,
  ongoingFStreamRequests,
  getOrCreateFStreamRequest,
  saveFStreamToCache,
  generateFStreamCacheKey,
  clearFStreamCache,
  getFStreamFromCache,
  invalidateFStreamCache,
  getFStreamRefreshInfo,
  refreshFStreamCache,
  createFStreamCacheStore
};
