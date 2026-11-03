import { auth } from '../services/firebaseConfig.js';
import { apiRequest } from '../services/academicApi.js';

export async function loadAcademicState(user, role) {
  if (auth.currentUser?.uid !== user.id) throw new Error('Sua sessão mudou. Entre novamente.');
  const token = await auth.currentUser.getIdToken();
  return (await apiRequest('/api/state?role=' + encodeURIComponent(role), { token })).state;
}
