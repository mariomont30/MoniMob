import { createHash } from 'node:crypto';
import { MonitoringService } from './domain/monitoring.js';
import { academicEvent } from './domain/workflow.js';
const fail = (code, message, status = 400) => Object.assign(new Error(message), { code, status });
const start = (session) => Date.parse(`${session.date}T${session.time}:00-03:00`);

export function prepareAccountDeletion(state, uid, now = Date.now(), purgePersonal = true) {
  let user = state.users.find((item) => item.id === uid);
  if (!user) {
    user = { id: uid };
    state.users.push(user);
  }
  if (user.deletionPending || user.registrationStatus === 'deleted') return true;
  const stamp = new Date(now).toISOString();
  const notify = (userId, session) =>
    state.notifications.push({
      id:
        'deletion-' +
        createHash('sha256')
          .update(uid + ':' + session.id + ':' + userId)
          .digest('hex'),
      userId,
      sessionId: session.id,
      title: 'Monitoria cancelada',
      body: 'A conta responsável pela monitoria foi excluída. Confira sua agenda.',
      type: 'warning',
      read: false,
      createdAt: stamp,
    });
  state.waitlist
    .filter((item) => item.studentId === uid && item.status === 'waiting')
    .forEach((item) => {
      item.status = 'cancelled';
    });
  for (const session of state.sessions.filter(
    (item) =>
      (item.monitorId === uid || item.professorId === uid) && !item.archived && start(item) > now,
  )) {
    session.archived = true;
    session.status = 'cancelled';
    const recipients = new Set();
    for (const booking of state.reservations.filter(
      (item) => item.sessionId === session.id && item.status === 'confirmed',
    )) {
      booking.status = 'cancelled';
      booking.cancelledAt = stamp;
      recipients.add(booking.studentId);
    }
    for (const item of state.waitlist.filter(
      (item) => item.sessionId === session.id && item.status === 'waiting',
    )) {
      item.status = 'cancelled';
      recipients.add(item.studentId);
    }
    for (const id of recipients) if (id !== uid) notify(id, session);
  }
  // Account closure releases future bookings even inside the normal deadline.
  const originalWindow = state.settings.cancellationWindowHours;
  const originalRoles = user.roles;
  try {
    state.settings.cancellationWindowHours = 0;
    user.roles = [...new Set([...(user.roles || []), 'student'])];
    const service = new MonitoringService({
      read: () => state,
      write: (next) => Object.assign(state, next),
    });
    for (const booking of state.reservations.filter(
      (item) => item.studentId === uid && item.status === 'confirmed',
    )) {
      const session = state.sessions.find((item) => item.id === booking.sessionId);
      if (session && start(session) > now)
        service.cancelReservation({ reservationId: booking.id, studentId: uid, now });
    }
  } finally {
    state.settings.cancellationWindowHours = originalWindow;
    user.roles = originalRoles;
  }
  if (purgePersonal) {
    state.notifications = state.notifications.filter((item) => item.userId !== uid);
    state.favorites = state.favorites.filter((item) => item.studentId !== uid);
  }
  for (const link of state.monitorDisciplines)
    if (link.monitorId === uid || link.professorId === uid) link.active = false;
  for (const link of state.professorDisciplines) if (link.professorId === uid) link.active = false;
  for (const request of (state.linkRequests || []).filter(item => item.status === 'pending' && (item.monitorId === uid || item.professorId === uid))) {
    request.status = 'cancelled';
    request.decidedAt = stamp;
    request.comment = 'Solicitação encerrada por exclusão da conta envolvida.';
    academicEvent(state, uid, 'LINK_CANCELLED', request, 'Solicitação de vínculo encerrada', request.comment);
    const recipient = request.monitorId === uid ? request.professorId : request.monitorId;
    if (state.users.some(item => item.id === recipient && !item.disabled)) state.notifications.push({ id: 'link-closed-' + request.id, userId: recipient, title: 'Solicitação encerrada', body: request.comment, type: 'info', read: false, createdAt: stamp });
  }
  const replacement = {
    id: uid,
    name: 'Conta excluída',
    roles: [],
    disabled: true,
    deletionPending: true,
    registrationStatus: 'deleting',
    deletedAt: stamp,
  };
  if (user.registration) replacement.registration = user.registration;
  state.users[state.users.findIndex((item) => item.id === uid)] = replacement;
  return true;
}

// Match the five-minute clock-skew tolerance used by Firebase ID-token
// verification. A workstation slightly behind Google's clock must not reject
// a password that Firebase has just checked. Old password sessions still fail.
export function requireRecentPasswordAuthentication(identity, now = Date.now()) {
  const recentWindow = 300000,
    clockSkew = 300000;
  if (identity.provider !== 'password' || !Number.isFinite(identity.authTime))
    throw fail('RECENT_LOGIN_REQUIRED', 'Confirme sua senha novamente para excluir a conta.', 401);
  const authTime = identity.authTime * 1000;
  if (authTime > now + clockSkew)
    throw fail(
      'AUTH_CLOCK_SKEW',
      'O relógio do servidor está fora de sincronia. Confira a data e a hora do computador.',
      503,
    );
  if (
    now - authTime > recentWindow ||
    (Number.isFinite(identity.issuedAt) &&
      (identity.issuedAt - identity.authTime > 300 || identity.authTime - identity.issuedAt > 1))
  )
    throw fail('RECENT_LOGIN_REQUIRED', 'Confirme sua senha novamente para excluir a conta.', 401);
}

export class AccountDeletionService {
  constructor({ auth, db, store }) {
    Object.assign(this, { auth, db, store });
    this.hasPending = true;
    this.epoch = 0;
  }
  async deleteOwn(identity, confirmation, now = Date.now()) {
    if (confirmation !== 'DELETE')
      throw fail('CONFIRMATION_REQUIRED', 'Confirme a exclusão da conta.');
    requireRecentPasswordAuthentication(identity, now);
    const uid = identity.userId;
    const key = 'account-delete-' + createHash('sha256').update(uid).digest('hex');
    await this.store.transact(key, key, (state) => prepareAccountDeletion(state, uid, now, false));
    this.epoch += 1;
    this.hasPending = true;
    try {
      await this.complete(uid);
    } catch {
      this.hasPending = true;
      throw fail(
        'DELETION_PENDING',
        'A exclusão está pendente de conclusão. Aguarde e tente novamente.',
        503,
      );
    }
    return { deleted: true };
  }
  async complete(uid) {
    // Purge private lists in bounded batches, rather than exhausting the
    // academic transaction's write limit on accounts with many notifications.
    for (const [collection, field] of [
      ['notifications', 'userId'],
      ['favorites', 'studentId'],
    ]) {
      while (true) {
        const rows = await this.db.collection(collection).where(field, '==', uid).limit(100).get();
        if (rows.empty) break;
        const batch = this.db.batch();
        rows.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
      }
    }
    try {
      await this.auth.deleteUser(uid);
    } catch (error) {
      if (error.code !== 'auth/user-not-found') throw error;
    }
    await this.db.runTransaction(async (tx) => {
      const ref = this.db.doc('users/' + uid),
        revisionRef = this.db.doc('system/academicRevision');
      const [profile, revision] = await Promise.all([tx.get(ref), tx.get(revisionRef)]);
      if (!profile.exists || !profile.data().deletionPending) return;
      const data = profile.data();
      const indexRef = data.registration
        ? this.db.collection('studentRegistrationIndex').doc(data.registration)
        : null;
      const index = indexRef ? await tx.get(indexRef) : null;
      if (index?.exists && index.data().uid === uid) tx.delete(indexRef);
      tx.set(ref, {
        id: uid,
        name: 'Conta excluída',
        roles: [],
        disabled: true,
        registrationStatus: 'deleted',
        deletionPending: false,
        deletedAt: data.deletedAt,
      });
      tx.set(revisionRef, {
        revision: (revision.data()?.revision || 0) + 1,
        updatedAt: new Date().toISOString(),
      });
    });
  }
  async recoverPending() {
    if (!this.hasPending) return;
    const epoch = this.epoch;
    const pending = await this.db
      .collection('users')
      .where('deletionPending', '==', true)
      .limit(10)
      .get();
    let failed = false;
    for (const doc of pending.docs) {
      try {
        await this.complete(doc.id);
      } catch {
        failed = true;
      }
    }
    if (this.epoch === epoch) this.hasPending = failed || pending.size >= 10;
  }
}
