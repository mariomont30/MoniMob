// Keep these requires sequential: static imports would initialize Expo before
// the missing native globals have been restored after Android configuration changes.
const { Platform, TurboModuleRegistry } = require('react-native');
const { ensureExpoRuntime } = require('./src/infrastructure/expoRuntime.cjs');
ensureExpoRuntime({ platform: Platform.OS, globals: globalThis,
  getNativeModule: name => TurboModuleRegistry.get(name) });
const { registerRootComponent } = require('expo');
const App = require('./App').default;
registerRootComponent(App);
