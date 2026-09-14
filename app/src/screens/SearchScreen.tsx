import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import PosterGrid from '../components/PosterGrid';
import { searchMulti, type TmdbListItem } from '../services/tmdb';
import { CONFIG } from '../config';
import type { RootStackParamList } from '../navigation/types';

const DEBOUNCE_MS = 400;

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TmdbListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query.trim() || !CONFIG.TMDB_API_KEY) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const items = await searchMulti(query);
        setResults(items);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const openDetail = useCallback(
    (item: TmdbListItem) => {
      navigation.navigate('Detail', { id: item.id, mediaType: item.media_type });
    },
    [navigation],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TextInput
        style={styles.input}
        placeholder="Rechercher un film, une serie..."
        placeholderTextColor="#666666"
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        returnKeyType="search"
      />
      {loading && <ActivityIndicator style={{ marginTop: 16 }} color="#8b5cf6" />}
      <PosterGrid
        items={results}
        onPressItem={openDetail}
        emptyText={!loading && query.trim().length > 0 ? `Aucun resultat pour "${query}"` : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  input: {
    margin: 16,
    marginBottom: 8,
    backgroundColor: '#151515',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1f1f1f',
    color: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
});
