import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ScreenHeader from '../components/ScreenHeader';
import PosterGrid from '../components/PosterGrid';
import { useTmdbPaginatedList } from '../hooks/useTmdbPaginatedList';
import { discoverPaged, getGenreList, type MediaType, type TmdbGenre, type TmdbListItem } from '../services/tmdb';
import type { RootStackParamList } from '../navigation/types';

const MEDIA_TYPE: MediaType = 'movie';

export default function MoviesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [genres, setGenres] = useState<TmdbGenre[]>([]);

  useEffect(() => {
    getGenreList(MEDIA_TYPE).then(setGenres).catch(() => setGenres([]));
  }, []);

  const fetchPage = useCallback((page: number) => discoverPaged(MEDIA_TYPE, 'popularity.desc', page), []);
  const { items, loadingMore, loadMore, error } = useTmdbPaginatedList(fetchPage);

  const openDetail = useCallback(
    (item: TmdbListItem) => navigation.navigate('Detail', { id: item.id, mediaType: MEDIA_TYPE }),
    [navigation],
  );

  const header = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.genreRow} contentContainerStyle={styles.genreRowContent}>
      {genres.map(genre => (
        <TouchableOpacity
          key={genre.id}
          style={styles.genreChip}
          onPress={() => navigation.navigate('Genre', { mediaType: MEDIA_TYPE, genreId: genre.id, genreName: genre.name })}>
          <Text style={styles.genreChipText}>{genre.name}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader title="Films" />
      <PosterGrid
        items={items}
        onPressItem={openDetail}
        onEndReached={loadMore}
        loadingMore={loadingMore}
        emptyText={error ?? undefined}
        ListHeaderComponent={header}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  genreRow: {
    marginBottom: 16,
  },
  genreRowContent: {
    paddingHorizontal: 4,
    gap: 8,
  },
  genreChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: '#1f1f1f',
    marginRight: 8,
  },
  genreChipText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
});
