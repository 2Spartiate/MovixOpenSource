export function resolveAndroidTvRuntime(
  os: string,
  platformIsTV: boolean,
): boolean {
  return os === 'android' && platformIsTV === true;
}
