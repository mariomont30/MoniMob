import React from 'react';
import { Dimensions } from 'react-native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import MoniMobApp from './src/MoniMobApp.js';
import { LaunchExperienceProvider } from './src/components/launchExperience.js';

const window = Dimensions.get('window');
// Without initial insets SafeAreaProvider renders no children until Android
// delivers an event. Expo Go can miss that first event when reopening a project.
// Native measurements still replace these values when they arrive.
const startupMetrics = initialWindowMetrics ?? {
  frame: { x: 0, y: 0, width: window.width, height: window.height },
  insets: { top: 0, right: 0, bottom: 0, left: 0 },
};

export default function App() {
  return (
    <SafeAreaProvider initialMetrics={startupMetrics} style={{ flex: 1 }}>
      <LaunchExperienceProvider>
        <MoniMobApp />
      </LaunchExperienceProvider>
    </SafeAreaProvider>
  );
}
