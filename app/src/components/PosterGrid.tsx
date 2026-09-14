import React from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View, type ListRenderItem } from 'react-native';
import PosterCard from './PosterCard';
import type { TmdbListItem } from '../services/tmdb';

interface PosterGridProps {
  items: TmdbListItem[];
  onPressItem: (item: TmdbListItem) => void;
  onEndReached?: () => void;
  loadingMore?: boolean;
  emptyText?: string;
  ListHeaderComponent?: React.ComponentProps<typeof FlatList>['ListHeaderComponent'];
}

// Grille partagee par tous les ecrans catalogue (Movies/TVShows/Anime/Genre/
// Top10/Person/Collection) pour ne pas dupliquer la pagination infinie et le
// rendu grille cinq fois.
export default function PosterGrid({
  items,
  onPressItem,
  onEndReached,
  loadingMore,
  emptyText,
  ListHeaderComponent,
}: PosterGridProps) {
  const renderItem: ListRenderItem<TmdbListItem> = ({ item }) => (
    <PosterCard item={item} onPress={onPressItem} width={110} />
  );

  return (
    <FlatList
      data={items}
      numColumns={3}
      keyExtractor={item => `${item.media_type}-${item.id}`}
      renderItem={renderItem}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      contentContainerStyle={styles.grid}
      columnWrapperStyle={styles.row}
      ListHeaderComponent={ListHeaderComponent}
      ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footer} color="#8b5cf6" /> : null}
      ListEmptyComponent={emptyText ? <Text style={styles.emptyText}>{emptyText}</Text> : null}
    />
  );
}

const styles = StyleSheet.create({
  grid: {
    paddingHorizontal: 12,
    paddingBottom: 24,
  },
  row: {
    justifyContent: 'flex-start',
    gap: 8,
  },
  footer: {
    marginVertical: 16,
  },
  emptyText: {
    color: '#888888',
    textAlign: 'center',
    marginTop: 32,
  },
});
