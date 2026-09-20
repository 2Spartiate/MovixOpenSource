'use strict';

/** Ne retenir dans un cooldown ni réponse HTML, ni configuration, ni socket Axios. */
function compactRefreshError(error) {
  const compact = new Error(String(error?.message || 'Actualisation indisponible').slice(0, 1024));
  if (typeof error?.code === 'string') compact.code = error.code.slice(0, 128);
  if (Number.isInteger(error?.httpStatus)) compact.httpStatus = error.httpStatus;
  if (error?.coflixSiteRateLimited === true) compact.coflixSiteRateLimited = true;
  // Omega construit ce petit contrat HTTP pour les erreurs de ses scrapers.
  if (error?.responseData && typeof error.responseData === 'object') {
    compact.responseData = {};
    for (const key of ['message', 'error', 'details', 'french_stream_id', 'tmdb_id']) {
      const value = error.responseData[key];
      if (typeof value === 'string') compact.responseData[key] = value.slice(0, 1024);
      else if (typeof value === 'number' && Number.isFinite(value)) compact.responseData[key] = value;
    }
  }
  return compact;
}

module.exports = { compactRefreshError };
