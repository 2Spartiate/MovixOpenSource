import React from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useProfile } from '../../context/ProfileContext';
import { useAddress } from '../../context/AddressContext';
import { CONFIG } from '../../config';
import type { RootStackParamList } from '../../navigation/types';

export default function ProfileSelectScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { profiles, activeProfileId, isLoading, selectProfile } = useProfile();
  const { config } = useAddress();
  const siteUrl = config?.primaryUrl ?? CONFIG.SITE_URL;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24 }]}>
      <Text style={styles.title}>Qui regarde ?</Text>
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color="#8b5cf6" />
      ) : (
        <View style={styles.grid}>
          {profiles.map(profile => (
            <TouchableOpacity
              key={profile.id}
              style={styles.profileCard}
              onPress={async () => {
                await selectProfile(profile.id);
                navigation.goBack();
              }}>
              <Image
                source={{ uri: `${siteUrl}${profile.avatar}` }}
                style={[styles.avatar, activeProfileId === profile.id && styles.avatarActive]}
              />
              <Text style={styles.profileName}>{profile.name}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.profileCard} onPress={() => navigation.navigate('ProfileEdit', {})}>
            <View style={[styles.avatar, styles.addAvatar]}>
              <Text style={styles.addIcon}>+</Text>
            </View>
            <Text style={styles.profileName}>Ajouter</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingHorizontal: 20,
  },
  title: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
  },
  profileCard: {
    alignItems: 'center',
    width: 90,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#151515',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  avatarActive: {
    borderColor: '#8b5cf6',
  },
  addAvatar: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1f1f1f',
  },
  addIcon: {
    color: '#8b5cf6',
    fontSize: 28,
    fontWeight: '700',
  },
  profileName: {
    color: '#ffffff',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
});
