import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ScreenHeader from '../components/ScreenHeader';
import PosterGrid from '../components/PosterGrid';
import { useTmdbPaginatedList } from '../hooks/useTmdbPaginatedList';
import { discoverGenre, type MediaType, type SortBy, type TmdbListItem } from '../services/tmdb';
import type { RootStackParamList } from '../navigation/types';

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'popularity.desc', label: 'Popularite' },
  { value: 'vote_average.desc', label: 'Note' },
  { value: 'release_date.desc', label: 'Recents' },
];

export default function GenreScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Genre'>>();
  const { mediaType, genreId, genreName } = route.params;
  const [sortBy, setSortBy] = useState<SortBy>('popularity.desc');

  const fetchPage = useCallback(
    (page: number) => discoverGenre(mediaType, genreId, { sortBy, page }),
    [mediaType, genreId, sortBy],
  );
  const { items, loadingMore, loadMore, error } = useTmdbPaginatedList(fetchPage);

  const openDetail = useCallback(
    (item: TmdbListItem) => {
      navigation.navigate('Detail', { id: item.id, mediaType: item.media_type as MediaType });
    },
    [navigation],
  );

  const sortPicker = useMemo(
    () => (
      <View style={styles.sortRow}>
        {SORT_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.sortChip, sortBy === opt.value && styles.sortChipActive]}
            onPress={() => setSortBy(opt.value)}>
            <Text style={[styles.sortChipText, sortBy === opt.value && styles.sortChipTextActive]}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    ),
    [sortBy],
  );

  return (
    <View style={styles.container}>
      <ScreenHeader title={genreName} />
      <PosterGrid
        items={items}
        onPressItem={openDetail}
        onEndReached={loadMore}
        loadingMore={loadingMore}
        emptyText={error ?? undefined}
        ListHeaderComponent={sortPicker}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  sortRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 4,
    paddingBottom: 16,
  },
  sortChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: '#1f1f1f',
  },
  sortChipActive: {
    backgroundColor: '#8b5cf6',
    borderColor: '#8b5cf6',
  },
  sortChipText: {
    color: '#888888',
    fontSize: 13,
    fontWeight: '600',
  },
  sortChipTextActive: {
    color: '#ffffff',
  },
});
