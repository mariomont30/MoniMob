// Defense in depth for free-text questions and academic titles. The academic
// service separately whitelists context fields and enforces the active role.
export function sanitizeAiText(value) {
  return String(value)
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/gi, '[CREDENCIAL REMOVIDA]')
    .replace(/\bBearer\s+[^\s,;]+/gi, '[TOKEN REMOVIDO]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[TOKEN REMOVIDO]')
    .replace(/\bAIza[A-Za-z0-9_-]{30,}\b/g, '[CHAVE REMOVIDA]')
    .replace(/\b(?:senha|password|token|api[_ -]?key|chave(?:\s+da\s+api)?)\s*(?:atual\s*|é\s*|is\s*)?(?:[:=]\s*|\s+)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;]+)/gi, '[CREDENCIAL REMOVIDA]')
    .replace(/\b[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[E-MAIL REMOVIDO]')
    .replace(/\b(?:matr[ií]cula|registration)\s*(?:[:=]|é|is)?\s*[A-Z0-9-]{5,}\b/gi, '[MATRÍCULA REMOVIDA]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[DOCUMENTO REMOVIDO]')
    .replace(/(?:\+55\s*)?\(?\d{2}\)?\s*9?\d{4}[- ]\d{4}\b/g, '[TELEFONE REMOVIDO]');
}

const privateField = /^(?:password|senha|email|registration|matricula|matrícula|token|apiKey|authorization|secret|credentials|userId|studentId)$/i;
export function sanitizeAiContext(value) {
  if (typeof value === 'string') return sanitizeAiText(value);
  if (Array.isArray(value)) return value.map(sanitizeAiContext);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).filter(([key]) => !privateField.test(key))
      .map(([key, item]) => [key, sanitizeAiContext(item)]),
  );
  return value;
}
