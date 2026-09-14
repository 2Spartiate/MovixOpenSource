import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { backdropUrl, getDetails, posterUrl, type TmdbDetails } from '../services/tmdb';
import { useAddress } from '../context/AddressContext';
import type { RootStackParamList } from '../navigation/types';

// Chemins de lecture du site (src/routing/registry.tsx) : pas de selecteur
// saison/episode ici encore, on demarre toujours sur S1E1 pour une serie —
// a affiner une fois le handoff natif (Phase 2 du plan) en place.
function buildWatchUrl(primaryUrl: string, details: TmdbDetails): string {
  return details.media_type === 'movie'
    ? `${primaryUrl}/watch/movie/${details.id}`
    : `${primaryUrl}/watch/tv/${details.id}/s/1/e/1`;
}

export default function DetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Detail'>>();
  const { config } = useAddress();
  const [details, setDetails] = useState<TmdbDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDetails(route.params.mediaType, route.params.id)
      .then(d => {
        if (!cancelled) setDetails(d);
      })
      .catch(err => {
        if (!cancelled) setError(err?.message ?? 'Erreur de chargement');
      });
    return () => {
      cancelled = true;
    };
  }, [route.params.id, route.params.mediaType]);

  const onPlay = () => {
    if (!details || !config) return;
    navigation.navigate('WebPlayer', {
      url: buildWatchUrl(config.primaryUrl, details),
      title: details.title,
    });
  };

  if (error) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!details) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#8b5cf6" />
      </View>
    );
  }

  const backdrop = backdropUrl(details.backdrop_path);
  const poster = posterUrl(details.poster_path, 'w500');

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.backdropWrap}>
        {backdrop && <Image source={{ uri: backdrop }} style={styles.backdrop} />}
        <TouchableOpacity
          style={[styles.backButton, { top: insets.top + 8 }]}
          onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Retour</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <View style={styles.headerRow}>
          {poster && <Image source={{ uri: poster }} style={styles.poster} />}
          <View style={styles.headerInfo}>
            <Text style={styles.title}>{details.title}</Text>
            {!!details.release_date && (
              <Text style={styles.meta}>{details.release_date.slice(0, 4)}</Text>
            )}
            {details.genres.length > 0 && (
              <Text style={styles.meta}>{details.genres.map(g => g.name).join(', ')}</Text>
            )}
            <TouchableOpacity style={styles.playButton} onPress={onPlay}>
              <Text style={styles.playButtonText}>Lecture</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.overview}>{details.overview}</Text>

        {details.belongs_to_collection && (
          <TouchableOpacity
            style={styles.collectionBanner}
            onPress={() =>
              navigation.navigate('Collection', {
                id: details.belongs_to_collection!.id,
                name: details.belongs_to_collection!.name,
              })
            }>
            <Text style={styles.collectionBannerText}>Fait partie de {details.belongs_to_collection.name}</Text>
          </TouchableOpacity>
        )}

        {details.cast.length > 0 && (
          <View style={styles.castSection}>
            <Text style={styles.sectionTitle}>Casting</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {details.cast.map(member => {
                const photo = posterUrl(member.profile_path, 'w342');
                return (
                  <TouchableOpacity
                    key={member.id}
                    style={styles.castCard}
                    onPress={() => navigation.navigate('Person', { id: member.id, name: member.name })}>
                    {photo ? (
                      <Image source={{ uri: photo }} style={styles.castPhoto} />
                    ) : (
                      <View style={[styles.castPhoto, styles.castPhotoPlaceholder]} />
                    )}
                    <Text numberOfLines={1} style={styles.castName}>
                      {member.name}
                    </Text>
                    <Text numberOfLines={1} style={styles.castCharacter}>
                      {member.character}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
      </View>
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
  backdropWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#151515',
  },
  backdrop: {
    width: '100%',
    height: '100%',
  },
  backButton: {
    position: 'absolute',
    left: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  body: {
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    marginTop: -60,
  },
  poster: {
    width: 100,
    height: 150,
    borderRadius: 8,
    backgroundColor: '#151515',
  },
  headerInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'flex-end',
  },
  title: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  meta: {
    color: '#888888',
    fontSize: 13,
    marginTop: 4,
  },
  playButton: {
    marginTop: 10,
    backgroundColor: '#8b5cf6',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  playButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  overview: {
    color: '#cccccc',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 20,
  },
  collectionBanner: {
    marginTop: 20,
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: '#1f1f1f',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  collectionBannerText: {
    color: '#8b5cf6',
    fontSize: 14,
    fontWeight: '600',
  },
  castSection: {
    marginTop: 24,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  castCard: {
    width: 90,
    marginRight: 10,
  },
  castPhoto: {
    width: 90,
    height: 120,
    borderRadius: 8,
    backgroundColor: '#151515',
  },
  castPhotoPlaceholder: {
    borderWidth: 1,
    borderColor: '#1f1f1f',
  },
  castName: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
  castCharacter: {
    color: '#888888',
    fontSize: 11,
    marginTop: 2,
  },
  errorText: {
    color: '#888888',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
