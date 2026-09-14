import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ScreenHeader from '../components/ScreenHeader';
import PosterGrid from '../components/PosterGrid';
import { backdropUrl, getCollection, type TmdbCollection, type TmdbListItem } from '../services/tmdb';
import type { RootStackParamList } from '../navigation/types';

export default function CollectionScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Collection'>>();
  const [collection, setCollection] = useState<TmdbCollection | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getCollection(route.params.id)
      .then(c => {
        if (!cancelled) setCollection(c);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [route.params.id]);

  const openDetail = useCallback(
    (item: TmdbListItem) => navigation.navigate('Detail', { id: item.id, mediaType: 'movie' }),
    [navigation],
  );

  const backdrop = collection ? backdropUrl(collection.backdrop_path) : null;

  const header = (
    <View style={styles.header}>
      {backdrop && <Image source={{ uri: backdrop }} style={styles.backdrop} />}
      {!!collection?.overview && <Text style={styles.overview}>{collection.overview}</Text>}
      <Text style={styles.sectionTitle}>Films de la saga</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader title={route.params.name} />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color="#8b5cf6" />
      ) : (
        <PosterGrid items={collection?.parts ?? []} onPressItem={openDetail} ListHeaderComponent={header} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  backdrop: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    backgroundColor: '#151515',
    marginBottom: 12,
  },
  overview: {
    color: '#cccccc',
    fontSize: 13,
    lineHeight: 19,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 16,
  },
});
