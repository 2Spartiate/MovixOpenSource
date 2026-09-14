import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ScreenHeader from '../components/ScreenHeader';
import PosterGrid from '../components/PosterGrid';
import { getPersonCredits, getPersonDetails, posterUrl, type TmdbListItem, type TmdbPerson } from '../services/tmdb';
import type { RootStackParamList } from '../navigation/types';

export default function PersonScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Person'>>();
  const [person, setPerson] = useState<TmdbPerson | null>(null);
  const [credits, setCredits] = useState<TmdbListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getPersonDetails(route.params.id), getPersonCredits(route.params.id)])
      .then(([p, c]) => {
        if (cancelled) return;
        setPerson(p);
        setCredits(c);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [route.params.id]);

  const openDetail = useCallback(
    (item: TmdbListItem) => navigation.navigate('Detail', { id: item.id, mediaType: item.media_type }),
    [navigation],
  );

  const photo = person ? posterUrl(person.profile_path, 'w342') : null;

  const header = (
    <View style={styles.header}>
      {photo && <Image source={{ uri: photo }} style={styles.photo} />}
      <Text style={styles.name}>{person?.name}</Text>
      {!!person?.known_for_department && <Text style={styles.meta}>{person.known_for_department}</Text>}
      {!!person?.biography && (
        <Text numberOfLines={6} style={styles.bio}>
          {person.biography}
        </Text>
      )}
      <Text style={styles.sectionTitle}>Filmographie</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader title={route.params.name} />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color="#8b5cf6" />
      ) : (
        <PosterGrid items={credits} onPressItem={openDetail} ListHeaderComponent={header} />
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
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  photo: {
    width: 120,
    height: 180,
    borderRadius: 12,
    backgroundColor: '#151515',
    marginBottom: 12,
  },
  name: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  meta: {
    color: '#888888',
    fontSize: 13,
    marginTop: 4,
  },
  bio: {
    color: '#cccccc',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 12,
    textAlign: 'center',
  },
  sectionTitle: {
    alignSelf: 'flex-start',
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 24,
  },
});
