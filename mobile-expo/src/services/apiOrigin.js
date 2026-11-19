export function resolveApiOrigin(configuredUrl, hostUri, development) {
  if (configuredUrl) return configuredUrl.replace(/\/$/, '');
  if (!development || !hostUri) return '';
  const parsed = new URL(/^[a-z]+:\/\//i.test(hostUri) ? hostUri : 'http://' + hostUri);
  if (parsed.hostname.endsWith('.exp.direct') || parsed.hostname.includes('.ngrok')) return 'https://' + parsed.hostname;
  return parsed.origin;
}

// Expo Go uses its current launcher; APK uses Firebase discovery. Old manually
// saved addresses deliberately have no influence on either environment.
export function selectApiOrigin({ configuredUrl, hostUri, development, metroProxy = false }) {
  if (!development) return '';
  if (metroProxy && hostUri) return resolveApiOrigin('', hostUri, true);
  return resolveApiOrigin(configuredUrl, hostUri, true);
}
