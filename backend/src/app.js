import { createServer } from 'node:http';
const error = (message, status = 400) => Object.assign(new Error(message), { status });
async function readJson(request, limit = 16384) {
  if (request.body !== undefined) {
    if ((request.rawBody?.length || Buffer.byteLength(JSON.stringify(request.body))) > limit) throw error('Corpo excede o limite permitido.', 413);
    if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) throw error('JSON inválido.');
    return request.body;
  }
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += Buffer.byteLength(chunk); if (size > limit) throw error('Corpo excede o limite permitido.', 413); chunks.push(Buffer.from(chunk)); }
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    const body = raw ? JSON.parse(raw) : {};
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw error('JSON inválido.'); }
}
function reply(response, status, body) { response.writeHead(status); response.end(JSON.stringify(body)); }
function normalizeHistory(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 10) throw error('Histórico de conversa inválido.', 400);
  const history = [];
  let previousRole = null;
  let totalCharacters = 0;
  for (const entry of value) {
    const role = entry?.role;
    const text = String(entry?.text || '').trim();
    if (!['user', 'model'].includes(role) || !text || text.length > 800 || role === previousRole) {
      throw error('Histórico de conversa inválido.', 400);
    }
    totalCharacters += text.length;
    if (totalCharacters > 6000) throw error('Histórico de conversa excede o limite permitido.', 400);
    history.push({ role, text });
    previousRole = role;
  }
  if (history.length && history[0].role !== 'user') throw error('Histórico de conversa inválido.', 400);
  return history;
}
export function createMoniMobHandler({ geminiClient, academicService, registrationService, accountDeletionService, materialFileService, verifyFirebaseToken, getFirebaseRoles, projectId, allowedOrigins = [], rateLimit = 120, rateWindowMs = 60000 }) {
  const origins = new Set(allowedOrigins);
  const buckets = new Map();
  let dataQuotaUntil = 0;
  let activeUploads = 0;
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
    if (url.pathname === '/health' && request.method === 'GET') return reply(response, 200, { status: 'ok', service: 'monibot', ...(projectId ? { projectId } : {}) });
    const registrationRoute = request.method === 'POST' && ['/api/registration', '/api/registration/activate'].includes(url.pathname);
    const deletionRoute = request.method === 'POST' && url.pathname === '/api/account/delete';
    const uploadRoute = request.method === 'POST' && url.pathname === '/api/materials/upload';
    const downloadMatch = request.method === 'GET' && url.pathname.match(/^\/api\/materials\/([A-Za-z0-9_-]{1,200})\/file$/);
    const known = uploadRoute || Boolean(downloadMatch) || deletionRoute || registrationRoute || (url.pathname === '/api/state' && request.method === 'GET') || (['/api/actions', '/api/monibot'].includes(url.pathname) && request.method === 'POST');
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
      if (deletionRoute) {
        if (!accountDeletionService) throw error('Exclusão indisponível.', 503);
        const input = await readJson(request);
        return reply(response, 200, await accountDeletionService.deleteOwn(verified, input.confirmation));
      }
      if (registrationRoute) {
        if (!registrationService) throw error('Cadastro indisponível.', 503);
        const registrationKey = 'registration:' + verified.userId;
        const registrationBucket = buckets.get(registrationKey) || { startedAt: now, count: 0 };
        registrationBucket.count += 1; buckets.set(registrationKey, registrationBucket);
        if (registrationBucket.count > 5) throw error('Aguarde antes de tentar outro envio.', 429);
        const input = await readJson(request);
        const result = url.pathname.endsWith('/activate') ? await registrationService.activate(verified.userId) : await registrationService.register(verified.userId, input);
        return reply(response, 200, result);
      }
      if (verified.emailVerified !== true) throw Object.assign(error('Confirme seu e-mail institucional antes de usar o MoniMob.', 403), { code: 'EMAIL_NOT_VERIFIED' });
      if (now < dataQuotaUntil) throw Object.assign(error('Serviço de dados temporariamente indisponível.', 503), { code: 'DATA_QUOTA_EXCEEDED' });
      const roles = await getFirebaseRoles(verified.userId);
      if(uploadRoute || downloadMatch){
        const role = url.searchParams.get('role');
        if(!['student','monitor','professor'].includes(role)||!roles?.includes(role))throw error('Perfil não autorizado.',403);
        if(!materialFileService)throw error('Serviço de arquivos indisponível.',503);
        const identity = {sub:verified.userId,roles};
        if(academicService?.store?.rateLimit)await academicService.store.rateLimit(identity.sub,uploadRoute?'file-upload':'file-download',uploadRoute?5:60);
        if(uploadRoute){
          if(activeUploads>=3)throw error('Há outros envios em andamento. Tente novamente.',429);
          activeUploads++;
          try{return reply(response,200,await materialFileService.upload(identity,role,await readJson(request,7*1024*1024)));}
          finally{activeUploads--;}
        }
        const file = await materialFileService.download(identity,role,downloadMatch[1]);
        const safeName=file.name.replace(/[^A-Za-z0-9_. -]/g,'_');
        response.setHeader('Content-Type',file.mimeType);
        response.setHeader('Content-Length',file.bytes.length);
        response.setHeader('Content-Disposition','attachment; filename="'+safeName+'"; filename*=UTF-8\'\''+encodeURIComponent(file.name));
        response.writeHead(200);response.end(file.bytes);return;
      }
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
        const result = body.command?.action === 'deleteMaterial' && materialFileService
          ? await materialFileService.deleteMaterial(identity,role,body.command)
          : await academicService.execute(identity, role, body.command);
        return reply(response, 200, { result });
      }
      const message = String(body.message || '').trim();
      if (!message || message.length > 800) throw error('A mensagem deve ter entre 1 e 800 caracteres.');
      if (!geminiClient) throw error('MoniBot indisponível.', 503);
      // MoniBot presentation: identity and role have already been verified above.
      // Build context on the server; ignore any academic facts sent by a client.
      const context = academicService ? await academicService.aiContext(identity, role, { sessionId: typeof body.context?.sessionId === 'string' ? body.context.sessionId : undefined }) : {};
      const history = normalizeHistory(body.history);
      // Only Gemini's actual answer is returned. A provider outage is a clear
      // error with retry support, never a fabricated successful response.
      const answer = await geminiClient.generate({ userId: identity.sub, role, message, history, context });
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
      if (['AI_TEMPORARILY_UNAVAILABLE', 'AI_QUOTA_EXCEEDED'].includes(cause.code)) response.setHeader('Retry-After', String(cause.retryAfterSeconds));
      return reply(response, status, { error: quota ? 'O serviço de dados atingiu o limite temporário de uso. Tente novamente mais tarde.' : busy ? 'Há muitas operações ao mesmo tempo. Tente novamente em instantes.' : status < 500 || ['EMAIL_NOT_CONFIGURED','VERIFICATION_DELIVERY_FAILED'].includes(cause.code) ? cause.message : 'Serviço indisponível. Tente novamente.', code: quota ? 'DATA_QUOTA_EXCEEDED' : busy ? 'SERVER_BUSY' : cause.code || 'REQUEST_FAILED' });
    }
  };
}
export const createMoniBotServer = options => createServer(createMoniMobHandler(options));
