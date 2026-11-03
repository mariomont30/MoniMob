import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import MoniMobApp from './src/MoniMobApp.js';

export default function App() {
  return <SafeAreaProvider><MoniMobApp /></SafeAreaProvider>;
}
