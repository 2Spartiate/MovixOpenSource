import { Platform } from 'react-native';

import { resolveAndroidTvRuntime } from './tvRuntimePolicy';

/**
 * Android/Google TV source of truth.
 *
 * React Native 0.75 exposes Platform.isTV from the native Android uiMode.
 * Keep this wrapper free of screen-size and user-agent heuristics.
 */
export function isAndroidTvRuntime(): boolean {
  const uiMode =
    Platform.OS === 'android'
      ? String((Platform.constants as { uiMode?: unknown } | undefined)?.uiMode ?? '')
      : '';

  return resolveAndroidTvRuntime(Platform.OS, Platform.isTV, uiMode);
}
