import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { styles } from '../theme/styles.js';
const paths = {
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  home: 'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  calendar: 'M4 5h16v16H4ZM8 2v6m8-6v6M4 10h16',
  check: 'm4 12 5 5L20 6',
  list: 'M8 5h13M8 12h13M8 19h13M3 5h1M3 12h1M3 19h1',
  chart: 'M4 21V11m8 10V3m8 18V7',
  more: 'M4 12h1m6 0h1m6 0h1',
  book: 'M12 5C9 3 5 3 2 4v16c3-1 7-1 10 1m0-16c3-2 7-2 10-1v16c-3-1-7-1-10 1Z',
};
export function Icon({ name, color = '#64748B', size = 22 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Path
        d={paths[name] || paths.book}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
export function RoleHero({ title, description, metric, onPress }) {
  const hero = (
    <LinearGradient
      colors={['#132190', '#004AF7', '#066DA6']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.roleHero}
    >
      <View style={styles.heroMark}>
        <Icon name="book" color="#FFFFFF" size={25} />
      </View>
      <Text accessibilityRole="header" style={styles.roleHeroTitle}>
        {title}
      </Text>
      <Text style={styles.roleHeroCopy}>{description}</Text>
      {metric ? <Text style={styles.roleHeroMetric}>{metric}</Text> : null}
    </LinearGradient>
  );
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={[title, metric, 'Abrir detalhes'].filter(Boolean).join('. ')} onPress={onPress} style={({pressed})=>pressed&&styles.pressed}>{hero}</Pressable> : hero;
}
