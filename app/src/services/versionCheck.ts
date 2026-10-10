import { UPDATE_CHECK } from '../config';
import { Platform } from 'react-native';
import { areAppUpdatesEnabled } from '../config/appUpdates';
import { getLocalVersionCode } from './apkInstaller';

export type ReleaseNotes = {
  fr: string;
  en: string;
};

export type Manifest = {
  version: string;
  buildNumber: number;
  apkUrl: string;
  apkSizeBytes: number;
  apkSha256: string;
  mandatory: boolean;
  releasedAt: string;
  releaseNotes: ReleaseNotes;
};

export type VersionCheckResult =
  | { kind: 'update-available'; remote: Manifest }
  | { kind: 'up-to-date' }
  | { kind: 'no-check' };

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    });
  } finally {
    clearTimeout(timer);
  }
}

function isValidReleaseNotes(obj: unknown): obj is ReleaseNotes {
  if (typeof obj !== 'object' || obj === null) return false;
  const r = obj as Record<string, unknown>;
  return typeof r.fr === 'string' && typeof r.en === 'string';
}

function isValidManifest(obj: unknown): obj is Manifest {
  if (typeof obj !== 'object' || obj === null) return false;
  const m = obj as Record<string, unknown>;
  return (
    typeof m.version === 'string' &&
    typeof m.buildNumber === 'number' &&
    Number.isInteger(m.buildNumber) &&
    typeof m.apkUrl === 'string' &&
    m.apkUrl.startsWith('https://') &&
    typeof m.apkSizeBytes === 'number' &&
    Number.isInteger(m.apkSizeBytes) &&
    m.apkSizeBytes > 0 &&
    typeof m.apkSha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(m.apkSha256) &&
    typeof m.mandatory === 'boolean' &&
    typeof m.releasedAt === 'string' &&
    isValidReleaseNotes(m.releaseNotes)
  );
}

export async function fetchLatestVersion(
  githubUrl: string,
): Promise<VersionCheckResult> {
  if (!areAppUpdatesEnabled(Platform.OS)) return { kind: 'no-check' };
  let manifest: Manifest;
  try {
    const manifestUrl = `${githubUrl}${UPDATE_CHECK.GITHUB_VERSION_RAW_PATH}?_=${Date.now()}`;
    const res = await fetchWithTimeout(manifestUrl, UPDATE_CHECK.TIMEOUT_MS);
    if (!res.ok) {
      console.warn('[versionCheck] manifest status', res.status);
      return { kind: 'no-check' };
    }
    const json: unknown = await res.json();
    if (!isValidManifest(json)) {
      console.warn('[versionCheck] manifest invalid', json);
      return { kind: 'no-check' };
    }
    manifest = json;
  } catch (err) {
    console.warn('[versionCheck] fetch error', err);
    return { kind: 'no-check' };
  }

  let localCode: number;
  try {
    localCode = await getLocalVersionCode();
  } catch (err) {
    console.warn('[versionCheck] getLocalVersionCode failed', err);
    return { kind: 'no-check' };
  }

  if (manifest.buildNumber > localCode) {
    return { kind: 'update-available', remote: manifest };
  }
  return { kind: 'up-to-date' };
}
