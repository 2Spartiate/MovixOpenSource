import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ScreenHeader from '../components/ScreenHeader';
import PosterGrid from '../components/PosterGrid';
import { useTmdbPaginatedList } from '../hooks/useTmdbPaginatedList';
import { discoverAnime, type TmdbListItem } from '../services/tmdb';
import type { RootStackParamList } from '../navigation/types';

export default function AnimeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const fetchPage = useCallback((page: number) => discoverAnime('popularity.desc', page), []);
  const { items, loadingMore, loadMore, error } = useTmdbPaginatedList(fetchPage);

  const openDetail = useCallback(
    (item: TmdbListItem) => navigation.navigate('Detail', { id: item.id, mediaType: 'tv' }),
    [navigation],
  );

  return (
    <View style={styles.container}>
      <ScreenHeader title="Anime" />
      <PosterGrid items={items} onPressItem={openDetail} onEndReached={loadMore} loadingMore={loadingMore} emptyText={error ?? undefined} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
});
