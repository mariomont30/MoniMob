import React from 'react';
import { Animated, Image, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { styles } from '../theme/styles.js';

const interpolate = (progress, inputRange, outputRange) =>
  progress.interpolate({ inputRange, outputRange, extrapolate: 'clamp' });
const particles = Array.from({ length: 8 }, (_, index) => {
  const angle = (index * Math.PI) / 4 - Math.PI / 8;
  return { x: Math.cos(angle) * 86, y: Math.sin(angle) * 86, size: index % 2 ? 4 : 6 };
});

export function OpeningBackdrop({ progress }) {
  const { width, height } = useWindowDimensions();
  const diameter = Math.min(720, Math.max(380, width * 1.35));
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={styles.openingBackdrop}
    >
      <Animated.View
        style={{
          position: 'absolute',
          width: diameter,
          height: diameter,
          top: -diameter * 0.42,
          right: -diameter * 0.36,
          opacity: 0.7,
          transform: [
            { translateY: interpolate(progress, [0, 1], [-60, 0]) },
            { scale: interpolate(progress, [0, 0.45, 1], [0.7, 1.12, 1]) },
          ],
        }}
      >
        <LinearGradient
          colors={['#7776FF00', '#637CFF99', '#1B7CFF00']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.openingGlow, { borderRadius: diameter }]}
        />
      </Animated.View>
      <Animated.View
        style={{
          position: 'absolute',
          width: diameter,
          height: diameter,
          top: height * 0.5,
          left: -diameter * 0.46,
          opacity: 0.65,
          transform: [{ translateY: interpolate(progress, [0, 1], [90, 0]) }],
        }}
      >
        <LinearGradient
          colors={['#11DCED00', '#11DCED66', '#004AF700']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.openingGlow, { borderRadius: diameter }]}
        />
      </Animated.View>
      {[0.18, 0.42, 0.66, 0.9].map((position) => (
        <View
          key={position}
          style={{
            position: 'absolute',
            top: height * 0.4,
            left: width * position,
            height,
            width: 1,
            backgroundColor: 'rgba(183,226,255,0.07)',
            transform: [{ rotate: '24deg' }],
          }}
        />
      ))}
      <Animated.View
        style={{
          position: 'absolute',
          left: -width,
          top: -height * 0.25,
          width: width * 0.7,
          height: height * 1.6,
          opacity: interpolate(progress, [0, 0.12, 0.4, 0.76, 1], [0, 0.1, 0.5, 0, 0]),
          transform: [
            { translateX: interpolate(progress, [0, 1], [0, width * 3]) },
            { rotate: '24deg' },
          ],
        }}
      >
        <LinearGradient
          colors={['#FFFFFF00', '#DDF7FF70', '#FFFFFF00']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.openingGlow}
        />
      </Animated.View>
    </View>
  );
}

export function OpeningEmblem({ opening }) {
  const { progress } = opening;
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={styles.openingEmblem}
    >
      <Animated.View
        style={[
          styles.openingHalo,
          {
            opacity: interpolate(progress, [0, 0.24, 0.6, 1], [0.15, 0.8, 0.35, 0.25]),
            transform: [{ scale: interpolate(progress, [0, 0.24, 0.6, 1], [0.5, 1.12, 1.2, 1]) }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.openingOrbit,
          {
            transform: [
              { rotate: interpolate(progress, [0, 0.6, 1], ['-180deg', '20deg', '30deg']) },
              { scale: interpolate(progress, [0, 0.3, 1], [0.55, 1.08, 1]) },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.openingOrbitInner,
          {
            transform: [
              { rotate: interpolate(progress, [0, 0.6, 1], ['140deg', '-20deg', '-30deg']) },
            ],
          },
        ]}
      />
      {particles.map(({ x, y, size }, index) => (
        <Animated.View
          key={index}
          style={{
            position: 'absolute',
            left: 92 + x - size / 2,
            top: 92 + y - size / 2,
            width: size,
            height: size,
            borderRadius: size,
            backgroundColor: index % 2 ? '#7AE8FF' : '#FFFFFF',
            opacity: interpolate(progress, [0, 0.16, 0.4, 1], [0, 0.2, 1, 0.65]),
            transform: [
              { translateX: interpolate(progress, [0, 0.4, 1], [-x * 0.6, x * 0.1, 0]) },
              { translateY: interpolate(progress, [0, 0.4, 1], [-y * 0.6, y * 0.1, 0]) },
              { scale: interpolate(progress, [0, 0.3, 1], [0.2, 1.35, 1]) },
            ],
          }}
        />
      ))}
      <Animated.View style={[styles.welcomeBook, opening.bookStyle]}>
        <LinearGradient
          colors={['#FFFFFF44', '#73BBFF26', '#95EFFF33']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.openingBookGlass}
        />
        <Image
          source={require('../../assets/monimob-book.png')}
          resizeMode="contain"
          accessible={false}
          style={styles.welcomeBookImage}
        />
      </Animated.View>
    </View>
  );
}
