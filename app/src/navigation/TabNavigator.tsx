import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, Search, Library, Settings } from 'lucide-react-native';
import HomeScreen from '../screens/HomeScreen';
import SearchScreen from '../screens/SearchScreen';
import LibraryScreen from '../screens/LibraryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import type { TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#8b5cf6',
        tabBarInactiveTintColor: '#888888',
        tabBarStyle: {
          backgroundColor: '#0a0a0a',
          borderTopColor: '#1f1f1f',
        },
      }}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: 'Accueil', tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }}
      />
      <Tab.Screen
        name="Search"
        component={SearchScreen}
        options={{ title: 'Recherche', tabBarIcon: ({ color, size }) => <Search color={color} size={size} /> }}
      />
      <Tab.Screen
        name="Library"
        component={LibraryScreen}
        options={{ title: 'Bibliotheque', tabBarIcon: ({ color, size }) => <Library color={color} size={size} /> }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Reglages',
          tabBarIcon: ({ color, size }) => <Settings color={color} size={size} />,
          headerShown: true,
          headerStyle: { backgroundColor: '#0a0a0a' },
          headerTitleStyle: { color: '#ffffff' },
          headerShadowVisible: false,
        }}
      />
    </Tab.Navigator>
  );
}
