import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  AppState,
  Linking,
  Alert,
  View,
  Text,
  Switch,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { styles } from '../theme/styles.js';
const KEY = 'monimob.opening-sound.v1';
const Context = createContext({
  ready: false,
  sound: false,
  epoch: 0,
  consume: () => false,
  toggle: async () => {},
  restart: () => {},
});
export function LaunchExperienceProvider({ children }) {
  const [sound, setSound] = useState(false),
    [ready, setReady] = useState(false),
    [epoch, setEpoch] = useState(0);
  const consumed = useRef(false),
    saving = useRef(false);
  useEffect(() => {
    let active = true,
      resolved = false;
    const timer = setTimeout(() => {
      resolved = true;
      if (active) setReady(true);
    }, 500);
    AsyncStorage.getItem(KEY)
      .then((value) => {
        if (active && !resolved) {
          resolved = true;
          clearTimeout(timer);
          setSound(value !== 'off');
          setReady(true);
        }
      })
      .catch(() => {
        resolved = true;
        clearTimeout(timer);
        if (active) setReady(true);
      });
    const subscription = Linking.addEventListener('url', (event) => {
      if (/^exps?:\/\//i.test(event.url || '')) {
        consumed.current = false;
        setEpoch((value) => value + 1);
      }
    });
    return () => {
      active = false;
      clearTimeout(timer);
      subscription.remove();
    };
  }, []);
  const toggle = async () => {
    if (saving.current) return;
    saving.current = true;
    try {
      await AsyncStorage.setItem(KEY, sound ? 'off' : 'on');
      setSound((value) => !value);
    } catch {
      Alert.alert('Preferência', 'Não foi possível salvar a preferência de som. Tente novamente.');
    } finally {
      saving.current = false;
    }
  };
  return (
    <Context.Provider
      value={{
        ready,
        sound,
        epoch,
        consume: () => {
          if (consumed.current) return false;
          consumed.current = true;
          return true;
        },
        toggle,
        restart: () => {
          consumed.current = false;
          setEpoch((value) => value + 1);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useRestartOpening() {
  return useContext(Context).restart;
}
export function OpeningSoundSetting() {
  const { sound, ready, toggle } = useContext(Context);
  return (
    <View style={styles.preferenceRow}>
      <View style={styles.preferenceCopy}>
        <Text style={styles.cardTitle}>Som de abertura</Text>
        <Text style={styles.meta}>Som breve ao abrir. Respeita o modo silencioso do aparelho.</Text>
      </View>
      <Switch
        accessibilityLabel="Som de abertura"
        value={sound}
        disabled={!ready}
        onValueChange={toggle}
        trackColor={{ false: '#CBD5E1', true: '#004AF7' }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}
export function useOpeningExperience() {
  const claim = useRef({ epoch: -1, allowed: false });
  const context = useContext(Context);
  const progress = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (claim.current.epoch !== context.epoch) {
      claim.current = { epoch: context.epoch, allowed: context.consume() };
    }
    if (!context.ready || !claim.current.allowed) return;
    let active = true,
      allowed = true,
      animation,
      player,
      releaseTimer;
    const stop = () => {
      clearTimeout(releaseTimer);
      animation?.stop();
      progress.setValue(1);
      try {
        player?.remove();
      } catch {}
      player = null;
    };
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      if (enabled) {
        allowed = false;
        stop();
      }
    });
    const background = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        allowed = false;
        stop();
      }
    });
    AccessibilityInfo.isReduceMotionEnabled()
      .then(async (reduced) => {
        if (!active || !allowed || reduced) return;
        progress.setValue(0);
        animation = Animated.timing(progress, {
          toValue: 1,
          duration: 3000,
          easing: Easing.linear,
          useNativeDriver: true,
        });
        animation.start();
        if (!context.sound || AppState.currentState !== 'active') return;
        try {
          const audio = await import('expo-audio');
          await audio.setAudioModeAsync({
            playsInSilentMode: false,
            shouldPlayInBackground: false,
            allowsRecording: false,
            interruptionMode: 'mixWithOthers',
          });
          if (!active || !allowed || AppState.currentState !== 'active') return;
          player = audio.createAudioPlayer(require('../../assets/welcome-chime.wav'));
          player.volume = 0.65;
          player.play();
          releaseTimer = setTimeout(() => {
            try {
              player?.remove();
            } catch {}
            player = null;
          }, 3800);
        } catch {
          /* Audio is optional; the complete welcome remains interactive. */
        }
      })
      .catch(() => {});
    return () => {
      active = false;
      stop();
      motion.remove();
      background.remove();
    };
  }, [context.ready, context.epoch]);
  const curve = (inputRange, outputRange) =>
    progress.interpolate({ inputRange, outputRange, extrapolate: 'clamp' });
  return {
    progress,
    universityStyle: {
      opacity: curve([0, 0.2, 1], [0.55, 1, 1]),
      transform: [{ translateY: curve([0, 0.2, 1], [-12, 0, 0]) }],
    },
    bookStyle: {
      opacity: curve([0, 0.15, 1], [0.5, 1, 1]),
      transform: [
        { translateY: curve([0, 0.24, 0.38, 1], [38, -8, 0, 0]) },
        { scale: curve([0, 0.24, 0.38, 1], [0.58, 1.12, 1, 1]) },
        { rotate: curve([0, 0.24, 0.38, 1], ['-18deg', '5deg', '0deg', '0deg']) },
      ],
    },
    titleStyle: {
      opacity: curve([0, 0.18, 0.4, 1], [0.5, 0.5, 1, 1]),
      transform: [{ translateY: curve([0, 0.18, 0.4, 1], [22, 22, 0, 0]) }],
    },
    taglineStyle: {
      opacity: curve([0, 0.26, 0.48, 1], [0.6, 0.6, 1, 1]),
      transform: [{ translateY: curve([0, 0.26, 0.48, 1], [12, 12, 0, 0]) }],
    },
    actionsStyle: {
      opacity: curve([0, 0.35, 0.58, 1], [0.75, 0.75, 1, 1]),
      transform: [{ translateY: curve([0, 0.35, 0.58, 1], [22, 22, 0, 0]) }],
    },
  };
}
