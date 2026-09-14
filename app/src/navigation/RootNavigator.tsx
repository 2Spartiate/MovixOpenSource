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
    </Stack.Navigator>
  );
}
