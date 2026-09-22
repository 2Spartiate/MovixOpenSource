import React, { useEffect, useState } from 'react';
import {
  AppState,
  StatusBar,
  Alert,
  NativeModules,
  Platform,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import BrowserScreen from './screens/BrowserScreen';
import UpdateScreen from './screens/UpdateScreen';
import UpdateDialog from './components/UpdateDialog';
import { useAppUpdate } from './hooks/useAppUpdate';
import { AddressProvider, useAddress } from './context/AddressContext';
import { loadNetworkJournalPreference } from './services/networkJournal';
import { isAndroidTvRuntime } from './platform/tvRuntime';

const { DnsModule } = NativeModules;

const TV_DNS_READY_TIMEOUT_MS = 5000;
const TV_DNS_STOP_TIMEOUT_MS = 3000;
const TV_DNS_READY_POLL_MS = 100;
const TV_DNS_POST_READY_GRACE_MS = 500;

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

async function waitForTvDnsState(expected: boolean, timeoutMs: number): Promise<boolean> {
  if (Platform.OS !== 'android' || !DnsModule || !isAndroidTvRuntime()) {
    return false;
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await DnsModule.isEnabled()) === expected) {
        return true;
      }
    } catch {}
    await delay(TV_DNS_READY_POLL_MS);
  }
  return false;
}

async function restartTvDnsFromCleanState(): Promise<boolean> {
  if (Platform.OS !== 'android' || !DnsModule || !isAndroidTvRuntime()) {
    return false;
  }

  try {
    // DnsVpnService is START_STICKY and can outlive/restart independently from
    // the React activity. Do not trust the static isActive flag across TV task
    // kills: always rebuild the tunnel from a known clean state.
    await DnsModule.disable();
  } catch {}

  await waitForTvDnsState(false, TV_DNS_STOP_TIMEOUT_MS);
  await delay(TV_DNS_READY_POLL_MS);

  try {
    await DnsModule.enable('1.1.1.1', '1.0.0.1');
  } catch {
    return false;
  }

  const ready = await waitForTvDnsState(true, TV_DNS_READY_TIMEOUT_MS);
  if (!ready) return false;

  // isActive is published immediately before startDnsForwarding(). A slower TV
  // needs a short grace period before the first WebView DNS lookup.
  await delay(TV_DNS_POST_READY_GRACE_MS);
  return true;
}

function promptDnsForTv(): Promise<void> {
  return new Promise(resolve => {
    Alert.alert(
      'DNS Cloudflare 1.1.1.1',
      'Activer le DNS Cloudflare pour une navigation plus rapide et sécurisée ?\n\n(Recommandé)',
      [
        {
          text: 'Non merci',
          style: 'cancel',
          onPress: async () => {
            await AsyncStorage.setItem('dns_enabled', 'false');
            resolve();
          },
        },
        {
          text: 'Activer',
          style: 'default',
          onPress: async () => {
            try {
              if (!DnsModule) {
                await AsyncStorage.setItem('dns_enabled', 'false');
                return;
              }

              // First obtain Android's VPN consent. Once granted, immediately
              // recreate the TV tunnel from a clean state. This intentionally
              // mirrors the only lifecycle that proved healthy on hardware:
              // permission/setup -> process restart -> fresh VPN start.
              await DnsModule.enable('1.1.1.1', '1.0.0.1');
              await waitForTvDnsState(true, TV_DNS_READY_TIMEOUT_MS);
              const ready = await restartTvDnsFromCleanState();
              await AsyncStorage.setItem('dns_enabled', ready ? 'true' : 'false');
            } catch {
              await AsyncStorage.setItem('dns_enabled', 'false');
            } finally {
              resolve();
            }
          },
        },
      ],
      { cancelable: false },
    );
  });
}

function promptDns() {
  Alert.alert(
    'DNS Cloudflare 1.1.1.1',
    'Activer le DNS Cloudflare pour une navigation plus rapide et sécurisée ?\n\n(Recommandé)',
    [
      {
        text: 'Non merci',
        style: 'cancel',
        onPress: () => {
          AsyncStorage.setItem('dns_enabled', 'false');
        },
      },
      {
        text: 'Activer',
        style: 'default',
        onPress: async () => {
          try {
            if (!DnsModule) {
              await AsyncStorage.setItem('dns_enabled', 'false');
              return;
            }

            if (Platform.OS === 'ios') {
              const dnsActivated = await DnsModule.enable('1.1.1.1', '1.0.0.1');
              await AsyncStorage.setItem('dns_enabled', dnsActivated ? 'true' : 'false');
              if (!dnsActivated) {
                Alert.alert(
                  'Activation DNS requise',
                  'La configuration est installée. Active-la manuellement dans Réglages > Général > VPN et gestion de l’appareil > DNS.',
                  [{ text: 'Compris' }],
                );
              }
            } else {
              await DnsModule.enable('1.1.1.1', '1.0.0.1');
              await AsyncStorage.setItem('dns_enabled', 'true');
            }
          } catch {
            await AsyncStorage.setItem('dns_enabled', 'false');
          }
        },
      },
    ],
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [dnsSettled, setDnsSettled] = useState(false);

  // Le tampon natif du journal réseau part éteint à chaque démarrage : sans ce
  // rappel au boot, la capture ne reprenait qu'en ouvrant les réglages, et une
  // lecture lancée juste après une mise à jour n'était pas enregistrée — soit
  // exactement le moment où on a besoin d'elle.
  useEffect(() => {
    loadNetworkJournalPreference().catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem('dns_enabled');
        let nativeEnabled = false;
        if (DnsModule) {
          try {
            nativeEnabled = await DnsModule.isEnabled();
          } catch {}
        }

        if (Platform.OS === 'android' && isAndroidTvRuntime()) {
          // TV-only lifecycle. Recreate the DNS tunnel on every launch instead
          // of trusting a sticky service/static flag left by the previous task.
          if (stored === null) {
            await promptDnsForTv();
          } else if (stored === 'true') {
            const ready = await restartTvDnsFromCleanState();
            await AsyncStorage.setItem('dns_enabled', ready ? 'true' : 'false');
          } else {
            // Respect an explicit TV opt-out and stop any sticky service that
            // Android may have resurrected after the task was killed.
            if (nativeEnabled && DnsModule) {
              try {
                await DnsModule.disable();
                await waitForTvDnsState(false, TV_DNS_STOP_TIMEOUT_MS);
              } catch {}
            }
          }
          setDnsSettled(true);
        } else if (nativeEnabled) {
          if (stored !== 'true') {
            await AsyncStorage.setItem('dns_enabled', 'true');
          }
          setDnsSettled(true);
        } else if (stored === 'true' && DnsModule && Platform.OS === 'android') {
          // Original handheld Android behavior.
          DnsModule.enable('1.1.1.1', '1.0.0.1').catch(() => {});
          setDnsSettled(true);
        } else if (stored === 'true') {
          await AsyncStorage.setItem('dns_enabled', 'false');
          setDnsSettled(true);
        } else if (stored === null) {
          // Original phone/tablet behavior: do not block startup on the DNS prompt.
          promptDns();
          setDnsSettled(true);
        } else {
          setDnsSettled(true);
        }
      } finally {
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !DnsModule) return undefined;

    const syncDnsState = async () => {
      try {
        const active = await DnsModule.isEnabled();
        await AsyncStorage.setItem('dns_enabled', active ? 'true' : 'false');
      } catch {}
    };
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        void syncDnsState();
      }
    });
    return () => subscription.remove();
  }, []);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
      <AddressProvider>
        <AppShell dnsSettled={dnsSettled} />
      </AddressProvider>
    </SafeAreaProvider>
  );
}

function AppShell({ dnsSettled }: { dnsSettled: boolean }) {
  const { config } = useAddress();
  const { state, accept, dismiss, cancel, openSettings, retry } = useAppUpdate(
    config?.githubUrl ?? null,
  );

  // No i18n in the mobile app today — FR is the primary language. The JSON
  // manifest still carries both `fr` and `en` release notes for future use.
  const locale: 'fr' | 'en' = 'fr';

  const showScreen =
    state.manifest &&
    (state.stage === 'downloading' ||
      state.stage === 'verifying' ||
      state.stage === 'installing' ||
      state.stage === 'need_permission' ||
      state.stage === 'error');

  if (showScreen && state.manifest) {
    return (
      <UpdateScreen
        manifest={state.manifest}
        stage={state.stage}
        progress={state.progress}
        error={state.error}
        locale={locale}
        onCancel={cancel}
        onOpenSettings={openSettings}
        onRetry={retry}
      />
    );
  }

  return (
    <>
      <BrowserScreen />
      {dnsSettled && state.stage === 'offered' && state.manifest && (
        <UpdateDialog
          manifest={state.manifest}
          locale={locale}
          onLater={dismiss}
          onUpdate={accept}
        />
      )}
    </>
  );
}
