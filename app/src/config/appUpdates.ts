/**
 * Bundled variant policy, independent of address discovery and remote manifests.
 * Android APKs for this custom variant are distributed outside the application.
 * Enabling updates requires an explicit source change in both JS and Android.
 */
export const APP_UPDATE_POLICY = Object.freeze({
  android: false,
  ios: true,
});

export function areAppUpdatesEnabled(platform: string): boolean {
  if (platform === 'android') return APP_UPDATE_POLICY.android;
  if (platform === 'ios') return APP_UPDATE_POLICY.ios;
  return false;
}
