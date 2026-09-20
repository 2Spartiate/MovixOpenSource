// API/Mainapi/utils/hydrackerBlackout.js
//
// Interrupteur global du trafic sortant vers hydracker / darkiworld.
//
// HYDRACKER_BLACKOUT=true  → aucune requête HTTP ne sort vers hydracker.com ni
//                            vers le domaine darkiworld : plus de synchro live,
//                            plus de refresh de session, plus de fetch de liens.
//                            Tout est servi depuis le cache disque + les
//                            snapshots sqlite locaux.
// HYDRACKER_BLACKOUT=false → comportement historique (requêtes autorisées).
//
// Défaut : true. Une valeur absente ou invalide vaut blackout, pour qu'un oubli
// de configuration ne rouvre jamais le robinet par accident.

'use strict';

function isHydrackerBlackout() {
  return String(process.env.HYDRACKER_BLACKOUT ?? 'true').trim().toLowerCase() !== 'false';
}

// Erreur normalisée renvoyée par les couches réseau quand le blackout est actif.
// `response.status = 503` pour que les gestionnaires existants (qui retombent
// sur le cache dès qu'un statut >= 500 arrive) fassent ce qu'il faut sans
// modification.
function buildBlackoutError(what) {
  const error = new Error(
    `Blackout hydracker actif (HYDRACKER_BLACKOUT=true) : requête ${what} bloquée.`,
  );
  error.isHydrackerBlackout = true;
  error.response = { status: 503 };
  return error;
}

module.exports = { isHydrackerBlackout, buildBlackoutError };
