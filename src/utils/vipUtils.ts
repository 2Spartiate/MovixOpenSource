/**
 * Client-side VIP state helpers.
 *
 * The client owns its local UI state and does not periodically revalidate or
 * revoke it from /api/check-vip. Server-protected endpoints remain authoritative
 * because requests only carry x-access-key when a real access_code exists.
 */

/**
 * Récupère la clé d'accès stockée dans localStorage.
 */
export function getAccessKey(): string | null {
  return localStorage.getItem('access_code') || null;
}

/**
 * Retourne l'état VIP local sans requête réseau ni révocation automatique.
 *
 * Conservé sous forme async pour compatibilité avec les anciens appelants qui
 * attendaient checkVipStatus().
 */
export async function checkVipStatus(_force = false): Promise<boolean> {
  return localStorage.getItem('is_vip') === 'true';
}

/**
 * Révocation explicite uniquement.
 * Cette fonction reste disponible pour les flows de logout / suppression locale,
 * mais n'est plus appelée par une vérification serveur périodique.
 */
export function revokeVipStatus(): void {
  localStorage.removeItem('is_vip');
  localStorage.removeItem('access_code');
  localStorage.removeItem('access_code_expires');

  window.dispatchEvent(new Event('storage'));
  window.dispatchEvent(new CustomEvent('vipStatusChanged', { detail: { vip: false } }));
}

/**
 * État VIP utilisé par le rendu client.
 * Aucun appel réseau n'est déclenché ici.
 */
export function isUserVip(): boolean {
  return localStorage.getItem('is_vip') === 'true';
}

/**
 * Retourne les headers pour les endpoints qui valident eux-mêmes une clé.
 * Aucune clé n'est créée ni modifiée côté client.
 */
export function getVipHeaders(): Record<string, string> {
  const accessKey = getAccessKey();
  if (accessKey) {
    return { 'x-access-key': accessKey };
  }
  return {};
}

/**
 * Compatibilité API : il n'y a désormais plus de vérification périodique côté
 * client, donc le démarrage/arrêt sont volontairement des no-op.
 */
export function startVipVerification(): void {
  // Intentionally disabled: local client state is not server-revalidated.
}

export function stopVipVerification(): void {
  // Intentionally disabled: no interval is created.
}
