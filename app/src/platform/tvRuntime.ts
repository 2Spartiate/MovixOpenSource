import { Platform } from 'react-native';

import { resolveAndroidTvRuntime } from './tvRuntimePolicy';

/**
 * Android/Google TV source of truth.
 *
 * React Native 0.75 exposes Platform.isTV from the native Android uiMode.
 * Keep this wrapper free of screen-size and user-agent heuristics.
 */
export function isAndroidTvRuntime(): boolean {
  return resolveAndroidTvRuntime(Platform.OS, Platform.isTV);
}
