import { MAIN_API } from '@/config/runtime';
import { getVipHeaders } from '@/utils/vipUtils';
import { isDebridProvider } from '@/utils/debridProviders';
import type { DebridProvider, DebridResult } from '@/types/debrid';

export async function getDebridProviders(signal?: AbortSignal): Promise<DebridProvider[]> {
  const response = await fetch(`${MAIN_API}/api/media/debrid/providers`, {
    headers: getVipHeaders(),
    cache: 'no-store',
    signal,
  });
  const payload = await response.json();
  if (!response.ok || payload?.status !== 'success' || !Array.isArray(payload.providers)) {
    throw new Error('debrid.providersLoadFailed');
  }
  return [...new Set<DebridProvider>(payload.providers.filter(isDebridProvider))];
}

export async function unlockDebridLink(link: string, provider: DebridProvider): Promise<DebridResult> {
  const response = await fetch(`${MAIN_API}/api/media/debrid/unlock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getVipHeaders() },
    body: JSON.stringify({ link, provider }),
  });
  const payload = await response.json().catch(() => null);
  const data = payload?.data;
  if (!response.ok || payload?.status !== 'success' || typeof data?.link !== 'string' || !data.link.trim()) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : '');
  }
  return {
    link: data.link.trim(),
    filename: typeof data.filename === 'string' ? data.filename : '',
    filesize: typeof data.filesize === 'number' && Number.isFinite(data.filesize) ? data.filesize : 0,
    host: typeof data.host === 'string' ? data.host : '',
    provider,
  };
}
