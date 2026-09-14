import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { posterUrl, type TmdbListItem } from '../services/tmdb';

interface PosterCardProps {
  item: TmdbListItem;
  onPress: (item: TmdbListItem) => void;
  width?: number;
}

export default function PosterCard({ item, onPress, width = 120 }: PosterCardProps) {
  const uri = posterUrl(item.poster_path);
  return (
    <TouchableOpacity
      style={[styles.container, { width }]}
      activeOpacity={0.7}
      onPress={() => onPress(item)}>
      {uri ? (
        <Image source={{ uri }} style={[styles.poster, { width, height: width * 1.5 }]} />
      ) : (
        <View style={[styles.poster, styles.placeholder, { width, height: width * 1.5 }]}>
          <Text style={styles.placeholderText}>{item.title}</Text>
        </View>
      )}
      <Text numberOfLines={1} style={styles.title}>
        {item.title}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    marginRight: 10,
  },
  poster: {
    borderRadius: 8,
    backgroundColor: '#151515',
  },
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  placeholderText: {
    color: '#888888',
    fontSize: 12,
    textAlign: 'center',
  },
  title: {
    color: '#ffffff',
    fontSize: 12,
    marginTop: 6,
  },
});
