// Mirror de API/Mainapi/routes/profiles.js (mount /api/profiles), JWT bearer.

export interface Profile {
  id: string;
  name: string;
  avatar: string;
  ageRestriction: 0 | 7 | 12 | 16 | 18;
  createdAt: string;
  isDefault?: boolean;
}

async function request<T>(apiBase: string, token: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase}/api/profiles${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
  const data = await response.json();
  if (!response.ok || data?.success === false) {
    throw new Error(data?.error ?? `Requete profiles${path} a repondu ${response.status}`);
  }
  return data as T;
}

export async function listProfiles(apiBase: string, token: string): Promise<Profile[]> {
  const data = await request<{ profiles: Profile[] }>(apiBase, token, '/');
  return data.profiles;
}

export async function createProfile(
  apiBase: string,
  token: string,
  params: { name: string; avatar: string; ageRestriction?: number },
): Promise<Profile> {
  const data = await request<{ profile: Profile }>(apiBase, token, '/', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return data.profile;
}

export async function updateProfile(
  apiBase: string,
  token: string,
  profileId: string,
  params: { name?: string; avatar?: string; ageRestriction?: number },
): Promise<Profile> {
  const data = await request<{ profile: Profile }>(apiBase, token, `/${profileId}`, {
    method: 'PUT',
    body: JSON.stringify(params),
  });
  return data.profile;
}

export async function deleteProfile(apiBase: string, token: string, profileId: string): Promise<Profile | null> {
  const data = await request<{ newDefaultProfile: Profile | null }>(apiBase, token, `/${profileId}`, {
    method: 'DELETE',
  });
  return data.newDefaultProfile;
}

export async function getProfileData(apiBase: string, token: string, profileId: string): Promise<Record<string, string>> {
  const data = await request<{ data: Record<string, string> }>(apiBase, token, `/${profileId}/data`);
  return data.data;
}

export async function migrateProfiles(apiBase: string, token: string): Promise<void> {
  await request(apiBase, token, '/migrate', { method: 'POST' });
}
