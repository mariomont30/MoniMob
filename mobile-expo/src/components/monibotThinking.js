import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme/colors.js';

// This indicator exists only while a real request is pending. Native animation
// never delays the answer. Unmount, reduced motion and backgrounding stop it.
export function MoniBotThinking() {
  const progress = useRef(new Animated.Value(0)).current;
  const [reducedMotion, setReducedMotion] = useState(true);
  useEffect(() => {
    let active = true, preferenceChanged = false;
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      preferenceChanged = true;
      if (active) setReducedMotion(enabled);
    });
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active && !preferenceChanged) setReducedMotion(enabled);
    }).catch(() => {});
    return () => { active = false; listener.remove(); };
  }, []);
  useEffect(() => {
    let animation;
    const update = (state) => {
      animation?.stop();
      progress.setValue(0);
      if (reducedMotion || state !== 'active') return;
      animation = Animated.loop(Animated.timing(progress, {
        toValue: 1, duration: 1400, easing: Easing.linear,
        useNativeDriver: true, isInteraction: false,
      }));
      animation.start();
    };
    update(AppState.currentState);
    const listener = AppState.addEventListener('change', update);
    return () => { listener.remove(); animation?.stop(); progress.setValue(0); };
  }, [progress, reducedMotion]);
  return (
    <View style={local.container} accessible accessibilityRole="text"
      accessibilityLabel="MoniBot está pensando. Preparando sua resposta."
      accessibilityLiveRegion="polite" accessibilityState={{ busy: true }}>
      <Animated.View style={{ transform: [{ scale: progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.08, 1] }) }] }}>
        <LinearGradient colors={[colors.primaryDark, colors.primary, '#066DA6']} style={local.emblem}>
          <Image source={require('../../assets/monimob-book.png')} style={local.book} resizeMode="contain" accessible={false} />
        </LinearGradient>
      </Animated.View>
      <View style={local.copy}>
        <Text style={local.title}>MoniBot está pensando…</Text>
        <Text style={local.caption}>Preparando sua resposta</Text>
        <View style={local.dots} accessible={false}>
          {[0, 1, 2].map((index) => (
            <Animated.View key={index} style={[local.dot, {
              opacity: progress.interpolate({
                inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1],
                outputRange: [0.4, index === 0 ? 1 : 0.4, index === 1 ? 1 : 0.4, index === 2 ? 1 : 0.4, 0.4, 0.4],
              }),
            }]} />
          ))}
        </View>
      </View>
    </View>
  );
}

const local = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, borderRadius: 24, backgroundColor: colors.tint, borderColor: colors.border, borderWidth: 1 },
  emblem: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  book: { width: 34, height: 34 },
  copy: { flex: 1, minWidth: 0, gap: 5 },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  caption: { color: colors.muted, fontSize: 13 },
  dots: { flexDirection: 'row', gap: 5, paddingTop: 3 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
});
