import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft } from 'lucide-react-native';

interface ScreenHeaderProps {
  title: string;
  right?: React.ReactNode;
}

// Header partage par les ecrans pousses depuis la stack (Movies/TVShows/
// Anime/Genre/Top10/Person/Collection) : bouton retour + titre, respecte les
// safe-area insets.
export default function ScreenHeader({ title, right }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8, paddingLeft: insets.left + 12, paddingRight: insets.right + 12 }]}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={8}>
        <ChevronLeft color="#ffffff" size={24} />
      </TouchableOpacity>
      <Text numberOfLines={1} style={styles.title}>
        {title}
      </Text>
      <View style={styles.rightSlot}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 10,
    backgroundColor: '#0a0a0a',
  },
  backButton: {
    width: 32,
  },
  title: {
    flex: 1,
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  rightSlot: {
    minWidth: 32,
    alignItems: 'flex-end',
  },
});
