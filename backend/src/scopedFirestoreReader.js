import { materialOwner } from './domain/materialAccess.js';
import { FieldPath } from 'firebase-admin/firestore';
import { emptyState, failure } from './academicService.js';

const ids = values => [...new Set(values.filter(Boolean))];
const merge = (...groups) => [...new Map(groups.flat().map(item => [item.id, item])).values()];
const validLink = link => link.active !== false && (!link.validFrom || Date.parse(link.validFrom) <= Date.now())
  && (!link.monitorId || Boolean(link.validUntil)) && (!link.validUntil || Date.parse(link.validUntil) > Date.now());

// Read only the relationships needed for the authorized view. All phases share
// one read-only snapshot, so seat counts and reservation history remain coherent.
export async function readScopedState(db, tx, identity, role) {
  const state = emptyState();
  let reads = 0;
  const row = doc => ({ ...doc.data(), id: doc.id });
  async function query(name, field, values) {
    const unique = ids(values);
    if (!unique.length) return [];
    const batches = [];
    for (let i = 0; i < unique.length; i += 30) batches.push(unique.slice(i, i + 30));
    const groups = await Promise.all(batches.map(async batch => {
      const snapshot = await tx.get(db.collection(name).where(field, 'in', batch).limit(2001));
      reads += snapshot.size;
      if (snapshot.size > 2000 || reads > 10000) throw failure('PILOT_LIMIT', 'Limite de dados do piloto atingido. A consulta precisa ser paginada.', 503);
      return snapshot.docs.map(row);
    }));
    return merge(...groups);
  }
  const byId = (name, values) => query(name, FieldPath.documentId(), values);
  const [profile, settings] = await Promise.all([tx.get(db.doc('users/' + identity.sub)), tx.get(db.doc('system/settings'))]);
  const user = profile.exists ? row(profile) : null;
  if (!user || user.disabled || !identity.roles.includes(role) || !user.roles?.includes(role)) throw failure('FORBIDDEN', 'Perfil não autorizado.', 403);
  if (settings.exists) state.settings = { ...state.settings, ...settings.data() };
  // A tutor must be able to address an actual professor before that professor
  // has selected a course. The response projection exposes names/IDs, not email.
  const registeredProfessors = role === 'monitor'
    ? (await tx.get(db.collection('users').where('roles', 'array-contains', 'professor').limit(2001))).docs.map(row).filter(item => !item.disabled)
    : [];
  if (registeredProfessors.length > 2000) throw failure('PILOT_LIMIT', 'O diretório de professores precisa ser paginado.', 503);
  [state.disciplines, state.monitorDisciplines, state.professorDisciplines, state.favorites, state.notifications] = await Promise.all([
    role === 'student' && user.disciplineIds ? byId('disciplines', user.disciplineIds) : (async () => {
      const s = await tx.get(db.collection('disciplines').limit(2001));
      if (s.size > 2000) throw failure('PILOT_LIMIT', 'O catálogo precisa ser paginado.', 503);
      return s.docs.map(row);
    })(),
    query('monitorDisciplines', 'monitorId', [user.id]), query('professorDisciplines', 'professorId', [user.id]),
    query('favorites', 'studentId', [user.id]), query('notifications', 'userId', [user.id])
  ]);
  const active = state.disciplines.filter(d => d.active !== false).map(d => d.id);
  const supervised = state.professorDisciplines.filter(validLink).map(link => link.disciplineId);
  const monitorCourses = state.monitorDisciplines.filter(validLink).map(link => link.disciplineId);
  state.linkRequests = role === 'monitor' ? await query('linkRequests','monitorId',[user.id]) : role === 'professor' ? await query('linkRequests','professorId',[user.id]) : [];
  state.academicEvents = role === 'professor' ? merge(
    await query('academicEvents','disciplineId',supervised),
    await query('academicEvents','entityId',state.linkRequests.filter(item=>!supervised.includes(item.disciplineId)).map(item=>item.id))
  ) : [];
  if(role === 'monitor') state.professorDisciplines = await query('professorDisciplines','disciplineId',active);
  const ownReservations = role === 'student' ? await query('reservations', 'studentId', [user.id]) : [];
  const sessionField = role === 'monitor' ? 'monitorId' : 'disciplineId';
  const scope = role === 'monitor' ? (monitorCourses.length ? [user.id] : []) : role === 'professor' ? supervised : active;
  [state.sessions, state.materials] = await Promise.all([query('sessions', sessionField, scope), query('materials', sessionField, scope)]);
  if (role === 'student') {
    state.sessions = merge(state.sessions.filter(x => x.status === 'approved' && !x.archived), await byId('sessions', [...ownReservations.map(x => x.sessionId), ...state.favorites.map(x => x.sessionId)]));
    state.materials = state.materials.filter(x => x.status === 'approved' && !x.archived);
  } else if (role === 'monitor') {
    state.sessions = state.sessions.filter(x => monitorCourses.includes(x.disciplineId));
    state.materials = await query('materials','ownerId',[user.id]).then(owned=>merge(owned,state.materials));
    state.materials = merge(state.materials,await query('materials','monitorId',[user.id]),await query('materials','disciplineId',monitorCourses));
  }
  if(role === 'student') state.monitorDisciplines = merge(state.monitorDisciplines, await query('monitorDisciplines','monitorId',state.sessions.map(x=>x.monitorId)));
  const sessions = state.sessions.map(x => x.id);
  [state.reservations, state.attendance, state.waitlist, state.approvals] = await Promise.all([
    query('reservations', 'sessionId', sessions),
    query('attendance', role === 'student' ? 'studentId' : 'sessionId', role === 'student' ? [user.id] : sessions),
    query('waitlist', role === 'student' ? 'studentId' : 'sessionId', role === 'student' ? [user.id] : sessions),
    role === 'professor' ? query('approvals', 'professorId', [user.id])
      : role === 'monitor' ? query('approvals', 'entityId', [...sessions, ...state.materials.filter(x => materialOwner(x) === user.id).map(x => x.id)]) : []
  ]);
  state.reservations = merge(state.reservations, ownReservations);
  if (role === 'professor') state.monitorDisciplines = await query('monitorDisciplines', 'disciplineId', supervised);
  const disciplineIds = [...state.sessions, ...state.materials, ...state.monitorDisciplines, ...state.professorDisciplines].map(x => x.disciplineId);
  const loaded = new Set(state.disciplines.map(x => x.id));
  state.disciplines = merge(state.disciplines, await byId('disciplines', ids(disciplineIds).filter(id => !loaded.has(id))));
  const users = [user.id, ...state.sessions.flatMap(x => [x.monitorId, x.professorId]), ...state.materials.flatMap(x => [x.ownerId, x.monitorId, x.professorId])];
  if (role !== 'student') users.push(...state.reservations.map(x => x.studentId));
  if (role === 'professor') users.push(...state.monitorDisciplines.filter(validLink).map(x => x.monitorId));
  users.push(...state.linkRequests.flatMap(x=>[x.monitorId,x.professorId]),...state.academicEvents.map(x=>x.actorId));
  if(role==='monitor') users.push(...state.professorDisciplines.filter(validLink).map(x=>x.professorId));
  state.users = merge(await byId('users', ids(users).filter(id => id !== user.id)), registeredProfessors, [user]);
  // Audit history and attendance codes are neither queried nor returned here.
  return state;
}
