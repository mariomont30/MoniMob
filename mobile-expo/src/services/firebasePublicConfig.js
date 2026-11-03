export function resolveFirebasePublicConfig(values, emulatorHost) {
  if (emulatorHost) return {
    apiKey: 'local-emulator-key', authDomain: 'localhost', projectId: 'demo-monimob',
    appId: 'local-emulator-app'
  };
  const required = ['apiKey', 'authDomain', 'projectId', 'appId'];
  if (required.some(key => !values[key]?.trim())) {
    throw new Error('Configure as variáveis públicas do Firebase no arquivo .env do aplicativo.');
  }
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value?.trim()));
}
