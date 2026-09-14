import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as profilesService from '../services/profiles';
import type { Profile } from '../services/profiles';
import { useAuth } from './AuthContext';
import { CONFIG } from '../config';

const ACTIVE_PROFILE_KEY = 'movix_active_profile_id';

interface ProfileContextValue {
  profiles: Profile[];
  activeProfileId: string | null;
  activeProfile: Profile | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  selectProfile: (profileId: string) => Promise<void>;
  createProfile: (params: { name: string; avatar: string; ageRestriction?: number }) => Promise<Profile>;
  updateProfile: (profileId: string, params: { name?: string; avatar?: string; ageRestriction?: number }) => Promise<void>;
  deleteProfile: (profileId: string) => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const apiBase = CONFIG.API_BASE_URL;

  const refresh = useCallback(async () => {
    if (!apiBase || !session) {
      setProfiles([]);
      setActiveProfileId(null);
      return;
    }
    setIsLoading(true);
    try {
      const list = await profilesService.listProfiles(apiBase, session.token);
      setProfiles(list);
      const stored = await AsyncStorage.getItem(ACTIVE_PROFILE_KEY);
      const stillExists = list.find(p => p.id === stored);
      const next = stillExists ? stored : list.find(p => p.isDefault)?.id ?? list[0]?.id ?? null;
      setActiveProfileId(next);
      if (next) await AsyncStorage.setItem(ACTIVE_PROFILE_KEY, next);
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, session]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const selectProfile = useCallback(async (profileId: string) => {
    setActiveProfileId(profileId);
    await AsyncStorage.setItem(ACTIVE_PROFILE_KEY, profileId);
  }, []);

  const createProfile = useCallback(
    async (params: { name: string; avatar: string; ageRestriction?: number }) => {
      if (!apiBase || !session) throw new Error('Non connecte');
      const profile = await profilesService.createProfile(apiBase, session.token, params);
      await refresh();
      return profile;
    },
    [apiBase, session, refresh],
  );

  const updateProfile = useCallback(
    async (profileId: string, params: { name?: string; avatar?: string; ageRestriction?: number }) => {
      if (!apiBase || !session) throw new Error('Non connecte');
      await profilesService.updateProfile(apiBase, session.token, profileId, params);
      await refresh();
    },
    [apiBase, session, refresh],
  );

  const deleteProfile = useCallback(
    async (profileId: string) => {
      if (!apiBase || !session) throw new Error('Non connecte');
      await profilesService.deleteProfile(apiBase, session.token, profileId);
      await refresh();
    },
    [apiBase, session, refresh],
  );

  const activeProfile = profiles.find(p => p.id === activeProfileId) ?? null;

  return (
    <ProfileContext.Provider
      value={{ profiles, activeProfileId, activeProfile, isLoading, refresh, selectProfile, createProfile, updateProfile, deleteProfile }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error('useProfile must be used inside <ProfileProvider>');
  }
  return ctx;
}
