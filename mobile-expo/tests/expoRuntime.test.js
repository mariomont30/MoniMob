import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { ensureExpoRuntime } = require('../src/infrastructure/expoRuntime.cjs');

test('a fresh Android runtime installs the real Expo globals before the entry imports Expo or App', () => {
  const entry = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  // Each configuration change may create a distinct JS global; exercise the actual entry.
  for (let reload = 0; reload < 5; reload++) {
    const calls = [], context = vm.createContext({});
    const App = function App() {};
    context.require = name => {
      calls.push(name);
      if (name === 'react-native') return { Platform: { OS: 'android' }, TurboModuleRegistry: { get(module) { assert.equal(module, 'ExpoModulesCore'); return { installModules() { context.expo = { EventEmitter: class {} }; calls.push('native-install'); } }; } } };
      if (name.endsWith('expoRuntime.cjs')) return { ensureExpoRuntime };
      assert.ok(context.expo?.EventEmitter, 'Expo imported before its native runtime was installed');
      if (name === 'expo') return { registerRootComponent: component => { assert.equal(component, App); calls.push('registered'); } };
      if (name === './App') return { default: App };
      throw new Error('Unexpected entry import');
    };
    vm.runInContext(entry, context);
    assert.ok(calls.indexOf('native-install') < calls.indexOf('expo'));
    assert.equal(calls.at(-1), 'registered');
  }
});

test('an existing Expo runtime is preserved, without reinstalling native modules', () => {
  const globals = { expo: { EventEmitter: class {} } }, original = globals.expo;
  ensureExpoRuntime({ platform: 'android', globals, getNativeModule: () => assert.fail('unnecessary native install') });
  assert.equal(globals.expo, original);
});

test('web and SSR do not try to access a native TurboModule', () => {
  ensureExpoRuntime({ platform: 'web', globals: {}, getNativeModule: () => assert.fail('native module on web') });
});

test('missing native bindings are reported instead of fabricating an EventEmitter', () => {
  const globals = {};
  assert.throws(() => ensureExpoRuntime({ platform: 'android', globals, getNativeModule: () => null }), /ExpoModulesCore/);
  assert.equal(globals.expo, undefined);
  assert.throws(() => ensureExpoRuntime({ platform: 'android', globals, getNativeModule: () => ({ installModules() {} }) }), /inicializar/);
});
