import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import PosterCard from '../components/PosterCard';
import { discover, getTrending, type MediaType, type TmdbListItem } from '../services/tmdb';
import { CONFIG } from '../config';
import type { RootStackParamList } from '../navigation/types';

interface Rail {
  title: string;
  items: TmdbListItem[];
  seeAll?: keyof RootStackParamList;
}

const CATEGORY_LINKS: { label: string; route: keyof RootStackParamList }[] = [
  { label: 'Films', route: 'Movies' },
  { label: 'Series', route: 'TVShows' },
  { label: 'Anime', route: 'Anime' },
  { label: 'Top 10', route: 'Top10' },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [rails, setRails] = useState<Rail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!CONFIG.TMDB_API_KEY) {
      setError('Cle TMDB non configuree.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [trending, movies, tv] = await Promise.all([
          getTrending('all'),
          discover('movie'),
          discover('tv'),
        ]);
        if (cancelled) return;
        setRails([
          { title: 'Tendances', items: trending },
          { title: 'Films populaires', items: movies, seeAll: 'Movies' },
          { title: 'Series populaires', items: tv, seeAll: 'TVShows' },
        ]);
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? 'Erreur de chargement');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openDetail = (mediaType: MediaType) => (item: TmdbListItem) => {
    navigation.navigate('Detail', { id: item.id, mediaType: item.media_type ?? mediaType });
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#8b5cf6" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 32 }}>
      <Text style={styles.header}>Movix</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
        {CATEGORY_LINKS.map(cat => (
          <TouchableOpacity key={cat.route} style={styles.categoryChip} onPress={() => navigation.navigate(cat.route as any)}>
            <Text style={styles.categoryChipText}>{cat.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {rails.map(rail => (
        <View key={rail.title} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{rail.title}</Text>
            {rail.seeAll && (
              <TouchableOpacity onPress={() => navigation.navigate(rail.seeAll as any)}>
                <Text style={styles.seeAll}>Voir tout</Text>
              </TouchableOpacity>
            )}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.railContent}>
            {rail.items.map(item => (
              <PosterCard key={`${item.media_type}-${item.id}`} item={item} onPress={openDetail(item.media_type)} />
            ))}
          </ScrollView>
        </View>
      ))}
    </ScrollView>
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
  },
  header: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '700',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  categoryRow: {
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 24,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: '#1f1f1f',
    marginRight: 8,
  },
  categoryChipText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  seeAll: {
    color: '#8b5cf6',
    fontSize: 13,
    fontWeight: '600',
  },
  railContent: {
    paddingHorizontal: 16,
  },
  errorText: {
    color: '#888888',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
