const MEDIA_TYPES = new Set(['movie', 'tv', 'anime']);

/** Compteurs publics du profil : ni texte des messages, ni contributions supprimées. */
async function fetchWrappedCommunity(pool, { userId, userType, profileId, year }) {
    if (!['oauth', 'bip39'].includes(userType) || !userId || typeof profileId !== 'string' || !profileId || profileId.length > 255) return null;
    if (!Number.isInteger(year) || year < 2024 || year > 9998) return null;
    const from = Date.UTC(year, 0, 1);
    const to = Date.UTC(year + 1, 0, 1);
    const scope = [String(userId), userType, profileId, from, to];

    const [rows] = await pool.execute({
        timeout: 4000,
        sql: `SELECT content_type, content_id,
                     SUM(kind = 'comment') AS comments_posted,
                     SUM(kind = 'reply') AS replies_posted,
                     COUNT(*) AS contributions
              FROM (
                  SELECT c.content_type, c.content_id, 'comment' AS kind
                  FROM comments c
                  WHERE c.user_id = ? AND c.user_type = ? AND c.profile_id = ?
                    AND c.created_at >= ? AND c.created_at < ? AND c.deleted = 0
                  UNION ALL
                  SELECT c.content_type, c.content_id, 'reply' AS kind
                  FROM comment_replies r
                  JOIN comments c ON c.id = r.comment_id AND c.deleted = 0
                  WHERE r.user_id = ? AND r.user_type = ? AND r.profile_id = ?
                    AND r.created_at >= ? AND r.created_at < ? AND r.deleted = 0
              ) contributions_by_profile
              GROUP BY content_type, content_id
              ORDER BY contributions DESC, content_type, content_id`
    }, [...scope, ...scope]);

    const count = value => Math.max(0, Number(value) || 0);
    const titles = rows.filter(row => MEDIA_TYPES.has(row.content_type) && /^\d+$/.test(String(row.content_id)) && Number.isSafeInteger(Number(row.content_id)) && Number(row.content_id) > 0);
    let winner = null;
    try {
        const [highlights] = await pool.execute({
            timeout: 4000,
            sql: `SELECT c.id, c.content, c.created_at, c.is_spoiler, c.content_type, c.content_id,
                     COUNT(DISTINCT CASE WHEN reaction.id IS NOT NULL THEN reaction.id END) AS reactions,
                     COUNT(DISTINCT CASE WHEN reply.id IS NOT NULL THEN reply.id END) AS replies
              FROM comments c
              LEFT JOIN comment_reactions reaction ON reaction.target_type = 'comment' AND reaction.target_id = c.id
                  AND NOT (reaction.user_id = c.user_id AND reaction.user_type = c.user_type)
                  AND reaction.created_at >= ? AND reaction.created_at < ?
              LEFT JOIN comment_replies reply ON reply.comment_id = c.id AND reply.deleted = 0
                  AND NOT (reply.user_id = c.user_id AND reply.user_type = c.user_type)
                  AND reply.created_at >= ? AND reply.created_at < ?
              WHERE c.user_id = ? AND c.user_type = ? AND c.profile_id = ?
                AND c.created_at >= ? AND c.created_at < ? AND c.deleted = 0
              GROUP BY c.id, c.content, c.created_at, c.is_spoiler, c.content_type, c.content_id
              HAVING reactions > 0 OR replies > 0
              ORDER BY CASE WHEN COUNT(DISTINCT reaction.id) >= COUNT(DISTINCT reply.id)
                            THEN COUNT(DISTINCT reaction.id) ELSE COUNT(DISTINCT reply.id) END DESC,
                       c.created_at DESC, c.id DESC
              LIMIT 1`
        }, [from, to, from, to, String(userId), userType, profileId, from, to]);
        winner = highlights[0] || null;
    } catch {
        // The optional citation must never discard the already-computed counters.
        winner = null;
    }
    return {
        commentsPosted: rows.reduce((sum, row) => sum + count(row.comments_posted), 0),
        repliesPosted: rows.reduce((sum, row) => sum + count(row.replies_posted), 0),
        discussedTitles: titles.length,
        calendarTimezone: 'UTC',
        topTitles: titles.slice(0, 3).map(row => ({
            type: row.content_type,
            tmdbId: Number(row.content_id),
            contributions: count(row.contributions),
        })),
        highlight: winner && MEDIA_TYPES.has(winner.content_type) && /^\d+$/.test(String(winner.content_id)) && Number.isSafeInteger(Number(winner.content_id)) && Number(winner.content_id) > 0
            ? {
                id: Number(winner.id), content: winner.content, createdAt: Number(winner.created_at), isSpoiler: Boolean(winner.is_spoiler),
                reactions: count(winner.reactions), replies: count(winner.replies), reason: count(winner.reactions) >= count(winner.replies) ? 'reactions' : 'replies',
                type: winner.content_type, tmdbId: Number(winner.content_id)
            }
            : null,
    };
}

module.exports = { fetchWrappedCommunity };
