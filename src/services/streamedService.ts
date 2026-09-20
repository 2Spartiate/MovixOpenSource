import { MAIN_API } from '@/config/runtime';
import { fetchFromExtension, isExtensionAvailable } from '@/utils/extensionProxy';
import { getVipHeaders, isUserVip } from '@/utils/vipUtils';
import type { StreamedNativePlayback, StreamedNativeSource, StreamedHandshake } from '@/types/streamed';

const API_BASE = MAIN_API || 'http://localhost:25565';

export async function resolveStreamedNative(channelId: string, source: StreamedNativeSource, signal: AbortSignal): Promise<StreamedNativePlayback> {
  const path = `${encodeURIComponent(channelId)}/${encodeURIComponent(source.key)}`;
  if (isUserVip()) {
    const response = await fetch(`${API_BASE}/api/livetv/streamed/native/${path}`, { headers: getVipHeaders(), signal });
    if (!response.ok) throw new Error(`Streamed HTTP ${response.status}`);
    const result = await response.json();
    return { url: new URL(result.url, API_BASE).href, extension: false };
  }
  if (!isExtensionAvailable()) throw new Error('Extension requise');
  const handshake = await fetchFromExtension<StreamedHandshake>('STREAMED_HANDSHAKE', { url: source.embedUrl });
  signal.throwIfAborted();
  if ('url' in handshake) {
    const url = new URL(handshake.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('URL Streamed invalide');
    return { url: url.href, referer: handshake.referer, extension: true };
  }
  const response = await fetch(`${API_BASE}/api/livetv/streamed/decode/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(handshake), signal,
  });
  if (!response.ok) throw new Error(`Streamed HTTP ${response.status}`);
  const result = await response.json();
  return { url: result.url, referer: result.referer, extension: true };
}
