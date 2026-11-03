const CONNECTION_MESSAGE = 'Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.';
const LOGIN_MESSAGE = 'E-mail ou senha incorretos.';
const MESSAGES = {
  SERVER_BUSY: 'Há muitas operações ao mesmo tempo. Tente novamente em instantes.',
  DATA_QUOTA_EXCEEDED: 'O serviço de dados atingiu o limite temporário de uso. Tente novamente mais tarde.',
  'resource-exhausted': 'O serviço de dados atingiu o limite temporário de uso. Tente novamente mais tarde.',
  AI_TEMPORARILY_UNAVAILABLE: 'O MoniBot está temporariamente ocupado. Sua pergunta foi mantida. Tente novamente em instantes.',
  'auth/invalid-credential': LOGIN_MESSAGE,
  'auth/invalid-login-credentials': LOGIN_MESSAGE,
  'auth/user-not-found': LOGIN_MESSAGE,
  'auth/wrong-password': LOGIN_MESSAGE,
  'auth/invalid-email': 'Informe um e-mail válido.',
  'auth/email-already-in-use': 'Este e-mail já está cadastrado. Entre na conta ou recupere sua senha.',
  'auth/weak-password': 'Use uma senha mais forte, com pelo menos oito caracteres.',
  'auth/network-request-failed': CONNECTION_MESSAGE,
  'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco e tente novamente.',
  'auth/user-disabled': 'Esta conta está desativada. Entre em contato com a instituição.',
  'permission-denied': 'Sua conta não tem acesso a esses dados.',
  unavailable: CONNECTION_MESSAGE,
  API_NOT_CONFIGURED: 'Serviço temporariamente indisponível. Tente novamente em instantes.',
  API_REQUIRES_HTTPS: 'Serviço temporariamente indisponível. Tente novamente em instantes.'
};
export function normalizeApiError(error) {
  // Preserve status and code so command retry and idempotency decisions stay intact.
  if (Number.isInteger(error?.status)) return error;
  if (error?.name === 'AbortError') return new Error('A conexão demorou para responder. Tente novamente.');
  if (/network request failed|failed to fetch|fetch failed|networkerror|load failed|unknownhostexception|unable to resolve host|network is unreachable|failed to connect|client is offline/i.test(error?.message || '')) return new Error(CONNECTION_MESSAGE);
  return error;
}
export function userErrorMessage(error) {
  if (Object.prototype.hasOwnProperty.call(MESSAGES, error?.code)) return MESSAGES[error.code];
  if (String(error?.code || '').startsWith('auth/')) return 'Não foi possível acessar a conta. Tente novamente em instantes.';
  const normalized = normalizeApiError(error);
  if (normalized?.name === 'TypeError') return 'Não foi possível concluir a operação. Tente novamente.';
  return normalized?.message || 'Não foi possível concluir a operação. Tente novamente.';
}
