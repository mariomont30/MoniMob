import { apiRequest } from './academicApi.js';
export async function askMoniBot({ token, role, message, context = {} }) {
  return (await apiRequest('/api/monibot', { token, method: 'POST', body: { role, message, context } })).answer;
}
