import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAddress } from '../context/AddressContext';
import {
  buildLiveTvWatchUrl,
  getCatalog,
  getManifest,
  sourceFromCatalogId,
  type LiveTvCatalog,
  type LiveTvChannel,
  type LiveTvSource,
} from '../services/livetv';
import type { RootStackParamList } from '../navigation/types';

const SOURCE_LABELS: Record<LiveTvSource, string> = {
  northlive: 'Northlive',
  vavoo: 'Vavoo',
  matches: 'Direct sport',
};

export default function LiveTVScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { config } = useAddress();
  const [catalogs, setCatalogs] = useState<LiveTvCatalog[]>([]);
  const [loadingManifest, setLoadingManifest] = useState(true);
  const [activeSource, setActiveSource] = useState<LiveTvSource | null>(null);
  const [activeCatalog, setActiveCatalog] = useState<LiveTvCatalog | null>(null);
  const [channels, setChannels] = useState<LiveTvChannel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    getManifest(config.primaryUrl)
      .then(result => {
        if (cancelled) return;
        setCatalogs(result);
        const firstSource = result.length > 0 ? sourceFromCatalogId(result[0].id) : null;
        setActiveSource(firstSource);
      })
      .catch(err => {
        if (!cancelled) setError(err?.message ?? 'Erreur de chargement');
      })
      .finally(() => {
        if (!cancelled) setLoadingManifest(false);
      });
    return () => {
      cancelled = true;
    };
  }, [config]);

  const sources = useMemo(() => {
    const seen = new Set<LiveTvSource>();
    catalogs.forEach(c => {
      const s = sourceFromCatalogId(c.id);
      if (s) seen.add(s);
    });
    return Array.from(seen);
  }, [catalogs]);

  const catalogsForActiveSource = useMemo(
    () => catalogs.filter(c => sourceFromCatalogId(c.id) === activeSource),
    [catalogs, activeSource],
  );

  useEffect(() => {
    setActiveCatalog(catalogsForActiveSource[0] ?? null);
  }, [catalogsForActiveSource]);

  useEffect(() => {
    if (!config || !activeCatalog) {
      setChannels([]);
      return;
    }
    let cancelled = false;
    setLoadingChannels(true);
    getCatalog(config.primaryUrl, activeCatalog.type, activeCatalog.id)
      .then(result => {
        if (!cancelled) setChannels(result);
      })
      .catch(() => {
        if (!cancelled) setChannels([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingChannels(false);
      });
    return () => {
      cancelled = true;
    };
  }, [config, activeCatalog]);

  const openChannel = useCallback(
    (channel: LiveTvChannel) => {
      if (!config || !activeCatalog) return;
      navigation.navigate('WebPlayer', {
        url: buildLiveTvWatchUrl(config.primaryUrl, activeCatalog.id, channel),
        title: channel.name,
      });
    },
    [config, activeCatalog, navigation],
  );

  if (loadingManifest) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#8b5cf6" />
      </View>
    );
  }

  if (error || sources.length === 0) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.emptyText}>
          {error ?? "Aucune source Live TV activee. Verifie les reglages d'extraction."}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.header}>Live TV</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {sources.map(source => (
          <TouchableOpacity
            key={source}
            style={[styles.chip, activeSource === source && styles.chipActive]}
            onPress={() => setActiveSource(source)}>
            <Text style={[styles.chipText, activeSource === source && styles.chipTextActive]}>
              {SOURCE_LABELS[source]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {catalogsForActiveSource.map(catalog => (
          <TouchableOpacity
            key={catalog.id}
            style={[styles.chip, activeCatalog?.id === catalog.id && styles.chipActive]}
            onPress={() => setActiveCatalog(catalog)}>
            <Text style={[styles.chipText, activeCatalog?.id === catalog.id && styles.chipTextActive]}>
              {catalog.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loadingChannels ? (
        <ActivityIndicator style={{ marginTop: 24 }} color="#8b5cf6" />
      ) : (
        <FlatList
          data={channels}
          numColumns={3}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.gridRow}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.channelCard} onPress={() => openChannel(item)}>
              {item.poster || item.logo ? (
                <Image source={{ uri: item.poster ?? item.logo ?? undefined }} style={styles.channelImage} />
              ) : (
                <View style={[styles.channelImage, styles.channelImagePlaceholder]}>
                  <Text numberOfLines={3} style={styles.channelPlaceholderText}>
                    {item.name}
                  </Text>
                </View>
              )}
              <Text numberOfLines={1} style={styles.channelName}>
                {item.name}
              </Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>Aucune chaine dans cette categorie.</Text>}
        />
      )}
    </View>
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
    fontSize: 24,
    fontWeight: '700',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  chipRow: {
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
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
  grid: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 24,
  },
  gridRow: {
    justifyContent: 'flex-start',
    gap: 8,
  },
  channelCard: {
    width: 110,
    marginRight: 10,
  },
  channelImage: {
    width: 110,
    height: 110,
    borderRadius: 10,
    backgroundColor: '#151515',
  },
  channelImagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
    borderWidth: 1,
    borderColor: '#1f1f1f',
  },
  channelPlaceholderText: {
    color: '#888888',
    fontSize: 12,
    textAlign: 'center',
  },
  channelName: {
    color: '#ffffff',
    fontSize: 12,
    marginTop: 6,
  },
  emptyText: {
    color: '#888888',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
    marginTop: 24,
  },
});
