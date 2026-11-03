export function resolveApiOrigin(configuredUrl, hostUri, development) {
  if (configuredUrl) return configuredUrl.replace(/\/$/, '');
  if (!development || !hostUri) return '';
  const parsed = new URL(/^[a-z]+:\/\//i.test(hostUri) ? hostUri : 'http://' + hostUri);
  if (parsed.hostname.endsWith('.exp.direct') || parsed.hostname.includes('.ngrok')) return 'https://' + parsed.hostname;
  return parsed.origin;
}
