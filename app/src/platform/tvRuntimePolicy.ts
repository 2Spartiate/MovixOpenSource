// Diagnostic gate: keep TV detection available while disabling only the
// TV-specific product behavior. Handheld behavior is unaffected.
export const TV_PRODUCT_FEATURES_ENABLED = false;

export function resolveAndroidTvRuntime(
  os: string,
  platformIsTV: boolean,
): boolean {
  return os === 'android' && platformIsTV === true;
}
