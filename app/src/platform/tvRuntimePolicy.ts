export function resolveAndroidTvRuntime(
  os: string,
  platformIsTV: boolean,
  uiMode?: string | null,
): boolean {
  if (os !== 'android') return false;
  if (platformIsTV === true) return true;
  return String(uiMode || '').toLowerCase() === 'tv';
}
