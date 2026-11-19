import Constants from 'expo-constants';
import { selectApiOrigin } from './apiOrigin.js';
import { normalizeApiError } from './userErrors.js';
import { createAutomaticConnection } from './automaticConnection.js';
const configuredUrl = process.env.EXPO_PUBLIC_MONIMOB_API_URL || process.env.EXPO_PUBLIC_MONIBOT_API_URL || '';
const automatic = createAutomaticConnection({ projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID });
async function getApiUrl() {
  const development = process.env.NODE_ENV !== 'production';
  if (development) {
    const origin = selectApiOrigin({ configuredUrl, hostUri: Constants.expoConfig?.hostUri,
      development, metroProxy: process.env.EXPO_PUBLIC_MONIMOB_DEV_PROXY === '1' });
    if (origin) return origin;
  }
  return automatic.resolve();
}

export async function apiRequest(path, { token, method = 'GET', body, fetchImpl = fetch, connectionRetry = true, responseType = 'json' } = {}) {
  const API_URL = await getApiUrl();
  if (!API_URL) throw Object.assign(new Error('O servidor do MoniMob está indisponível.'), { code: 'API_UNAVAILABLE' });
  if (!API_URL.startsWith('https://') && process.env.NODE_ENV === 'production') throw Object.assign(new Error('A API deve usar HTTPS.'), { code: 'API_REQUIRES_HTTPS' });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), path === '/api/monibot' || path.includes('/materials/') ? 75000 : 25000);
  try {
    const response = await fetchImpl(API_URL + path, { method, signal: controller.signal, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if(response.ok && responseType === 'bytes')return new Uint8Array(await response.arrayBuffer());
    const payload = await response.json();
    if (!response.ok) throw Object.assign(new Error(payload.error || 'Não foi possível concluir a operação.'), { status: response.status, code: payload.code });
    return payload;
  } catch (error) {
    if (!error.status || error.status >= 500) automatic.invalidate();
    // Only reads are transparently replayed. Commands use sendCommand's stable
    // id for their own retry; registration/password operations are not replayed.
    if (!error.status && method === 'GET' && connectionRetry) return apiRequest(path, { token, method, body, fetchImpl, connectionRetry: false, responseType });
    throw normalizeApiError(error);
  } finally { clearTimeout(timeout); }
}

export async function sendCommand(token, role, action, input) {
  const command = { id: Date.now().toString(36) + '_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2), action, input };
  // A retry always reuses the same id, so a lost response cannot repeat the write.
  let response;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try { response = await apiRequest('/api/actions', { token, method: 'POST', body: { role, command } }); break; }
    catch (error) { if (attempt || ['DATA_QUOTA_EXCEEDED','SERVER_BUSY'].includes(error.code) || (error.status && error.status < 500)) throw error; }
  }
  return response.result;
}
