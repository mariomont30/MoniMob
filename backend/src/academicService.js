import { canReadMaterial, materialOwner } from './domain/materialAccess.js';
import { favoriteSnapshot, favoriteAvailability } from './domain/favorites.js';
import { WORKFLOW_ACTIONS, applyWorkflow, academicEvent, activeAcademicLink } from './domain/workflow.js';
import { sessionAuthorizationIssue, authorizationForSession } from './domain/sessionAuthorization.js';
import { createHash, randomInt } from 'node:crypto';
import { MonitoringService } from './domain/monitoring.js';

export const COLLECTIONS = ['users', 'disciplines', 'professorDisciplines', 'monitorDisciplines', 'sessions', 'reservations', 'waitlist', 'favorites', 'attendanceCodes', 'attendance', 'materials', 'approvals', 'auditLogs', 'notifications', 'linkRequests', 'academicEvents'];
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
  const active = new Set(state.disciplines.filter(d => d.active !== false && (role !== 'student' || !user.disciplineIds || user.disciplineIds.includes(d.id))).map(d => d.id));
  const monitorLinks = state.monitorDisciplines.filter(link => link.monitorId === user.id && validLink(link));
  const professorLinks = state.professorDisciplines.filter(link => link.professorId === user.id && validLink(link));
  const supervised = new Set(professorLinks.map(link => link.disciplineId));
  const ownReservations = state.reservations.filter(item => item.studentId === user.id);
  const reserved = new Set(ownReservations.map(item => item.sessionId));
  const canRead = item => role === 'professor' ? supervised.has(item.disciplineId)
    : role === 'monitor' ? item.monitorId === user.id && monitorLinks.some(link => link.disciplineId === item.disciplineId)
    : active.has(item.disciplineId) && item.status === 'approved' && !item.archived && !sessionAuthorizationIssue(item, authorizationForSession(item, state.monitorDisciplines));
  result.sessions = state.sessions.filter(item => canRead(item) || (role === 'student' && reserved.has(item.id))).map(item => ({ ...item, authorizationInvalid: Boolean(sessionAuthorizationIssue(item, authorizationForSession(item, state.monitorDisciplines))), authorizationLimit: authorizationForSession(item, state.monitorDisciplines)?.validUntil || '', reservedCount: state.reservations.filter(r => r.sessionId === item.id && r.status === 'confirmed').length }));
  const sessions = new Set(result.sessions.map(item => item.id));
  result.materials = state.materials.filter(item => canReadMaterial(state, user, role, item));
  result.linkRequests = (state.linkRequests || []).filter(item => role === 'monitor' ? item.monitorId === user.id : role === 'professor' && item.professorId === user.id);
  const addressedRequests = new Set(result.linkRequests.filter(item => item.professorId === user.id).map(item => item.id));
  result.academicEvents = (state.academicEvents || []).filter(item => role === 'professor' && (supervised.has(item.disciplineId) || addressedRequests.has(item.entityId)));
  result.reservations = state.reservations.filter(item => role === 'student' ? item.studentId === user.id : sessions.has(item.sessionId));
  result.attendance = state.attendance.filter(item => role === 'student' ? item.studentId === user.id : sessions.has(item.sessionId));
  result.waitlist = state.waitlist.filter(item => role === 'student' ? item.studentId === user.id : sessions.has(item.sessionId));
  result.favorites = state.favorites.filter(item => item.studentId === user.id).map(item => {
    const current = state.sessions.find(session => session.id === item.sessionId);
    const allowed = current && active.has(current.disciplineId);
    const available = allowed && !sessionAuthorizationIssue(current, authorizationForSession(current, state.monitorDisciplines));
    return { ...item, session: favoriteSnapshot(allowed ? current : item.snapshot), availability: available ? favoriteAvailability(current) : 'unavailable' };
  });
  result.notifications = state.notifications.filter(item => item.userId === user.id);
  result.approvals = state.approvals.filter(item => role === 'professor' ? item.professorId === user.id && supervised.has(item.disciplineId) : role === 'monitor' && (result.sessions.some(s => s.id === item.entityId) || result.materials.some(m => m.id === item.entityId && materialOwner(m) === user.id)));
  result.monitorDisciplines = role === 'professor' ? state.monitorDisciplines.filter(link => supervised.has(link.disciplineId) && validLink(link)) : monitorLinks;
  result.professorDisciplines = role === 'monitor' ? state.professorDisciplines.filter(item => active.has(item.disciplineId) && activeAcademicLink(item)) : professorLinks;
  result.disciplines = state.disciplines.filter(d => active.has(d.id) || result.sessions.some(s => s.disciplineId === d.id) || result.monitorDisciplines.some(link => link.disciplineId === d.id) || supervised.has(d.id));
  const visibleUsers = new Set([user.id, ...result.sessions.flatMap(item => [item.monitorId, item.professorId]), ...result.materials.flatMap(item => [item.ownerId, item.monitorId, item.professorId])]);
  if (role === 'professor') result.monitorDisciplines.forEach(item => visibleUsers.add(item.monitorId));
  result.linkRequests.forEach(item => { visibleUsers.add(item.monitorId); visibleUsers.add(item.professorId); });
  result.academicEvents.forEach(item => visibleUsers.add(item.actorId));
  if (role === 'monitor') result.professorDisciplines.forEach(item => visibleUsers.add(item.professorId));
  if (role === 'monitor') state.users.filter(item => !item.disabled && item.roles?.includes('professor')).forEach(item => visibleUsers.add(item.id));
  if (role !== 'student') result.reservations.forEach(item => visibleUsers.add(item.studentId));
  result.users = state.users.filter(item => visibleUsers.has(item.id)).map(item => item.id === user.id ? { ...item } : { id: item.id, name: item.name, roles: item.roles });
  // Codes and internal audit records never leave the trusted service.
  return clone(result);
}

const actions = {
  reserve: ['student', 'studentId'], cancelReservation: ['student', 'studentId'], joinWaitlist: ['student', 'studentId'], toggleFavorite: ['student', 'studentId'], setFavorite: ['student', 'studentId'], registerAttendance: ['student', 'studentId'],
  saveSession: ['monitor', 'actorId'], archiveSession: ['monitor', 'actorId'], generateAttendanceCode: ['monitor', 'actorId'], setAttendance: ['monitor', 'monitorId'], saveMaterial: ['monitor', 'actorId'], archiveMaterial: ['monitor', 'actorId'],
  decideApproval: ['professor', 'professorId']
};
const fields = {
  reserve: ['sessionId'], cancelReservation: ['reservationId'], joinWaitlist: ['sessionId'], toggleFavorite: ['sessionId'], setFavorite: ['sessionId', 'favorite'], registerAttendance: ['sessionId', 'code'], saveSession: ['session'], archiveSession: ['sessionId'], generateAttendanceCode: ['sessionId'], setAttendance: ['sessionId', 'studentId', 'status'], saveMaterial: ['material'], archiveMaterial: ['materialId'], decideApproval: ['entityType', 'entityId', 'decision', 'comment', 'expectedRevision']
};
const pick = (value, keys) => Object.fromEntries(keys.filter(key => value[key] !== undefined).map(key => [key, value[key]]));

export function applyAction(state, identity, role, action, input = {}) {
  const user = authorize(state, identity, role);
  if (WORKFLOW_ACTIONS.has(action)) {
    if (action === 'saveMaterial') input = { material: pick(input?.material || {}, ['id','disciplineId','title','type','url','expectedRevision','keepExistingFile']) };
    return applyWorkflow(state, identity, role, action, input);
  }
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
  const addingFavorite = action === 'setFavorite' ? input.favorite === true : action === 'toggleFavorite' && !state.favorites.some(item => item.studentId === user.id && item.sessionId === args.sessionId);
  if (role === 'student' && (['reserve', 'joinWaitlist'].includes(action) || addingFavorite)) {
    if (!session || !visibleState(state, identity, role).sessions.some(item => item.id === session.id) || session.archived || session.status !== 'approved') throw failure('SESSION_UNAVAILABLE', 'Monitoria indisponível.');
  }
  if (action === 'saveSession') args.session = pick(args.session || {}, ['id', 'disciplineId', 'topic', 'description', 'date', 'time', 'durationMinutes', 'modality', 'location', 'capacity', 'monitoringUrl', 'linkValidUntil', 'expectedRevision']);
  if (action === 'saveSession' && !state.disciplines.some(course => course.id === args.session.disciplineId && course.active !== false)) throw failure('INVALID_DISCIPLINE', 'Escolha uma disciplina ativa do catálogo.');
  if (action === 'saveMaterial') args.material = pick(args.material || {}, ['id', 'disciplineId', 'title', 'type', 'url']);
  if (action === 'generateAttendanceCode') args.lifetimeMinutes = state.settings.attendanceCodeMinutes;
  const repository = { read: () => clone(state), write: next => Object.assign(state, next) };
  const domain = new MonitoringService(repository, { codeGenerator: () => String(randomInt(100000, 1000000)) });
  const result = domain[action](args);
  const names = {saveSession: input.session?.id ? 'SESSION_UPDATED' : 'SESSION_PUBLISHED', archiveSession:'SESSION_CANCELLED', reserve:'RESERVATION_CREATED', cancelReservation:'RESERVATION_CANCELLED', registerAttendance:'ATTENDANCE_RECORDED', setAttendance:'ATTENDANCE_RECORDED', decideApproval:String(input.decision || '').toUpperCase()};
  const record = action === 'decideApproval' ? state[input.entityType === 'material' ? 'materials' : 'sessions'].find(x => x.id === input.entityId) : action === 'saveSession' ? result : state.sessions.find(x => x.id === (input.sessionId || result.sessionId));
  if(names[action] && record) {
    const activity = ['reserve','cancelReservation','registerAttendance','setAttendance'].includes(action) ? { ...result, disciplineId:record.disciplineId } : record;
    academicEvent(state,user.id,names[action],activity,record.title || record.topic,[input.comment || '', record.revision ? 'Revisão ' + record.revision : ''].filter(Boolean).join(' · '));
  }
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
    // Presentation step 2: read as the authenticated user and active role.
    // The phone may suggest a session ID, but cannot supply trusted records.
    const state = await this.read(identity, role);
    const ownReservations = state.reservations.filter(item => item.studentId === identity.sub);
    const reserved = new Set(ownReservations.filter(item => item.status === 'confirmed').map(item => item.sessionId));
    const selectedSession = state.sessions.find(item => item.id === requested.sessionId);
    const sorted = [...state.sessions].sort((a, b) =>
      Number(b.id === selectedSession?.id) - Number(a.id === selectedSession?.id)
      || Number(reserved.has(b.id)) - Number(reserved.has(a.id))
      || `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
    // Limit prompt size for latency, and whitelist fields to exclude identity,
    // private participants, passwords, email addresses and attendance codes.
    const sessions = sorted.slice(0, 25).map(item => pick(item, ['id', 'disciplineId', 'topic', 'date', 'time', 'modality', 'location', 'capacity', 'reservedCount', 'status']));
    return {
      sessions,
      selectedSessionId: selectedSession?.id || null,
      disciplines: state.disciplines.map(item => pick(item, ['id', 'code', 'name', 'semester'])),
      materials: state.materials.filter(item => item.status !== 'deleted' && !item.archived).slice(0, 20).map(item => pick(item, ['title', 'disciplineId', 'type', 'status', 'fileName'])),
      ownLinkRequests: state.linkRequests.filter(item => item.monitorId === identity.sub || item.professorId === identity.sub).slice(0, 20).map(item => pick(item, ['disciplineId','status','validUntil'])),
      ownReservations: ownReservations.slice(0, 25).map(item => pick(item, ['sessionId', 'status'])),
      ownAttendance: state.attendance.filter(item => item.studentId === identity.sub).slice(0, 25).map(item => pick(item, ['sessionId', 'status'])),
      academicLinks: { monitor: state.monitorDisciplines.filter(item => item.monitorId === identity.sub).length, professor: state.professorDisciplines.filter(item => item.professorId === identity.sub).length },
      totals: { sessions: state.sessions.length, ownReservations: ownReservations.length },
      truncated: { sessions: sorted.length > 25, materials: state.materials.length > 20, ownReservations: ownReservations.length > 25, ownAttendance: state.attendance.filter(item => item.studentId === identity.sub).length > 25 },
      source: 'MoniMob Cloud Firestore', generatedAt: new Date().toISOString(), timeZone: 'America/Sao_Paulo'
    };
  }
}
