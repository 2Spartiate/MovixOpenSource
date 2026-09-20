import axios from 'axios';

const API_URL = import.meta.env.VITE_MAIN_API;

function getAuthToken(): string | null {
  return localStorage.getItem('auth_token');
}

export function decodeDownloadLink<T>(
  id: string,
  turnstileToken: string,
  titleId: string | null,
  signal: AbortSignal,
) {
  const authToken = getAuthToken();
  return axios.post<T>(
    `${API_URL}/api/darkiworld/decode/${encodeURIComponent(id)}`,
    { turnstileToken },
    {
      params: titleId ? { title_id: titleId } : undefined,
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
      signal,
      validateStatus: () => true,
    },
  );
}

export interface AdminDownloadLink {
  url: string;
  language: string;
  quality: string;
  sub: boolean;
  host: string;
  size: string;
  full_saison?: boolean;
  added_at?: string;
  added_by?: { id: string; auth_type: 'oauth' | 'bip-39' };
}

export interface DownloadLinkInput {
  url: string;
  language: string;
  quality: string;
  sub?: boolean;
  host: string;
  size?: string;
}

interface BaseParams {
  type: 'movie' | 'tv';
  id: string;
  season?: number;
  episode?: number;
  fullSeason?: boolean;
}

function authHeader() {
  return {
    Authorization: `Bearer ${getAuthToken()}`,
    'Content-Type': 'application/json',
  };
}

export async function listDownloadLinks(params: BaseParams): Promise<AdminDownloadLink[]> {
  let query = '';
  if (params.type === 'tv') {
    const parts: string[] = [];
    if (params.season !== undefined) parts.push(`season=${params.season}`);
    if (params.episode !== undefined) parts.push(`episode=${params.episode}`);
    if (params.fullSeason) parts.push('fullSeason=true');
    if (parts.length > 0) query = `?${parts.join('&')}`;
  }
  const res = await axios.get(
    `${API_URL}/api/admin/download-links/${params.type}/${params.id}${query}`,
    { headers: authHeader() }
  );
  return res.data.links || [];
}

export async function addDownloadLinks(
  params: BaseParams & { links: DownloadLinkInput[] }
): Promise<{ addedCount: number; totalCount: number }> {
  const res = await axios.post(
    `${API_URL}/api/admin/download-links`,
    params,
    { headers: authHeader() }
  );
  return res.data;
}

export async function deleteDownloadLink(
  params: BaseParams & { url: string }
): Promise<void> {
  await axios.delete(
    `${API_URL}/api/admin/download-links`,
    { headers: authHeader(), data: params }
  );
}

export async function updateDownloadLink(
  params: BaseParams & { oldUrl: string; newLink: Partial<DownloadLinkInput> & { url: string } }
): Promise<void> {
  await axios.put(
    `${API_URL}/api/admin/download-links`,
    params,
    { headers: authHeader() }
  );
}

export interface LeaderboardEntry {
  admin_id: string;
  admin_auth_type: 'oauth' | 'bip-39';
  role: string;
  username: string;
  avatar: string | null;
  score: number;
  last_action_at: string;
}

export async function fetchDownloadLeaderboard(
  params: { scope: 'month'; month: string } | { scope: 'all-time' }
): Promise<{ leaderboard: LeaderboardEntry[]; month?: string; scope?: string }> {
  const query = params.scope === 'month'
    ? `?month=${params.month}`
    : `?scope=all-time`;
  const res = await axios.get(
    `${API_URL}/api/download-links/admin/leaderboard${query}`,
    { headers: authHeader() }
  );
  return res.data;
}
