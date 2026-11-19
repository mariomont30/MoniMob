const PROFILE_NAMES = { student: 'Aluno', monitor: 'Monitor', professor: 'Professor' };
const fail = (message, status = 400, code = 'REGISTRATION_FAILED') => Object.assign(new Error(message), { status, code });
export function registrationInput(input, email) {
  if(!input || typeof input !== 'object' || Array.isArray(input) || typeof input.name !== 'string' || typeof input.registration !== 'string') throw fail('Informe nome, matrícula e perfil válidos.');
  const role = input.role;
  const name = String(input.name || '').trim();
  const registration = String(input.registration || '').trim().toLowerCase();
  if (!['student', 'monitor', 'professor'].includes(role)) throw fail('Perfil de cadastro inválido.');
  if (!name || name.length > 120 || !/^[a-z0-9._-]{4,64}$/.test(registration)) throw fail('Confira o nome e a matrícula ou registro funcional.');
  if (!/^[^\s@]+@(edu\.unifor\.br|unifor\.br)$/i.test(email || '')) throw fail('Use um e-mail institucional autorizado.');
  return { name, registration, role };
}
export function activatedRoles(role) {
  if(role === 'student') return ['student'];
  if (role === 'monitor') return ['student', 'monitor'];
  if (role === 'professor') return ['professor'];
  throw fail('Perfil solicitado inválido.', 403);
}
export class RegistrationService {
  constructor({ auth, db }) { Object.assign(this, { auth, db }); }
  async account(uid) {
    const user = await this.auth.getUser(uid);
    if (user.disabled || !user.email || !user.providerData.some(item => item.providerId === 'password')) throw fail('Conta não autorizada.', 403);
    return user;
  }
  async register(uid, input) {
    const user = await this.account(uid);
    const data = registrationInput(input, user.email);
    if (user.emailVerified) throw fail('Esta conta já está confirmada. Use o acesso existente.', 409);
    const ref = this.db.collection('users').doc(uid);
    const index = this.db.collection('studentRegistrationIndex').doc(data.registration);
    const profile = { id: uid, name: data.name, registration: data.registration, email: user.email.toLowerCase(), course: 'Ciências da Computação', roles: [], requestedRole: data.role, authorizationMode: 'automatic_email_verification', registrationStatus: 'awaiting_email' };
    await this.db.runTransaction(async tx => {
      const [existing, claimed] = await Promise.all([tx.get(ref), tx.get(index)]);
      if (existing.exists && existing.data().requestedRole === data.role && existing.data().registration === data.registration && existing.data().registrationStatus === 'awaiting_email' && claimed.exists && claimed.data().uid === uid) return;
      if (existing.exists || claimed.exists) throw fail('Conta ou matrícula já cadastrada.', 409);
      tx.set(ref, profile); tx.set(index, { uid });
    });
    return { email: user.email, profile: PROFILE_NAMES[data.role], requiresEmailVerification: true, useFirebase: true };
  }
  async activate(uid) {
    const user = await this.account(uid);
    if (!user.emailVerified) throw fail('Confirme seu e-mail antes de ativar o perfil.', 403, 'EMAIL_NOT_VERIFIED');
    const ref = this.db.collection('users').doc(uid);
    const snapshot = await ref.get();
    if (!snapshot.exists) throw fail('Perfil não cadastrado.', 404);
    const profile = snapshot.data();
    if (profile.disabled) throw fail('Perfil bloqueado.', 403);
    if (profile.email !== user.email.toLowerCase()) throw fail('Conta e perfil não correspondem.', 403);
    if (!profile.requestedRole) {
      if (profile.roles?.length === 1 && profile.roles[0] === 'student' && !profile.registrationStatus) {
        await ref.update({ registrationStatus: 'active' });
        return { activated: true, profile: 'Aluno' };
      }
      return { activated: false };
    }
    if (!['awaiting_email', 'active'].includes(profile.registrationStatus)) throw fail('Cadastro bloqueado.', 403);
    const roles = activatedRoles(profile.requestedRole);
    if (profile.registrationStatus === 'active') return { activated: false, profile: PROFILE_NAMES[profile.requestedRole] };
    await this.auth.setCustomUserClaims(uid, { ...user.customClaims, roles });
    await ref.update({ roles, registrationStatus: 'active' });
    return { activated: true, profile: PROFILE_NAMES[profile.requestedRole] };
  }
}
