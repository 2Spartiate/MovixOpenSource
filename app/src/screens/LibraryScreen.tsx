import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import { useAddress } from '../context/AddressContext';
import { CONFIG } from '../config';
import PosterGrid from '../components/PosterGrid';
import {
  getContinueWatching,
  getFavorites,
  getWatched,
  getWatchlist,
  type ContinueWatchingData,
  type WatchItem,
} from '../services/library';
import { pullSync } from '../services/librarySync';
import type { TmdbListItem } from '../services/tmdb';
import type { RootStackParamList } from '../navigation/types';

type Tab = 'continue' | 'favorites' | 'watchlist' | 'watched';

const TABS: { key: Tab; label: string }[] = [
  { key: 'continue', label: 'En cours' },
  { key: 'favorites', label: 'Favoris' },
  { key: 'watchlist', label: 'Watchlist' },
  { key: 'watched', label: 'Vus' },
];

function toListItem(item: WatchItem): TmdbListItem {
  return {
    id: item.id,
    media_type: item.type,
    title: item.title,
    overview: '',
    poster_path: item.poster_path,
    backdrop_path: null,
    vote_average: 0,
  };
}

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { session, logout } = useAuth();
  const { activeProfile } = useProfile();
  const { config } = useAddress();
  const [tab, setTab] = useState<Tab>('continue');
  const [items, setItems] = useState<TmdbListItem[]>([]);
  const [continueData, setContinueData] = useState<ContinueWatchingData>({ movies: [], tv: [] });
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const loadTab = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'continue') {
        setContinueData(await getContinueWatching());
      } else if (tab === 'favorites') {
        const [movies, tv] = await Promise.all([getFavorites('movie'), getFavorites('tv')]);
        setItems([...movies, ...tv].map(toListItem));
      } else if (tab === 'watchlist') {
        const [movies, tv] = await Promise.all([getWatchlist('movie'), getWatchlist('tv')]);
        setItems([...movies, ...tv].map(toListItem));
      } else {
        const [movies, tv] = await Promise.all([getWatched('movie'), getWatched('tv')]);
        setItems([...movies, ...tv].map(toListItem));
      }
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    loadTab();
  }, [loadTab]);

  useEffect(() => {
    if (!session || !activeProfile || !config) return;
    setSyncing(true);
    pullSync(config.primaryUrl, session.token, activeProfile.id)
      .then(loadTab)
      .catch(() => {})
      .finally(() => setSyncing(false));
    // Uniquement au login/changement de profil — pas a chaque changement d'onglet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, activeProfile, config]);

  const openDetail = useCallback(
    (item: TmdbListItem) => navigation.navigate('Detail', { id: item.id, mediaType: item.media_type }),
    [navigation],
  );

  if (!session) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.emptyTitle}>Connecte-toi</Text>
        <Text style={styles.emptyText}>Retrouve tes favoris, ta watchlist et ta progression sur tous tes appareils.</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('Login')}>
          <Text style={styles.primaryButtonText}>Se connecter</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkButton} onPress={() => navigation.navigate('CreateAccount')}>
          <Text style={styles.linkText}>Creer un compte</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const continueItems = [...continueData.movies, ...continueData.tv].map(toListItem);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate('ProfileSelect')} style={styles.profileRow}>
          {activeProfile && (
            <Image
              source={{ uri: `${config?.primaryUrl ?? CONFIG.SITE_URL}${activeProfile.avatar}` }}
              style={styles.avatar}
            />
          )}
          <Text style={styles.profileName}>{activeProfile?.name ?? 'Profil'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={logout}>
          <Text style={styles.logout}>Deconnexion</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabRow}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} style={[styles.tab, tab === t.key && styles.tabActive]} onPress={() => setTab(t.key)}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading || syncing ? (
        <ActivityIndicator style={{ marginTop: 24 }} color="#8b5cf6" />
      ) : (
        <PosterGrid
          items={tab === 'continue' ? continueItems : items}
          onPressItem={openDetail}
          emptyText="Rien ici pour l'instant."
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyText: {
    color: '#888888',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: '#8b5cf6',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  linkButton: {
    marginTop: 14,
  },
  linkText: {
    color: '#8b5cf6',
    fontSize: 13,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#151515',
    marginRight: 8,
  },
  profileName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  logout: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '600',
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: '#1f1f1f',
  },
  tabActive: {
    backgroundColor: '#8b5cf6',
    borderColor: '#8b5cf6',
  },
  tabText: {
    color: '#888888',
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#ffffff',
  },
});
