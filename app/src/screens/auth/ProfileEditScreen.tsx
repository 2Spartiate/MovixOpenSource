import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useProfile } from '../../context/ProfileContext';
import { useAddress } from '../../context/AddressContext';
import { CONFIG } from '../../config';
import { CURATED_AVATARS } from '../../data/avatars';
import type { RootStackParamList } from '../../navigation/types';

const AGE_OPTIONS: { value: 0 | 7 | 12 | 16 | 18; label: string }[] = [
  { value: 0, label: 'Tout public' },
  { value: 7, label: '7+' },
  { value: 12, label: '12+' },
  { value: 16, label: '16+' },
  { value: 18, label: '18+' },
];

export default function ProfileEditScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'ProfileEdit'>>();
  const { profiles, createProfile, updateProfile, deleteProfile } = useProfile();
  const { config } = useAddress();
  const siteUrl = config?.primaryUrl ?? CONFIG.SITE_URL;

  const existing = profiles.find(p => p.id === route.params.profileId);
  const [name, setName] = useState(existing?.name ?? '');
  const [avatar, setAvatar] = useState(existing?.avatar ?? CURATED_AVATARS[0]);
  const [ageRestriction, setAgeRestriction] = useState<0 | 7 | 12 | 16 | 18>(existing?.ageRestriction ?? 0);
  const [loading, setLoading] = useState(false);

  const onSave = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert('Nom manquant', 'Choisis un nom pour ce profil.');
      return;
    }
    setLoading(true);
    try {
      if (existing) {
        await updateProfile(existing.id, { name: name.trim(), avatar, ageRestriction });
      } else {
        await createProfile({ name: name.trim(), avatar, ageRestriction });
      }
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Erreur', err?.message ?? 'Impossible de sauvegarder ce profil');
    } finally {
      setLoading(false);
    }
  }, [existing, name, avatar, ageRestriction, createProfile, updateProfile, navigation]);

  const onDelete = useCallback(() => {
    if (!existing) return;
    Alert.alert('Supprimer ce profil ?', existing.name, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await deleteProfile(existing.id);
          navigation.goBack();
        },
      },
    ]);
  }, [existing, deleteProfile, navigation]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingTop: insets.top + 24, paddingHorizontal: 20, paddingBottom: 40 }}>
      <Text style={styles.title}>{existing ? 'Modifier le profil' : 'Nouveau profil'}</Text>
      <TextInput
        style={styles.input}
        placeholder="Nom du profil"
        placeholderTextColor="#666666"
        value={name}
        onChangeText={setName}
      />
      <Text style={styles.sectionLabel}>Avatar</Text>
      <View style={styles.avatarGrid}>
        {CURATED_AVATARS.map(path => (
          <TouchableOpacity key={path} onPress={() => setAvatar(path)}>
            <Image source={{ uri: `${siteUrl}${path}` }} style={[styles.avatar, avatar === path && styles.avatarSelected]} />
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.sectionLabel}>Restriction d'age</Text>
      <View style={styles.chipRow}>
        {AGE_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.chip, ageRestriction === opt.value && styles.chipActive]}
            onPress={() => setAgeRestriction(opt.value)}>
            <Text style={[styles.chipText, ageRestriction === opt.value && styles.chipTextActive]}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={styles.primaryButton} onPress={onSave} disabled={loading}>
        {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Enregistrer</Text>}
      </TouchableOpacity>
      {existing && profiles.length > 1 && (
        <TouchableOpacity style={styles.deleteButton} onPress={onDelete}>
          <Text style={styles.deleteButtonText}>Supprimer ce profil</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  title: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 20,
  },
  input: {
    backgroundColor: '#151515',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1f1f1f',
    color: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  sectionLabel: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 20,
    marginBottom: 10,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#151515',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  avatarSelected: {
    borderColor: '#8b5cf6',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: '#1f1f1f',
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
  primaryButton: {
    marginTop: 24,
    backgroundColor: '#8b5cf6',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  deleteButton: {
    marginTop: 14,
    alignItems: 'center',
    paddingVertical: 10,
  },
  deleteButtonText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
  },
});
