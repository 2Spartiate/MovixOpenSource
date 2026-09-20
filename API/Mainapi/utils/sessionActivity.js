const { createHash } = require('node:crypto');
const { LruMap } = require('./lruMap');

const RESERVE_ACTIVITY = `
local interval = tonumber(ARGV[1])
if redis.call('SET', KEYS[1], '1', 'PX', interval, 'NX') then
  return {1, interval}
end
return {0, redis.call('PTTL', KEYS[1])}
`;

function createSessionActivityUpdater({
  redis, getPool, now = Date.now, intervalMs = 60_000, maxEntries = 10_000,
  onError = error => console.error('[AUTH] Échec de la mise à jour d’activité :', error.message),
}) {
  const nextUpdates = new LruMap({ max: maxEntries });
  const interval = Number.isSafeInteger(intervalMs) && intervalMs >= 1000 ? intervalMs : 60_000;

  return async function updateSessionAccess(userType, userId, sessionId) {
    const identity = JSON.stringify([userType, userId, sessionId]);
    const startedAt = now();
    if ((nextUpdates.get(identity) || 0) > startedAt) return false;
    // Réserver localement avant tout await : une rafale dans le même worker
    // n'ajoute ni requêtes Redis ni promesses SQL pour cette session.
    nextUpdates.set(identity, startedAt + interval);
    try {
      if (redis?.status === 'ready') {
        try {
          const key = `auth:session-activity:v1:${createHash('sha256').update(identity).digest('hex')}`;
          const [reserved, ttl] = await redis.eval(RESERVE_ACTIVITY, 1, key, interval);
          if (Number(reserved) !== 1) {
            nextUpdates.set(identity, startedAt + Math.max(1, Number(ttl) || 1));
            return false;
          }
        } catch {
          // Sans Redis, la condition SQL protège toujours accessed_at entre
          // workers ; la limite locale évite une écriture par requête.
        }
      }
      const pool = getPool();
      if (!pool) return false;
      await pool.execute(
        `UPDATE user_sessions SET accessed_at = NOW()
         WHERE id = ? AND user_id = ? AND user_type = ?
         AND (accessed_at IS NULL OR accessed_at <= DATE_SUB(NOW(), INTERVAL ? SECOND))`,
        [sessionId, userId, userType, Math.ceil(interval / 1000)],
      );
      return true;
    } catch (error) {
      onError(error);
      return false;
    }
  };
}

module.exports = { createSessionActivityUpdater };
