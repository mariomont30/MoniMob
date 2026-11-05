import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeedState } from './fixtures/state.js';
import { DomainError, MonitoringService } from '../src/domain/monitoring.js';
import { MemoryStateRepository } from './fixtures/repository.js';
import { createSessionFilters } from '../src/constants.js';

test('restored advanced search combines every selected academic filter and clearing restores results', () => {
  const repository = new MemoryStateRepository(createSeedState());
  const state = repository.read();
  const target = state.sessions[0];
  const discipline = state.disciplines.find(item => item.id === target.disciplineId);
  const service = new MonitoringService(repository);
  const filters = { ...createSessionFilters(), query: target.topic, disciplineId: target.disciplineId, semester: discipline.semester,
    professorId: target.professorId, monitorId: target.monitorId, modality: target.modality, date: target.date, time: target.time, availableOnly: true };
  assert.deepEqual(service.listSessions(filters).map(item => item.id), [target.id]);
  assert.equal(service.listSessions({ ...filters, date: '2099-01-01' }).length, 0);
  assert.equal(service.listSessions({ ...filters, monitorId: 'another-monitor' }).length, 0);
  assert.ok(service.listSessions(createSessionFilters()).some(item => item.id === target.id));
});

test('shift filter keeps its time boundaries and recommendations exclude past or unpublished sessions', () => {
  const repository = new MemoryStateRepository(createSeedState());
  const state = repository.read();
  const template = state.sessions[0];
  state.sessions = ['00:00','06:00','12:00','18:00'].map((time, index) => ({ ...template, id: 'shift-'+index, date: '2099-06-10', time }));
  state.sessions.push({ ...template, id: 'past', date: '2000-01-01' }, { ...template, id: 'pending', date: '2099-06-10', status: 'pending' });
  repository.write(state);
  const service = new MonitoringService(repository);
  for (const [shift, index] of [['overnight',0],['morning',1],['afternoon',2],['evening',3]])
    assert.deepEqual(service.listSessions({ shift, approvedOnly: true }).map(item => item.id), ['shift-'+index]);
  assert.ok(service.recommendations('student-1').every(item => item.id !== 'past' && item.status === 'approved'));
});

function setup() {
  const state = createSeedState();
  const repository = new MemoryStateRepository(state);
  return { repository, service: new MonitoringService(repository) };
}

function expectCode(code, action) {
  assert.throws(action, error => error instanceof DomainError && error.code === code);
}

test('reserva mantém vínculo com sessão e disciplina e bloqueia duplicidade', () => {
  const { repository, service } = setup();
  const reservation = service.reserve({ sessionId: 'session-1', studentId: 'student-1' });
  assert.equal(reservation.disciplineId, 'T390');
  assert.equal(reservation.sessionId, 'session-1');
  expectCode('DUPLICATE_RESERVATION', () => service.reserve({ sessionId: 'session-1', studentId: 'student-1' }));
  assert.equal(repository.read().reservations.length, 1);
});

test('reserva bloqueia sessão lotada', () => {
  const { repository, service } = setup();
  const state = repository.read();
  state.sessions.find(item => item.id === 'session-1').capacity = 1;
  state.users.push({ id: 'student-2', roles: ['student'] });
  state.reservations.push({ id: 'existing', sessionId: 'session-1', disciplineId: 'T390', studentId: 'student-2', status: 'confirmed' });
  repository.write(state);
  expectCode('FULL_SESSION', () => service.reserve({ sessionId: 'session-1', studentId: 'student-1' }));
});

test('reserva bloqueia conflito real de data e intervalo', () => {
  const { repository, service } = setup();
  const state = repository.read();
  const original = state.sessions.find(item => item.id === 'session-1');
  const conflicting = state.sessions.find(item => item.id === 'session-2');
  conflicting.date = original.date;
  conflicting.time = '19:00';
  conflicting.durationMinutes = 60;
  repository.write(state);
  service.reserve({ sessionId: 'session-1', studentId: 'student-1' });
  expectCode('SCHEDULE_CONFLICT', () => service.reserve({ sessionId: 'session-2', studentId: 'student-1' }));
});

test('presença exige reserva, código da própria sessão e impede duplicidade', () => {
  const { service } = setup();
  const session = service.state().sessions.find(item => item.id === 'session-1');
  const now = Date.parse(`${session.date}T${session.time}:00-03:00`) - 10 * 60_000;
  expectCode('RESERVATION_REQUIRED', () => service.registerAttendance({ studentId: 'student-1', sessionId: 'session-1', code: '123456', now }));
  service.reserve({ sessionId: 'session-1', studentId: 'student-1' });
  const code = service.generateAttendanceCode({ actorId: 'monitor-1', sessionId: 'session-1', now });
  expectCode('INVALID_CODE', () => service.registerAttendance({ studentId: 'student-1', sessionId: 'session-1', code: '000000', now }));
  const attendance = service.registerAttendance({ studentId: 'student-1', sessionId: 'session-1', code: code.code, now });
  assert.equal(attendance.disciplineId, 'T390');
  expectCode('DUPLICATE_ATTENDANCE', () => service.registerAttendance({ studentId: 'student-1', sessionId: 'session-1', code: code.code, now }));
});

test('código expirado não registra presença', () => {
  const { service } = setup();
  const session = service.state().sessions.find(item => item.id === 'session-1');
  const createdAt = Date.parse(`${session.date}T${session.time}:00-03:00`) - 10 * 60_000;
  service.reserve({ sessionId: 'session-1', studentId: 'student-1' });
  const code = service.generateAttendanceCode({ actorId: 'monitor-1', sessionId: 'session-1', now: createdAt, lifetimeMinutes: 5 });
  expectCode('EXPIRED_CODE', () => service.registerAttendance({ studentId: 'student-1', sessionId: 'session-1', code: code.code, now: createdAt + 6 * 60_000 }));
});

test('monitor só cria sessão em disciplina vinculada e item nasce pendente', () => {
  const { service } = setup();
  const saved = service.saveSession({ actorId: 'monitor-1', session: { disciplineId: 'T390', topic: 'Pilhas', date: '2030-05-10', time: '18:00', capacity: 12 } });
  assert.equal(saved.status, 'pending');
  assert.equal(saved.professorId, 'professor-1');
  expectCode('FORBIDDEN', () => service.saveSession({ actorId: 'monitor-1', session: { disciplineId: 'T197', topic: 'Expo', date: '2030-05-10', time: '18:00' } }));
});

test('CRUD de sessão permite atualização própria e arquivamento lógico', () => {
  const { repository, service } = setup();
  const original = repository.read().sessions.find(item => item.id === 'session-1');
  const updated = service.saveSession({ actorId: 'monitor-1', session: { ...original, topic: 'Árvores AVL revisadas' } });
  assert.equal(updated.topic, 'Árvores AVL revisadas');
  assert.equal(updated.status, 'pending');
  service.archiveSession({ actorId: 'monitor-1', sessionId: 'session-1' });
  assert.equal(repository.read().sessions.find(item => item.id === 'session-1').archived, true);
});

test('aprovação é exclusiva do professor vinculado à disciplina', () => {
  const { repository, service } = setup();
  const state = repository.read();
  state.users.push({ id: 'professor-2', roles: ['professor'] });
  state.professorDisciplines.push({ professorId: 'professor-2', disciplineId: 'T197' });
  repository.write(state);
  expectCode('FORBIDDEN', () => service.decideApproval({ professorId: 'professor-2', entityType: 'session', entityId: 'session-3', decision: 'approved' }));
  const approval = service.decideApproval({ professorId: 'professor-1', entityType: 'session', entityId: 'session-3', decision: 'approved' });
  assert.equal(approval.disciplineId, 'T333');
  assert.equal(repository.read().sessions.find(item => item.id === 'session-3').status, 'approved');
  expectCode('NOT_PENDING', () => service.decideApproval({ professorId: 'professor-1', entityType: 'session', entityId: 'session-3', decision: 'rejected' }));
});

test('material mantém relacionamento e passa por aprovação', () => {
  const { repository, service } = setup();
  const material = service.saveMaterial({ actorId: 'monitor-1', material: { disciplineId: 'T390', title: 'Lista de árvores', type: 'PDF', url: 'https://example.invalid/a' } });
  assert.equal(material.status, 'pending');
  service.decideApproval({ professorId: 'professor-1', entityType: 'material', entityId: material.id, decision: 'approved' });
  assert.equal(repository.read().materials.find(item => item.id === material.id).status, 'approved');
});

test('edição de material aprovado retorna o item para validação', () => {
  const { repository, service } = setup();
  const approved = repository.read().materials.find(item => item.id === 'material-1');
  const edited = service.saveMaterial({ actorId: 'monitor-1', material: { ...approved, title: 'Resumo atualizado — Árvores binárias' } });
  assert.equal(edited.id, 'material-1');
  assert.equal(edited.status, 'pending');
  assert.equal(repository.read().materials.find(item => item.id === 'material-1').title, 'Resumo atualizado — Árvores binárias');
});

test('filtros combinam semestre, disciplina, modalidade e vagas', () => {
  const { service } = setup();
  const result = service.listSessions({ semester: 3, disciplineId: 'T390', modality: 'Presencial', availableOnly: true, approvedOnly: true });
  assert.deepEqual(result.map(item => item.id), ['session-1']);
});


test('lista de espera promove o primeiro aluno quando uma vaga é cancelada', () => {
  const { repository, service } = setup();
  const state = repository.read();
  state.sessions.find(item => item.id === 'session-1').capacity = 1;
  state.users.push({ id: 'student-2', roles: ['student'] });
  repository.write(state);
  const first = service.reserve({ sessionId: 'session-1', studentId: 'student-1' });
  const waiting = service.joinWaitlist({ sessionId: 'session-1', studentId: 'student-2' });
  assert.equal(waiting.status, 'waiting');
  service.cancelReservation({ reservationId: first.id, studentId: 'student-1' });
  const result = repository.read();
  assert.equal(result.waitlist.find(item => item.id === waiting.id).status, 'promoted');
  assert.ok(result.reservations.some(item => item.studentId === 'student-2' && item.status === 'confirmed'));
});

test('cancelamento respeita janela mínima configurada', () => {
  const { repository, service } = setup();
  const reservation = service.reserve({ sessionId: 'session-1', studentId: 'student-1' });
  const session = repository.read().sessions.find(item => item.id === 'session-1');
  expectCode('CANCELLATION_DEADLINE', () => service.cancelReservation({ reservationId: reservation.id, studentId: 'student-1', now: Date.parse(`${session.date}T${session.time}:00-03:00`) - 60 * 60_000 }));
});

test('monitor registra presença ou ausência manualmente por sessão', () => {
  const { repository, service } = setup();
  service.reserve({ sessionId: 'session-1', studentId: 'student-1' });
  const session = service.state().sessions.find(item => item.id === 'session-1');
  const now = Date.parse(`${session.date}T${session.time}:00-03:00`) + 5 * 60_000;
  service.setAttendance({ monitorId: 'monitor-1', sessionId: 'session-1', studentId: 'student-1', status: 'absent', now });
  service.setAttendance({ monitorId: 'monitor-1', sessionId: 'session-1', studentId: 'student-1', status: 'present', now });
  const records = repository.read().attendance.filter(item => item.sessionId === 'session-1' && item.studentId === 'student-1');
  assert.equal(records.length, 1);
  assert.equal(records[0].status, 'present');
  assert.equal(records[0].source, 'manual');
});

test('alteração de sessão notifica aluno reservado e professor', () => {
  const { repository, service } = setup();
  service.reserve({ sessionId: 'session-1', studentId: 'student-1' });
  const original = repository.read().sessions.find(item => item.id === 'session-1');
  service.saveSession({ actorId: 'monitor-1', session: { ...original, time: '17:30' } });
  const notifications = repository.read().notifications;
  assert.ok(notifications.some(item => item.userId === 'student-1' && item.title === 'Monitoria alterada'));
  assert.ok(notifications.some(item => item.userId === 'professor-1' && item.title === 'Sessão alterada'));
});

test('professor solicita ajuste apenas com observação e monitor é avisado', () => {
  const { repository, service } = setup();
  expectCode('COMMENT_REQUIRED', () => service.decideApproval({ professorId: 'professor-1', entityType: 'session', entityId: 'session-3', decision: 'adjustments_requested' }));
  service.decideApproval({ professorId: 'professor-1', entityType: 'session', entityId: 'session-3', decision: 'adjustments_requested', comment: 'Corrigir o local.' });
  const state = repository.read();
  assert.equal(state.sessions.find(item => item.id === 'session-3').status, 'adjustments_requested');
  assert.ok(state.notifications.some(item => item.userId === 'monitor-1' && item.title === 'Ajustes solicitados'));
});

test('favoritos influenciam recomendações e geram auditoria', () => {
  const { repository, service } = setup();
  assert.equal(service.toggleFavorite({ studentId: 'student-1', sessionId: 'session-2' }), true);
  assert.equal(service.recommendations('student-1')[0].disciplineId, 'T164');
  assert.ok(repository.read().auditLogs.some(item => item.action === 'FAVORITE'));
  assert.equal(service.toggleFavorite({ studentId: 'student-1', sessionId: 'session-2' }), false);
});

test('relatório aceita disciplina e período e exporta CSV', () => {
  const { repository, service } = setup();
  service.reserve({ sessionId: 'session-1', studentId: 'student-1' });
  const pastState = repository.read();
  const session = pastState.sessions.find(item => item.id === 'session-1');
  session.date = new Date(Date.now() - 2 * 24 * 60 * 60_000 - 3 * 60 * 60_000).toISOString().slice(0, 10);
  repository.write(pastState);
  const completedAt = Date.parse(`${session.date}T${session.time}:00-03:00`) + session.durationMinutes * 60_000 + 5 * 60_000;
  service.setAttendance({ monitorId: 'monitor-1', sessionId: 'session-1', studentId: 'student-1', status: 'present', now: completedAt });
  const report = service.reportForProfessor('professor-1', { disciplineId: 'T390', startDate: session.date, endDate: session.date }, completedAt);
  assert.equal(report.sessions, 1); assert.equal(report.attendanceRate, 100);
  assert.match(service.exportReportCsv('professor-1', { disciplineId: 'T390' }), /Estrutura de dados/);
});

test('link de monitoria respeita validade', () => {
  const { repository, service } = setup();
  const state = repository.read(); const session = state.sessions.find(item => item.id === 'session-2');
  session.linkValidUntil = '2030-01-01T10:00:00Z'; repository.write(state);
  assert.equal(service.validateMonitoringLink('session-2', Date.parse('2029-01-01T10:00:00Z')), session.monitoringUrl);
  expectCode('LINK_EXPIRED', () => service.validateMonitoringLink('session-2', Date.parse('2031-01-01T10:00:00Z')));
});


test('valida data, horário, capacidade e HTTPS nos CRUDs', () => {
  const { service } = setup();
  expectCode('INVALID_DATE', () => service.saveSession({ actorId: 'monitor-1', session: { disciplineId: 'T390', topic: 'Teste', date: '10/05/2030', time: '18:00' } }));
  expectCode('INVALID_TIME', () => service.saveSession({ actorId: 'monitor-1', session: { disciplineId: 'T390', topic: 'Teste', date: '2030-05-10', time: '28:00' } }));
  expectCode('INVALID_CAPACITY', () => service.saveSession({ actorId: 'monitor-1', session: { disciplineId: 'T390', topic: 'Teste', date: '2030-05-10', time: '18:00', capacity: 0 } }));
  expectCode('INVALID_URL', () => service.saveMaterial({ actorId: 'monitor-1', material: { disciplineId: 'T390', title: 'Teste', url: 'http://inseguro.example' } }));
  expectCode('INVALID_DATE', () => service.saveSession({ actorId: 'monitor-1', session: { disciplineId: 'T390', topic: 'Data impossível', date: '2030-02-31', time: '18:00' } }));
  expectCode('ONLINE_LINK_REQUIRED', () => service.saveSession({ actorId: 'monitor-1', session: { disciplineId: 'T390', topic: 'Aula online', date: '2030-05-10', time: '18:00', modality: 'Online' } }));
});


test('código de presença fica bloqueado antes da janela autorizada e após seu encerramento', () => {
  const { service } = setup();
  const session = service.state().sessions.find(item => item.id === 'session-1');
  const start = Date.parse(`${session.date}T${session.time}:00-03:00`);
  expectCode('ATTENDANCE_WINDOW_CLOSED', () => service.generateAttendanceCode({ actorId: 'monitor-1', sessionId: session.id, now: start - 16 * 60_000 }));
  const code = service.generateAttendanceCode({ actorId: 'monitor-1', sessionId: session.id, now: start - 15 * 60_000 });
  assert.ok(code.code);
  expectCode('ATTENDANCE_WINDOW_CLOSED', () => service.registerAttendance({ studentId: 'student-1', sessionId: session.id, code: code.code, now: start + session.durationMinutes * 60_000 + 31 * 60_000 }));
});

test('presença manual não pode ser lançada antes do início nem depois do prazo de ajuste', () => {
  const { service } = setup();
  const session = service.state().sessions.find(item => item.id === 'session-1');
  service.reserve({ sessionId: session.id, studentId: 'student-1' });
  const start = Date.parse(`${session.date}T${session.time}:00-03:00`);
  expectCode('ATTENDANCE_WINDOW_CLOSED', () => service.setAttendance({ monitorId: 'monitor-1', sessionId: session.id, studentId: 'student-1', status: 'present', now: start - 1 }));
  expectCode('ATTENDANCE_WINDOW_CLOSED', () => service.setAttendance({ monitorId: 'monitor-1', sessionId: session.id, studentId: 'student-1', status: 'present', now: start + session.durationMinutes * 60_000 + 24 * 60 * 60_000 + 1 }));
});

test('conflitos de horário consideram sessões que atravessam a meia-noite', () => {
  const { repository, service } = setup();
  const state = repository.read();
  const first = state.sessions.find(item => item.id === 'session-1');
  const second = state.sessions.find(item => item.id === 'session-2');
  first.date = '2030-05-10'; first.time = '23:30'; first.durationMinutes = 90;
  second.date = '2030-05-11'; second.time = '00:30'; second.durationMinutes = 60;
  repository.write(state);
  service.reserve({ sessionId: first.id, studentId: 'student-1' });
  expectCode('SCHEDULE_CONFLICT', () => service.reserve({ sessionId: second.id, studentId: 'student-1' }));
});

test('arquivar sessão encerra a fila de espera e desativa códigos existentes', () => {
  const { repository, service } = setup();
  const state = repository.read();
  state.sessions.find(item => item.id === 'session-1').capacity = 1;
  state.users.push({ id: 'student-2', roles: ['student'] });
  state.waitlist.push({ id: 'wait-1', sessionId: 'session-1', studentId: 'student-2', status: 'waiting', createdAt: new Date().toISOString() });
  state.attendanceCodes.push({ id: 'code-1', sessionId: 'session-1', active: true });
  repository.write(state);
  service.archiveSession({ actorId: 'monitor-1', sessionId: 'session-1' });
  const after = repository.read();
  assert.equal(after.waitlist.find(item => item.id === 'wait-1').status, 'cancelled');
  assert.equal(after.attendanceCodes.find(item => item.id === 'code-1').active, false);
});


test('reserva e link online falham de forma segura diante de horários ou validade corrompidos', () => {
  const { repository, service } = setup();
  const state = repository.read();
  const session = state.sessions.find(item => item.id === 'session-1');
  session.date = '2030-02-31';
  repository.write(state);
  expectCode('INVALID_SESSION_DATE', () => service.reserve({ sessionId: 'session-1', studentId: 'student-1' }));

  const fresh = setup();
  const data = fresh.repository.read();
  const online = data.sessions.find(item => item.id === 'session-2');
  online.modality = 'Online';
  online.monitoringUrl = 'https://meet.example.invalid/session';
  online.linkValidUntil = 'not-a-date';
  fresh.repository.write(data);
  expectCode('LINK_EXPIRED', () => fresh.service.validateMonitoringLink('session-2', Date.now()));
});
