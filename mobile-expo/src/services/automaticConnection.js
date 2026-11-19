// Only the project's administrator can publish this document. It contains a
// public HTTPS address, never credentials or academic data.
export function connectionDocumentUrl(projectId) {
  if (!/^[a-z][a-z0-9-]{4,62}$/.test(projectId || '')) throw new Error('Projeto de conexão inválido.');
  return 'https://firestore.googleapis.com/v1/projects/' + projectId + '/databases/(default)/documents/appConfig/connection';
}

export function readConnectionDocument(document, projectId) {
  const fields = document?.fields;
  if (fields?.projectId?.stringValue !== projectId || fields?.schemaVersion?.integerValue !== '1') throw new Error('Configuração de conexão inválida.');
  const value = fields.apiUrl?.stringValue;
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/' || !url.hostname.includes('.') || /^(localhost|127\.|0\.|169\.254\.|192\.168\.|10\.|\[)/i.test(url.hostname)) throw new Error('Conexão HTTPS inválida.');
  return url.origin;
}

export function createAutomaticConnection({ projectId, fetchImpl = (...args) => fetch(...args), now = Date.now, cacheMs = 60000 }) {
  let cached = null, pending = null;
  const resolve = async () => {
    if (cached && now() - cached.at < cacheMs) return cached.url;
    if (pending) return pending;
    pending = Promise.resolve().then(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetchImpl(connectionDocumentUrl(projectId), { signal: controller.signal, headers: { 'cache-control': 'no-cache' } });
        if (!response.ok) throw new Error('Configuração indisponível.');
        const url = readConnectionDocument(await response.json(), projectId);
        cached = { url, at: now() };
        return url;
      } catch {
        cached = null;
        throw Object.assign(new Error('Não foi possível localizar o servidor ativo do MoniMob. Confira sua conexão e se o servidor está ligado. Tente novamente.'), { code: 'API_UNAVAILABLE' });
      } finally { clearTimeout(timeout); }
    }).finally(() => { pending = null; });
    return pending;
  };
  return { resolve, invalidate: () => { cached = null; } };
}
