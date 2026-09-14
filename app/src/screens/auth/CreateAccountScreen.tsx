import React, { useCallback, useEffect, useState } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../context/AuthContext';
import { generateBip39, useAuthApiBase } from '../../services/auth';
import { useAddress } from '../../context/AddressContext';
import { CONFIG } from '../../config';
import { CURATED_AVATARS } from '../../data/avatars';
import TurnstileWebView from '../../components/TurnstileWebView';
import type { RootStackParamList } from '../../navigation/types';

type Step = 'reveal' | 'confirm' | 'profile';

export default function CreateAccountScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { config } = useAddress();
  const { createAccount } = useAuth();
  const apiBase = useAuthApiBase();
  const [step, setStep] = useState<Step>('reveal');
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState('');
  const [username, setUsername] = useState('');
  const [avatar, setAvatar] = useState(CURATED_AVATARS[0]);
  const [loading, setLoading] = useState(false);
  const [showTurnstile, setShowTurnstile] = useState(false);

  useEffect(() => {
    if (!apiBase) return;
    generateBip39(apiBase)
      .then(setMnemonic)
      .catch(err => Alert.alert('Erreur', err?.message ?? 'Impossible de generer la phrase secrete'));
  }, [apiBase]);

  const doCreate = useCallback(
    async (turnstileToken: string) => {
      if (!apiBase || !mnemonic) return;
      setLoading(true);
      try {
        await createAccount(apiBase, { mnemonic, username: username.trim(), avatar, turnstileToken });
        navigation.goBack();
      } catch (err: any) {
        Alert.alert('Creation impossible', err?.message ?? 'Erreur inconnue');
      } finally {
        setLoading(false);
        setShowTurnstile(false);
      }
    },
    [apiBase, mnemonic, username, avatar, createAccount, navigation],
  );

  const onSubmitProfile = useCallback(() => {
    if (!username.trim()) {
      Alert.alert('Nom manquant', 'Choisis un nom d\'utilisateur.');
      return;
    }
    if (CONFIG.TURNSTILE_SITE_KEY) {
      setShowTurnstile(true);
    } else {
      doCreate('');
    }
  }, [username, doCreate]);

  const insetsTop = insets.top + 24;

  if (!mnemonic) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insetsTop }]}>
        <ActivityIndicator size="large" color="#8b5cf6" />
      </View>
    );
  }

  if (step === 'reveal') {
    const words = mnemonic.split(' ');
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingTop: insetsTop, paddingHorizontal: 20, paddingBottom: 40 }}>
        <Text style={styles.title}>Ta phrase secrete</Text>
        <Text style={styles.subtitle}>
          Note ces 12 mots dans l'ordre et garde-les en lieu sur. C'est la seule facon de recuperer ton compte.
        </Text>
        <View style={styles.wordGrid}>
          {words.map((word, i) => (
            <View key={i} style={styles.wordChip}>
              <Text style={styles.wordIndex}>{i + 1}</Text>
              <Text style={styles.wordText}>{word}</Text>
            </View>
          ))}
        </View>
        <TouchableOpacity style={styles.primaryButton} onPress={() => setStep('confirm')}>
          <Text style={styles.primaryButtonText}>J'ai note ma phrase</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (step === 'confirm') {
    return (
      <View style={[styles.container, { paddingTop: insetsTop, paddingHorizontal: 20 }]}>
        <Text style={styles.title}>Confirme ta phrase</Text>
        <Text style={styles.subtitle}>Retape les 12 mots pour verifier que tu les as bien notes.</Text>
        <TextInput
          style={styles.textarea}
          value={confirmed}
          onChangeText={setConfirmed}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="mot1 mot2 mot3 ..."
          placeholderTextColor="#666666"
        />
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => {
            if (confirmed.trim().toLowerCase() !== mnemonic.trim().toLowerCase()) {
              Alert.alert('Ca ne correspond pas', 'Relis ta phrase et reessaie.');
              return;
            }
            setStep('profile');
          }}>
          <Text style={styles.primaryButtonText}>Continuer</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingTop: insetsTop, paddingHorizontal: 20, paddingBottom: 40 }}>
      <Text style={styles.title}>Ton profil</Text>
      <TextInput
        style={styles.input}
        placeholder="Nom d'utilisateur"
        placeholderTextColor="#666666"
        value={username}
        onChangeText={setUsername}
        editable={!loading}
      />
      <Text style={styles.sectionLabel}>Avatar</Text>
      <View style={styles.avatarGrid}>
        {CURATED_AVATARS.map(path => {
          const uri = `${config?.primaryUrl ?? CONFIG.SITE_URL}${path}`;
          const selected = avatar === path;
          return (
            <TouchableOpacity key={path} onPress={() => setAvatar(path)}>
              <Image source={{ uri }} style={[styles.avatar, selected && styles.avatarSelected]} />
            </TouchableOpacity>
          );
        })}
      </View>
      <TouchableOpacity style={styles.primaryButton} onPress={onSubmitProfile} disabled={loading}>
        {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Creer mon compte</Text>}
      </TouchableOpacity>

      <TurnstileWebView visible={showTurnstile} onToken={doCreate} onCancel={() => setShowTurnstile(false)} />
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
  title: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 6,
  },
  subtitle: {
    color: '#888888',
    fontSize: 14,
    marginBottom: 20,
  },
  wordGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  wordChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#151515',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1f1f1f',
    paddingVertical: 8,
    paddingHorizontal: 10,
    width: '31%',
  },
  wordIndex: {
    color: '#666666',
    fontSize: 11,
    marginRight: 6,
  },
  wordText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  textarea: {
    minHeight: 100,
    backgroundColor: '#151515',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1f1f1f',
    color: '#ffffff',
    padding: 14,
    fontSize: 15,
    textAlignVertical: 'top',
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
});
