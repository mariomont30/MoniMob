import { createHash, randomInt } from 'node:crypto';
import { MonitoringService } from './domain/monitoring.js';

export const COLLECTIONS = ['users', 'disciplines', 'professorDisciplines', 'monitorDisciplines', 'sessions', 'reservations', 'waitlist', 'favorites', 'attendanceCodes', 'attendance', 'materials', 'approvals', 'auditLogs', 'notifications'];
const clone = value => JSON.parse(JSON.stringify(value));
export const failure = (code, message, status = 400) => Object.assign(new Error(message), { code, status });
export function emptyState() {
  return { ...Object.fromEntries(COLLECTIONS.map(name => [name, []])), settings: { cancellationWindowHours: 2, attendanceCodeMinutes: 20, attendanceEarlyWindowMinutes: 15, attendanceLateWindowMinutes: 30, manualAttendanceGraceHours: 24 } };
}
const validLink = link => link.active !== false && (!link.validFrom || Date.parse(link.validFrom) <= Date.now()) && (!link.monitorId || Boolean(link.validUntil)) && (!link.validUntil || Date.parse(link.validUntil) > Date.now());
function authorize(state, identity, role) {
  const user = state.users.find(item => item.id === identity.sub);
  if (!user || !identity.roles.includes(role) || !user.roles?.includes(role) || user.disabled) throw failure('FORBIDDEN', 'Perfil não autorizado.', 403);
  return user;
}

export function visibleState(state, identity, role) {
  const user = authorize(state, identity, role);
  const result = emptyState();
  result.settings = clone(state.settings);
  const active = new Set(state.disciplines.filter(d => d.active !== false && (!user.disciplineIds || user.disciplineIds.includes(d.id))).map(d => d.id));
  const monitorLinks = state.monitorDisciplines.filter(link => link.monitorId === user.id && validLink(link));
  const professorLinks = state.professorDisciplines.filter(link => link.professorId === user.id && validLink(link));
  const supervised = new Set(professorLinks.map(link => link.disciplineId));
  const ownReservations = state.reservations.filter(item => item.studentId === user.id);
  const reserved = new Set(ownReservations.map(item => item.sessionId));
  const canRead = item => role === 'professor' ? supervised.has(item.disciplineId)
    : role === 'monitor' ? item.monitorId === user.id && monitorLinks.some(link => link.disciplineId === item.disciplineId)
    : active.has(item.disciplineId) && item.status === 'approved' && !item.archived;
  result.sessions = state.sessions.filter(item => canRead(item) || (role === 'student' && reserved.has(item.id))).map(item => ({ ...item, reservedCount: state.reservations.filter(r => r.sessionId === item.id && r.status === 'confirmed').length }));
  const sessions = new Set(result.sessions.map(item => item.id));
  result.materials = state.materials.filter(canRead);
  result.reservations = state.reservations.filter(item => role === 'student' ? item.studentId === user.id : sessions.has(item.sessionId));
  result.attendance = state.attendance.filter(item => role === 'student' ? item.studentId === user.id : sessions.has(item.sessionId));
  result.waitlist = state.waitlist.filter(item => role === 'student' ? item.studentId === user.id : sessions.has(item.sessionId));
  result.favorites = state.favorites.filter(item => item.studentId === user.id);
  result.notifications = state.notifications.filter(item => item.userId === user.id);
  result.approvals = state.approvals.filter(item => role === 'professor' ? item.professorId === user.id && supervised.has(item.disciplineId) : role === 'monitor' && (result.sessions.some(s => s.id === item.entityId) || result.materials.some(m => m.id === item.entityId)));
  result.monitorDisciplines = role === 'professor' ? state.monitorDisciplines.filter(link => supervised.has(link.disciplineId) && validLink(link)) : monitorLinks;
  result.professorDisciplines = professorLinks;
  result.disciplines = state.disciplines.filter(d => active.has(d.id) || result.sessions.some(s => s.disciplineId === d.id) || result.monitorDisciplines.some(link => link.disciplineId === d.id) || supervised.has(d.id));
  const visibleUsers = new Set([user.id, ...result.sessions.flatMap(item => [item.monitorId, item.professorId]), ...result.materials.flatMap(item => [item.monitorId, item.professorId])]);
  if (role === 'professor') result.monitorDisciplines.forEach(item => visibleUsers.add(item.monitorId));
  if (role !== 'student') result.reservations.forEach(item => visibleUsers.add(item.studentId));
  result.users = state.users.filter(item => visibleUsers.has(item.id)).map(item => item.id === user.id ? { ...item } : { id: item.id, name: item.name, roles: item.roles });
  // Codes and internal audit records never leave the trusted service.
  return clone(result);
}

const actions = {
  reserve: ['student', 'studentId'], cancelReservation: ['student', 'studentId'], joinWaitlist: ['student', 'studentId'], toggleFavorite: ['student', 'studentId'], registerAttendance: ['student', 'studentId'],
  saveSession: ['monitor', 'actorId'], archiveSession: ['monitor', 'actorId'], generateAttendanceCode: ['monitor', 'actorId'], setAttendance: ['monitor', 'monitorId'], saveMaterial: ['monitor', 'actorId'], archiveMaterial: ['monitor', 'actorId'],
  decideApproval: ['professor', 'professorId']
};
const fields = {
  reserve: ['sessionId'], cancelReservation: ['reservationId'], joinWaitlist: ['sessionId'], toggleFavorite: ['sessionId'], registerAttendance: ['sessionId', 'code'], saveSession: ['session'], archiveSession: ['sessionId'], generateAttendanceCode: ['sessionId'], setAttendance: ['sessionId', 'studentId', 'status'], saveMaterial: ['material'], archiveMaterial: ['materialId'], decideApproval: ['entityType', 'entityId', 'decision', 'comment']
};
const pick = (value, keys) => Object.fromEntries(keys.filter(key => value[key] !== undefined).map(key => [key, value[key]]));

export function applyAction(state, identity, role, action, input = {}) {
  const user = authorize(state, identity, role);
  if (['recordSignIn', 'recordSignOut'].includes(action)) {
    state.auditLogs.push({ id: 'auth-' + Date.now() + '-' + Math.random().toString(36).slice(2), actorId: user.id, action: action === 'recordSignIn' ? 'SIGN_IN' : 'SIGN_OUT', createdAt: new Date().toISOString() });
    return true;
  }
  if (action === 'markNotificationsRead') {
    state.notifications.filter(item => item.userId === user.id).forEach(item => { item.read = true; });
    return true;
  }
  const definition = actions[action];
  if (!definition || role !== definition[0]) throw failure('FORBIDDEN', 'Operação não autorizada nesta área.', 403);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw failure('INVALID_INPUT', 'Dados inválidos.');
  const args = { ...pick(input, fields[action]), [definition[1]]: user.id };
  // Scope checks apply even to methods that only validate record ownership.
  const session = state.sessions.find(item => item.id === args.sessionId);
  const material = state.materials.find(item => item.id === args.materialId);
  const disciplineId = args.session?.disciplineId || args.material?.disciplineId || session?.disciplineId || material?.disciplineId;
  if (role === 'monitor' && !state.monitorDisciplines.some(link => link.monitorId === user.id && link.disciplineId === disciplineId && validLink(link))) throw failure('LINK_EXPIRED', 'Vínculo de monitoria ausente ou expirado.', 403);
  if (role === 'professor') {
    const entity = (args.entityType === 'session' ? state.sessions : state.materials).find(item => item.id === args.entityId);
    if (!entity || !state.professorDisciplines.some(link => link.professorId === user.id && link.disciplineId === entity.disciplineId && validLink(link))) throw failure('FORBIDDEN', 'Item fora do seu vínculo de supervisão.', 403);
  }
  if (role === 'student' && ['reserve', 'joinWaitlist', 'toggleFavorite'].includes(action)) {
    if (!session || !visibleState(state, identity, role).sessions.some(item => item.id === session.id) || session.archived || session.status !== 'approved') throw failure('SESSION_UNAVAILABLE', 'Monitoria indisponível.');
  }
  if (action === 'saveSession') args.session = pick(args.session || {}, ['id', 'disciplineId', 'topic', 'description', 'date', 'time', 'durationMinutes', 'modality', 'location', 'capacity', 'monitoringUrl', 'linkValidUntil']);
  if (action === 'saveMaterial') args.material = pick(args.material || {}, ['id', 'disciplineId', 'title', 'type', 'url']);
  if (action === 'generateAttendanceCode') args.lifetimeMinutes = state.settings.attendanceCodeMinutes;
  const repository = { read: () => clone(state), write: next => Object.assign(state, next) };
  const domain = new MonitoringService(repository, { codeGenerator: () => String(randomInt(100000, 1000000)) });
  const result = domain[action](args);
  // The durable audit log contains metadata, never attendance codes or user credentials.
  return result;
}

export class AcademicService {
  constructor(store) { this.store = store; }
  async read(identity, role) { return visibleState(await this.store.read(identity, role), identity, role); }
  async execute(identity, role, command) {
    if (!command || !/^[A-Za-z0-9_-]{12,100}$/.test(command.id || '')) throw failure('COMMAND_REQUIRED', 'Identificador de operação inválido.');
    const fingerprint = createHash('sha256').update(JSON.stringify([role, command.action, command.input || {}])).digest('hex');
    if (['recordSignIn', 'recordSignOut'].includes(command.action) && this.store.recordAuthEvent) {
      return this.store.recordAuthEvent(identity.sub + '_' + command.id, fingerprint, identity, role, command.action);
    }
    return this.store.transact(identity.sub + '_' + command.id, fingerprint, state => applyAction(state, identity, role, command.action, command.input));
  }
  async aiContext(identity, role, requested = {}) {
    const state = await this.read(identity, role);
    const sessions = state.sessions.filter(item => !requested.sessionId || item.id === requested.sessionId).slice(0, 25).map(item => pick(item, ['id', 'disciplineId', 'topic', 'date', 'time', 'modality', 'location', 'capacity', 'reservedCount', 'status']));
    return { sessions, disciplines: state.disciplines.map(item => pick(item, ['id', 'code', 'name', 'semester'])), materials: state.materials.slice(0, 20).map(item => pick(item, ['title', 'disciplineId', 'type', 'status'])), ownReservations: state.reservations.filter(item => item.studentId === identity.sub).map(item => pick(item, ['sessionId', 'status'])), source: 'MoniMob Cloud Firestore', generatedAt: new Date().toISOString() };
  }
}
