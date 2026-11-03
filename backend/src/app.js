import { createServer } from 'node:http';
const error = (message, status = 400) => Object.assign(new Error(message), { status });
async function readJson(request) {
  if (request.body !== undefined) {
    if ((request.rawBody?.length || Buffer.byteLength(JSON.stringify(request.body))) > 16384) throw error('Corpo excede o limite permitido.', 413);
    if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) throw error('JSON inválido.');
    return request.body;
  }
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (Buffer.byteLength(raw) > 16384) throw error('Corpo excede o limite permitido.', 413);
  }
  try {
    const body = raw ? JSON.parse(raw) : {};
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw error('JSON inválido.'); }
}
function reply(response, status, body) { response.writeHead(status); response.end(JSON.stringify(body)); }
export function createMoniMobHandler({ geminiClient, academicService, verifyFirebaseToken, getFirebaseRoles, allowedOrigins = [], rateLimit = 120, rateWindowMs = 60000 }) {
  const origins = new Set(allowedOrigins);
  const buckets = new Map();
  let dataQuotaUntil = 0;
  return async (request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    const origin = request.headers.origin;
    if (origin && !origins.has(origin)) return reply(response, 403, { error: 'Origem não autorizada.' });
    if (origin) { response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Vary', 'Origin'); }
    if (request.method === 'OPTIONS') {
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
      response.writeHead(204); response.end(); return;
    }
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/health' && request.method === 'GET') return reply(response, 200, { status: 'ok', service: 'monibot' });
    const known = (url.pathname === '/api/state' && request.method === 'GET') || (['/api/actions', '/api/monibot'].includes(url.pathname) && request.method === 'POST');
    if (!known) return reply(response, 404, { error: 'Rota não encontrada.' });
    try {
      const now = Date.now();
      for (const [key, bucket] of buckets) if (now - bucket.startedAt > rateWindowMs) buckets.delete(key);
      const key = request.socket?.remoteAddress || 'unknown';
      const bucket = buckets.get(key) || { startedAt: now, count: 0 };
      bucket.count += 1; buckets.set(key, bucket);
      if (bucket.count > rateLimit) throw error('Muitas solicitações. Tente novamente em instantes.', 429);
      const token = String(request.headers.authorization || '').replace(/^Bearer /, '');
      if (!token || token.split('.').length !== 3) throw error('Token Firebase inválido ou ausente.', 401);
      if (!verifyFirebaseToken || !getFirebaseRoles) throw error('Autenticação Firebase indisponível.', 503);
      let verified;
      try { verified = await verifyFirebaseToken(token); } catch { throw error('Token Firebase inválido ou expirado.', 401); }
      if (!verified?.userId) throw error('Identidade Firebase inválida.', 401);
      if (now < dataQuotaUntil) throw Object.assign(error('Serviço de dados temporariamente indisponível.', 503), { code: 'DATA_QUOTA_EXCEEDED' });
      const roles = await getFirebaseRoles(verified.userId);
      const body = request.method === 'POST' ? await readJson(request) : {};
      const role = body.role || url.searchParams.get('role');
      if (!['student', 'monitor', 'professor'].includes(role) || !roles?.includes(role)) throw error('Perfil não autorizado para esta sessão.', 403);
      const identity = { sub: verified.userId, roles };
      if (academicService?.store?.rateLimit) await academicService.store.rateLimit(identity.sub, url.pathname === '/api/monibot' ? 'ai' : body.command?.action === 'registerAttendance' ? 'attendance' : 'api', url.pathname === '/api/monibot' ? 10 : body.command?.action === 'registerAttendance' ? 10 : 120);
      if (url.pathname === '/api/state') {
        if (!academicService) throw error('Persistência indisponível.', 503);
        return reply(response, 200, { state: await academicService.read(identity, role) });
      }
      if (url.pathname === '/api/actions') {
        if (!academicService) throw error('Persistência indisponível.', 503);
        const result = await academicService.execute(identity, role, body.command);
        return reply(response, 200, { result });
      }
      const message = String(body.message || '').trim();
      if (!message || message.length > 800) throw error('A mensagem deve ter entre 1 e 800 caracteres.');
      if (!geminiClient) throw error('MoniBot indisponível.', 503);
      const context = academicService ? await academicService.aiContext(identity, role, { sessionId: typeof body.context?.sessionId === 'string' ? body.context.sessionId : undefined }) : {};
      const answer = await geminiClient.generate({ userId: identity.sub, role, message, context });
      return reply(response, 200, { answer });
    } catch (cause) {
      const quota = [8, '8', 'resource-exhausted', 'RESOURCE_EXHAUSTED', 'DATA_QUOTA_EXCEEDED'].includes(cause.code);
      const busy = [10, '10', 'ABORTED', 'SERVER_BUSY'].includes(cause.code);
      // A spent database quota cannot recover by immediately retrying the same
      // query. Briefly stop database attempts instead of amplifying the outage.
      if (quota && cause.code !== 'DATA_QUOTA_EXCEEDED') dataQuotaUntil = Date.now() + 60000;
      const status = quota || busy ? 503 : cause.status || (cause.name === 'DomainError' ? 409 : 502);
      if (busy) response.setHeader('Retry-After', '1');
      if (quota) response.setHeader('Retry-After', '60');
      if (cause.code === 'AI_TEMPORARILY_UNAVAILABLE') response.setHeader('Retry-After', String(cause.retryAfterSeconds));
      return reply(response, status, { error: quota ? 'O serviço de dados atingiu o limite temporário de uso. Tente novamente mais tarde.' : busy ? 'Há muitas operações ao mesmo tempo. Tente novamente em instantes.' : status < 500 ? cause.message : 'Serviço indisponível. Tente novamente.', code: quota ? 'DATA_QUOTA_EXCEEDED' : busy ? 'SERVER_BUSY' : cause.code || 'REQUEST_FAILED' });
    }
  };
}
export const createMoniBotServer = options => createServer(createMoniMobHandler(options));
