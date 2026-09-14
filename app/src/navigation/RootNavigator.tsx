import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TabNavigator from './TabNavigator';
import DetailScreen from '../screens/DetailScreen';
import WebPlayerScreen from '../screens/WebPlayerScreen';
import MoviesScreen from '../screens/MoviesScreen';
import TVShowsScreen from '../screens/TVShowsScreen';
import AnimeScreen from '../screens/AnimeScreen';
import GenreScreen from '../screens/GenreScreen';
import Top10Screen from '../screens/Top10Screen';
import PersonScreen from '../screens/PersonScreen';
import CollectionScreen from '../screens/CollectionScreen';
import LiveTVScreen from '../screens/LiveTVScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import CreateAccountScreen from '../screens/auth/CreateAccountScreen';
import ProfileSelectScreen from '../screens/auth/ProfileSelectScreen';
import ProfileEditScreen from '../screens/auth/ProfileEditScreen';
import WatchPartyScreen from '../screens/WatchPartyScreen';
import WatchPartyLobbyScreen from '../screens/WatchPartyLobbyScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={TabNavigator} />
      <Stack.Screen name="Detail" component={DetailScreen} />
      <Stack.Screen
        name="WebPlayer"
        component={WebPlayerScreen}
        options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen name="Movies" component={MoviesScreen} />
      <Stack.Screen name="TVShows" component={TVShowsScreen} />
      <Stack.Screen name="Anime" component={AnimeScreen} />
      <Stack.Screen name="Genre" component={GenreScreen} />
      <Stack.Screen name="Top10" component={Top10Screen} />
      <Stack.Screen name="Person" component={PersonScreen} />
      <Stack.Screen name="Collection" component={CollectionScreen} />
      <Stack.Screen name="LiveTV" component={LiveTVScreen} />
      <Stack.Screen name="Login" component={LoginScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="CreateAccount" component={CreateAccountScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="ProfileSelect" component={ProfileSelectScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="ProfileEdit" component={ProfileEditScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="WatchParty" component={WatchPartyScreen} />
      <Stack.Screen name="WatchPartyLobby" component={WatchPartyLobbyScreen} options={{ gestureEnabled: false }} />
    </Stack.Navigator>
  );
}
