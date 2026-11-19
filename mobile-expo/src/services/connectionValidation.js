export function normalizeServerUrl(value) {
  let url;
  try { url = new URL(String(value || '').trim()); }
  catch { throw new Error('Informe o endereço HTTPS completo do servidor.'); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
    throw new Error('Use somente a origem HTTPS do servidor, sem usuário, senha, caminho ou parâmetros.');
  }
  return url.origin;
}

export async function probeServer(value, projectId, fetchImpl = fetch) {
  const origin = normalizeServerUrl(value);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetchImpl(origin + '/health', { signal: controller.signal });
    const body = await response.json();
    if (!response.ok || body.status !== 'ok' || body.service !== 'monibot') throw new Error('O endereço não respondeu como um servidor MoniMob disponível.');
    if (body.projectId !== projectId) throw new Error('Este servidor não pertence ao projeto Firebase configurado neste aplicativo.');
    return origin;
  } finally { clearTimeout(timer); }
}
