import { apiRequest } from './academicApi.js';
export async function askMoniBot({ token, role, message, history = [], context = {} }) {
  return (await apiRequest('/api/monibot', { token, method: 'POST', body: { role, message, history, context } })).answer;
}
