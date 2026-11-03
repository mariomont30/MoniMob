const SYSTEM_INSTRUCTION = `Você é o MoniBot, assistente acadêmico do MoniMob para o curso de Ciência da Computação da UNIFOR. Responda em português brasileiro, com objetividade. Ajude a localizar monitorias, explicar o uso do aplicativo, organizar sessões e interpretar indicadores. Não invente horários, vagas, notas, presenças ou regras acadêmicas. Use somente o contexto recebido. Não substitua professor, coordenação ou atendimento institucional e não revele dados pessoais de outros usuários.`;

const TRANSIENT_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
class ProviderError extends Error {
  constructor(status, retryAfterMs = 0) {
    super(`Gemini respondeu com status ${status}.`);
    this.providerStatus = status;
    this.retryAfterMs = retryAfterMs;
  }
}
export class AiUnavailableError extends Error {
  constructor(cause) {
    super('MoniBot temporariamente indisponível.', { cause });
    this.name = 'AiUnavailableError';
    this.status = 503;
    this.code = 'AI_TEMPORARILY_UNAVAILABLE';
    this.retryAfterSeconds = Math.max(2, Math.ceil((cause?.retryAfterMs || 0) / 1000));
  }
}
function retryAfter(response, now) {
  const value = response.headers?.get?.('retry-after');
  if (!value) return 0;
  const delay = /^\d+(?:\.\d+)?$/.test(value) ? Number(value) * 1000 : Date.parse(value) - now;
  return Number.isFinite(delay) ? Math.max(0, delay) : 0;
}
function isTransient(error) {
  if (error instanceof ProviderError) return TRANSIENT_STATUS.has(error.providerStatus);
  return ['AbortError', 'TimeoutError'].includes(error?.name) || error instanceof TypeError ||
    ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND'].includes(error?.code);
}

async function requestAnswer(fetchImpl, endpoint, options, timeoutMs, now) {
  // A new controller belongs to each attempt, including consumption of its body.
  const controller = new AbortController();
  let timeout;
  const expired = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      const cause = Object.assign(new Error('Tempo de resposta da IA excedido.'), { name: 'TimeoutError' });
      controller.abort(cause);
      reject(cause);
    }, timeoutMs);
  });
  try {
    return await Promise.race([(async () => {
      const response = await fetchImpl(endpoint, { ...options, signal: controller.signal });
      if (!response.ok) {
        const cause = new ProviderError(response.status, retryAfter(response, now()));
        await response.body?.cancel?.().catch(() => {});
        throw cause;
      }
      const payload = await response.json();
      const answer = payload?.candidates?.[0]?.content?.parts?.filter(part => !part.thought)
        .map(part => part.text || '').join('').trim();
      if (!answer) throw new Error('Gemini não retornou conteúdo utilizável.');
      return answer;
    })(), expired]);
  } finally { clearTimeout(timeout); }
}

export class GeminiClient {
  constructor({ apiKey, model = 'gemini-3.6-flash', fetchImpl = fetch,
    attemptTimeoutMs = 18000, totalTimeoutMs = 38000, maxAttempts = 3,
    sleep = wait, now = Date.now, random = Math.random, onAttempt = () => {} } = {}) {
    if (!apiKey) throw new Error('GEMINI_API_KEY não configurada no backend.');
    if (![attemptTimeoutMs, totalTimeoutMs, maxAttempts].every(value => Number.isFinite(value) && value > 0) || !Number.isInteger(maxAttempts)) throw new Error('Política de repetição da IA inválida.');
    this.apiKey = apiKey;
    this.model = model;
    this.fetchImpl = fetchImpl;
    Object.assign(this, { attemptTimeoutMs, totalTimeoutMs, maxAttempts, sleep, now, random, onAttempt });
  }

  async generate({ role, message, context }) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
    const prompt = `Papel do usuário: ${role}\nContexto acadêmico permitido: ${JSON.stringify(context)}\nPergunta: ${message}`;
    const options = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': this.apiKey
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2, maxOutputTokens: 1024,
          ...(/^gemini-3.*flash/.test(this.model) ? { thinkingConfig: { thinkingLevel: 'low' } }
            : /^gemini-2\.5-flash/.test(this.model) ? { thinkingConfig: { thinkingBudget: 0 } } : {})
        }
      })
    };
    const deadline = this.now() + this.totalTimeoutMs;
    let failure;
    for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
      const remaining = deadline - this.now();
      if (remaining <= 0) break;
      try {
        return await requestAnswer(this.fetchImpl, endpoint, options, Math.min(this.attemptTimeoutMs, remaining), this.now);
      } catch (cause) {
        failure = cause;
        try { this.onAttempt({ attempt: attempt + 1, providerStatus: cause.providerStatus, reason: cause.name }); } catch {}
        if (!isTransient(cause)) throw cause;
        const backoff = 1000 * 2 ** attempt + Math.floor(this.random() * 250);
        const delay = Math.max(backoff, cause.retryAfterMs || 0);
        // Do not ignore Retry-After or start a request after the overall budget.
        if (attempt + 1 >= this.maxAttempts || delay >= deadline - this.now()) break;
        await this.sleep(delay);
      }
    }
    throw new AiUnavailableError(failure);
  }
}
