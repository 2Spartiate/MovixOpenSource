import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ScreenHeader from '../components/ScreenHeader';
import PosterGrid from '../components/PosterGrid';
import { CONFIG } from '../config';
import { getTop10, type Top10Kind, type Top10Period } from '../services/top10';
import type { TmdbListItem } from '../services/tmdb';
import type { RootStackParamList } from '../navigation/types';

const KIND_OPTIONS: { value: Top10Kind; label: string }[] = [
  { value: 'movies', label: 'Films' },
  { value: 'tv', label: 'Series' },
  { value: 'anime', label: 'Anime' },
];

const PERIOD_OPTIONS: { value: Top10Period; label: string }[] = [
  { value: 'day', label: 'Jour' },
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
  { value: 'all', label: 'Toujours' },
];

export default function Top10Screen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [kind, setKind] = useState<Top10Kind>('movies');
  const [period, setPeriod] = useState<Top10Period>('week');
  const [items, setItems] = useState<TmdbListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getTop10(CONFIG.API_BASE_URL, kind, period)
      .then(results => {
        if (!cancelled) setItems(results);
      })
      .catch(err => {
        if (!cancelled) setError(err?.message ?? 'Erreur de chargement');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, period]);

  const openDetail = useCallback(
    (item: TmdbListItem) => navigation.navigate('Detail', { id: item.id, mediaType: item.media_type }),
    [navigation],
  );

  const header = (
    <View style={styles.pickers}>
      <View style={styles.pickerRow}>
        {KIND_OPTIONS.map(opt => (
          <TouchableOpacity key={opt.value} style={[styles.chip, kind === opt.value && styles.chipActive]} onPress={() => setKind(opt.value)}>
            <Text style={[styles.chipText, kind === opt.value && styles.chipTextActive]}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerRow} style={{ marginTop: 8 }}>
        {PERIOD_OPTIONS.map(opt => (
          <TouchableOpacity key={opt.value} style={[styles.chip, period === opt.value && styles.chipActive]} onPress={() => setPeriod(opt.value)}>
            <Text style={[styles.chipText, period === opt.value && styles.chipTextActive]}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader title="Top 10" />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color="#8b5cf6" />
      ) : (
        <PosterGrid items={items} onPressItem={openDetail} emptyText={error ?? 'Aucune donnee pour le moment.'} ListHeaderComponent={header} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  pickers: {
    paddingHorizontal: 4,
    marginBottom: 16,
  },
  pickerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: '#1f1f1f',
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: '#8b5cf6',
    borderColor: '#8b5cf6',
  },
  chipText: {
    color: '#888888',
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#ffffff',
  },
});
