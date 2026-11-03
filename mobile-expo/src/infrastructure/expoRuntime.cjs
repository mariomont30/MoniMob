// SDK 58 can recreate the JS runtime after an Android font-scale change before
// Expo's global is installed. Initialize the real native module before any Expo
// imports; never replace it with a JavaScript EventEmitter or suppress the error.
function ensureExpoRuntime({ platform, globals, getNativeModule }) {
  if (!['android', 'ios'].includes(platform) || globals.expo?.EventEmitter) return;
  const native = getNativeModule('ExpoModulesCore');
  if (typeof native?.installModules !== 'function') throw new Error('ExpoModulesCore não está disponível neste aplicativo.');
  native.installModules();
  if (!globals.expo?.EventEmitter) throw new Error('Não foi possível inicializar os módulos nativos do Expo.');
}
module.exports = { ensureExpoRuntime };
