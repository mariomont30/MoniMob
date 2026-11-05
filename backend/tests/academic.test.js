import test from 'node:test';
import assert from 'node:assert/strict';
import { AcademicService, applyAction, visibleState } from '../src/academicService.js';
import { createSeedState } from '../../mobile-expo/tests/fixtures/state.js';
import { sendReminders } from '../src/reminders.js';

function state() {
  const value = createSeedState();
  value.monitorDisciplines.forEach(link => { link.validUntil = '2099-12-31T23:59:59Z'; });
  return value;
}
const student = { sub: 'student-1', roles: ['student'] };
const monitor = { sub: 'monitor-1', roles: ['student', 'monitor'] };
const professor = { sub: 'professor-1', roles: ['professor'] };

test('a student cannot select monitor operations or forge the actor', () => {
  const value = state();
  assert.throws(() => applyAction(value, student, 'monitor', 'saveSession', {}), /autorizado/);
  applyAction(value, student, 'student', 'reserve', { sessionId: 'session-1', studentId: 'monitor-1' });
  assert.equal(value.reservations[0].studentId, 'student-1');
});
test('expired monitoring links deny writes and hide the management scope', () => {
  const value = state(); value.monitorDisciplines.forEach(link => { link.validUntil = '2000-01-01T00:00:00Z'; });
  assert.throws(() => applyAction(value, monitor, 'monitor', 'archiveSession', { sessionId: 'session-1' }), /expirado/);
  assert.equal(visibleState(value, monitor, 'monitor').sessions.length, 0);
});
test('student state hides private participants, codes, pending materials and profiles', () => {
  const value = state();
  value.users.push({ id: 'unrelated', name: 'Private', email: 'private@example.com', roles: ['student'] });
  value.reservations.push({ id: 'other', studentId: 'unrelated', sessionId: 'session-1', status: 'confirmed' });
  value.attendanceCodes.push({ id: 'secret', sessionId: 'session-1', code: '123456' });
  const result = visibleState(value, student, 'student');
  assert.equal(result.attendanceCodes.length, 0);
  assert.equal(result.reservations.length, 0);
  assert.equal(result.materials.length, 1);
  assert.equal(result.users.some(item => item.id === 'unrelated'), false);
  assert.equal(result.users.find(item => item.id === 'monitor-1').email, undefined);
  assert.equal(result.sessions.find(item => item.id === 'session-1').reservedCount, 1);
});
test('monitor participants and professor decisions stay inside their scope', () => {
  const value = state();
  value.sessions.push({ ...value.sessions[0], id: 'foreign', disciplineId: 'foreign-course', monitorId: 'foreign-monitor', professorId: 'foreign-professor' });
  assert.equal(visibleState(value, professor, 'professor').sessions.some(item => item.id === 'foreign'), false);
  assert.throws(() => applyAction(value, professor, 'professor', 'decideApproval', { entityType: 'session', entityId: 'foreign', decision: 'approved' }), /supervisão/);
});
test('AI context is rebuilt from authorized server data, excluding identity and code', async () => {
  const value = state();
  const service = new AcademicService({ read: async () => value });
  const context = await service.aiContext(student, 'student', { pendingCount: 999 });
  const json = JSON.stringify(context);
  assert.ok(context.sessions.length);
  assert.doesNotMatch(json, /mario@|2526319|attendanceCodes|registration|pendingCount/);
  assert.equal(context.source, 'MoniMob Cloud Firestore');
});
test('client time and code lifetime overrides are ignored', context => {
  const value = state();
  const session = value.sessions.find(item => item.id === 'session-1');
  const now = Date.parse(`${session.date}T${session.time}:00-03:00`) - 10 * 60000;
  context.mock.method(Date, 'now', () => now);
  const code = applyAction(value, monitor, 'monitor', 'generateAttendanceCode', { sessionId: 'session-1', now: 0, lifetimeMinutes: 999999 });
  assert.match(code.code, /^\d{6}$/);
  assert.equal(Date.parse(code.createdAt), now);
  assert.equal(Date.parse(code.expiresAt) - Date.parse(code.createdAt), 20 * 60000);
});
test('reminders are persistent and do not duplicate after the next scheduled execution', async () => {
  const value = state();
  value.reservations.push({ id: 'confirmed', studentId: 'student-1', sessionId: 'session-1', status: 'confirmed' });
  const start = Date.parse(value.sessions[0].date + 'T' + value.sessions[0].time + ':00-03:00');
  const store = { transact: async (_key, _fingerprint, mutate) => mutate(value) };
  assert.equal(await sendReminders(store, start - 3600000), 1);
  assert.equal(await sendReminders(store, start - 1800000), 0);
});
test('scoped reminder runs never notify an unrelated reservation and use an independent job key', async()=>{
  const value=state(),keys=[];
  value.reservations.push({id:'selected',studentId:'student-1',sessionId:'session-1',status:'confirmed'},{id:'other',studentId:'student-2',sessionId:'session-1',status:'confirmed'});
  const start=Date.parse(value.sessions[0].date+'T'+value.sessions[0].time+':00-03:00');
  const store={transact:async(key,_fingerprint,mutate)=>{keys.push(key);return mutate(value);}};
  assert.equal(await sendReminders(store,start-3600000,{reservationIds:['selected']}),1);
  assert.ok(value.notifications.filter(x=>x.title==='Lembrete de monitoria').every(x=>x.userId==='student-1'));
  assert.equal(await sendReminders(store,start-3600000),1);assert.notEqual(keys[0],keys[1]);
});
test('an explicitly empty reminder scope does not silently expand to all students',async()=>{
  const value=state();value.reservations.push({id:'selected',studentId:'student-1',sessionId:'session-1',status:'confirmed'});
  const start=Date.parse(value.sessions[0].date+'T'+value.sessions[0].time+':00-03:00');
  assert.equal(await sendReminders({transact:async(_k,_f,mutate)=>mutate(value)},start-3600000,{reservationIds:[]}),0);
});
test('invalid reminder scope is rejected before accessing the store',async()=>{
  await assert.rejects(sendReminders({transact:()=>assert.fail('must not touch data')},Date.now(),{reservationIds:['bad/id']}),/scope/);
});
