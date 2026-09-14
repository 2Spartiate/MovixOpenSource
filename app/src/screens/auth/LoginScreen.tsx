import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useAuthApiBase } from '../../services/auth';
import { CONFIG } from '../../config';
import TurnstileWebView from '../../components/TurnstileWebView';
import type { RootStackParamList } from '../../navigation/types';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { login } = useAuth();
  const apiBase = useAuthApiBase();
  const [mnemonic, setMnemonic] = useState('');
  const [loading, setLoading] = useState(false);
  const [showTurnstile, setShowTurnstile] = useState(false);

  const doLogin = useCallback(
    async (turnstileToken: string) => {
      if (!apiBase) return;
      setLoading(true);
      try {
        await login(apiBase, mnemonic.trim(), turnstileToken);
        navigation.goBack();
      } catch (err: any) {
        Alert.alert('Connexion impossible', err?.message ?? 'Erreur inconnue');
      } finally {
        setLoading(false);
        setShowTurnstile(false);
      }
    },
    [apiBase, mnemonic, login, navigation],
  );

  const onSubmit = useCallback(() => {
    if (mnemonic.trim().split(/\s+/).length < 12) {
      Alert.alert('Phrase incomplete', 'La phrase secrete comporte 12 mots.');
      return;
    }
    if (CONFIG.TURNSTILE_SITE_KEY) {
      setShowTurnstile(true);
    } else {
      doLogin('');
    }
  }, [mnemonic, doLogin]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24 }]}>
      <Text style={styles.title}>Connexion</Text>
      <Text style={styles.subtitle}>Saisis ta phrase secrete de 12 mots.</Text>
      <TextInput
        style={styles.textarea}
        placeholder="mot1 mot2 mot3 ..."
        placeholderTextColor="#666666"
        value={mnemonic}
        onChangeText={setMnemonic}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        editable={!loading}
      />
      <TouchableOpacity style={styles.primaryButton} onPress={onSubmit} disabled={loading}>
        {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Se connecter</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={styles.linkButton} onPress={() => navigation.navigate('CreateAccount')}>
        <Text style={styles.linkText}>Pas encore de compte ? Creer une phrase secrete</Text>
      </TouchableOpacity>

      <TurnstileWebView visible={showTurnstile} onToken={doLogin} onCancel={() => setShowTurnstile(false)} />
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
    marginBottom: 6,
  },
  subtitle: {
    color: '#888888',
    fontSize: 14,
    marginBottom: 20,
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
  primaryButton: {
    marginTop: 20,
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
  linkButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  linkText: {
    color: '#8b5cf6',
    fontSize: 13,
    fontWeight: '600',
  },
});
