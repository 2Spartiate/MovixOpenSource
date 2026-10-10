import AsyncStorage from '@react-native-async-storage/async-storage';
import { UPDATE_CHECK } from '../config';
import { cancelDownload } from './updateDownloader';

/** Cancel only the legacy updater's recorded download and discard its state. */
export async function clearObsoleteAppUpdate(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(UPDATE_CHECK.PENDING_DOWNLOAD_KEY);
    if (raw === null) return;
    try {
      const pending: unknown = JSON.parse(raw);
      if (typeof pending === 'object' && pending !== null) {
        const id = (pending as { downloadId?: unknown }).downloadId;
        if (typeof id === 'number' && Number.isSafeInteger(id) && id > 0) {
          // Cancellation remains available even when new APK downloads are disabled.
          await cancelDownload(id);
        }
      }
    } catch (err) {
      console.warn('[appUpdates] obsolete download cancellation skipped', err);
    } finally {
      await AsyncStorage.removeItem(UPDATE_CHECK.PENDING_DOWNLOAD_KEY);
    }
  } catch (err) {
    console.warn('[appUpdates] obsolete update cleanup failed', err);
  }
}
