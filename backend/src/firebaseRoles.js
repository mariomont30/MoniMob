import { getFirestore } from 'firebase-admin/firestore';
import { getFirebaseAdminAuth } from './firebaseAdmin.js';

export async function getFirebaseRoles(userId) {
  const auth = getFirebaseAdminAuth();
  const [record, profile] = await Promise.all([auth.getUser(userId), getFirestore().collection('users').doc(userId).get()]);
  if (record.disabled || !profile.exists || profile.data().disabled) throw Object.assign(new Error('Conta não autorizada.'), { status: 403 });
  const allowed = ['student', 'monitor', 'professor'];
  const declared = Array.isArray(profile.data().roles) ? profile.data().roles : [];
  let roles = Array.isArray(record.customClaims?.roles) ? record.customClaims.roles : [];
  // Self-registration can bootstrap only the basic student permission.
  // Privileged roles always require a trusted administrator and matching claims.
  if (!roles.length && declared.length === 1 && declared[0] === 'student') {
    roles = ['student'];
    await auth.setCustomUserClaims(userId, { ...record.customClaims, roles });
  }
  roles = roles.filter(role => allowed.includes(role) && declared.includes(role));
  if (!roles.length) throw Object.assign(new Error('Usuário sem perfil acadêmico autorizado.'), { status: 403 });
  return roles;
}
