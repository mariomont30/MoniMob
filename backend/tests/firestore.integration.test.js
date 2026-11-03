import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { FirestoreStore } from '../src/firestoreStore.js';
import { AcademicService, COLLECTIONS, visibleState } from '../src/academicService.js';
import { createSeedState } from '../../mobile-expo/tests/fixtures/state.js';

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
let app, db, service;
before(async () => {
  if (!enabled) return;
  app = initializeApp({ projectId: 'demo-monimob' }, 'academic-integration');
  db = getFirestore(app); service = new AcademicService(new FirestoreStore(db));
});
after(async () => { if (app) await deleteApp(app); });
async function reset() {
  for (const name of [...COLLECTIONS, 'system', 'commands', 'throttles']) {
    const snapshot = await db.collection(name).get();
    for (const item of snapshot.docs) await item.ref.delete();
  }
  const state = createSeedState();
  state.sessions[0].capacity = 1;
  state.monitorDisciplines.forEach(link => { link.validUntil = '2099-12-31T23:59:59Z'; });
  state.users.push({ id: 'student-2', name: 'Other test student', roles: ['student'] });
  for (const name of COLLECTIONS) for (const item of state[name] || []) await db.collection(name).doc(item.id || name + '-' + Math.random()).set(item);
  await db.doc('system/settings').set(state.settings);
}
const identity = id => ({ sub: id, roles: ['student'] });
const command = (id, action, input) => ({ id, action, input });
test('Firestore transaction prevents two users taking the last seat', { skip: !enabled }, async () => {
  await reset();
  const results = await Promise.allSettled([
    service.execute(identity('student-1'), 'student', command('concurrency_000001', 'reserve', { sessionId: 'session-1' })),
    service.execute(identity('student-2'), 'student', command('concurrency_000002', 'reserve', { sessionId: 'session-1' }))
  ]);
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  const rows = await db.collection('reservations').where('sessionId', '==', 'session-1').where('status', '==', 'confirmed').get();
  assert.equal(rows.size, 1);
});
test('Firestore idempotency survives repeated requests and service recreation', { skip: !enabled }, async () => {
  await reset();
  const request = command('idempotency_000001', 'reserve', { sessionId: 'session-1' });
  const first = await service.execute(identity('student-1'), 'student', request);
  const restarted = new AcademicService(new FirestoreStore(db));
  const second = await restarted.execute(identity('student-1'), 'student', request);
  assert.equal(second.id, first.id);
  assert.equal((await db.collection('reservations').get()).size, 1);
  await assert.rejects(restarted.execute(identity('student-1'), 'student', { ...request, action: 'joinWaitlist' }), /outra operação/);
});
test('Firestore student CRUD flow persists favorites, reservation, attendance and cancel state', { skip: !enabled }, async () => {
  await reset();
  const user = identity('student-1');
  const monitor = { sub: 'monitor-1', roles: ['monitor', 'student'] };
  const reservation = await service.execute(user, 'student', command('student_reserve_01', 'reserve', { sessionId: 'session-1' }));
  await service.execute(user, 'student', command('student_favorite01', 'toggleFavorite', { sessionId: 'session-1' }));
  const code = await service.execute(monitor, 'monitor', command('monitor_code_0001', 'generateAttendanceCode', { sessionId: 'session-1' }));
  await service.execute(user, 'student', command('student_attend_01', 'registerAttendance', { sessionId: 'session-1', code: code.code }));
  await assert.rejects(service.execute(user, 'student', command('student_attend_02', 'registerAttendance', { sessionId: 'session-1', code: code.code })), /registrada/);
  await service.execute(user, 'student', command('student_cancel_01', 'cancelReservation', { reservationId: reservation.id }));
  const state = await service.read(user, 'student');
  assert.equal(state.reservations[0].status, 'cancelled');
  assert.equal(state.favorites.length, 1); assert.equal(state.attendance.length, 1);
  assert.deepEqual(state.attendanceCodes, []);
});
test('Firestore session and material CRUD includes teacher adjustment and reapproval', { skip: !enabled }, async () => {
  await reset();
  const monitor = { sub: 'monitor-1', roles: ['monitor', 'student'] };
  const professor = { sub: 'professor-1', roles: ['professor'] };
  const initial = (await service.read(monitor, 'monitor')).sessions[0];
  const created = await service.execute(monitor, 'monitor', command('monitor_create_01', 'saveSession', { session: { ...initial, id: undefined, topic: 'New real persistence test' } }));
  assert.equal(created.status, 'pending');
  await service.execute(professor, 'professor', command('prof_adjust_0001', 'decideApproval', { entityType: 'session', entityId: created.id, decision: 'adjustments_requested', comment: 'Adjust content' }));
  const revised = await service.execute(monitor, 'monitor', command('monitor_revise_01', 'saveSession', { session: { ...created, topic: 'Revised content' } }));
  assert.equal(revised.status, 'pending');
  await service.execute(professor, 'professor', command('prof_approve_001', 'decideApproval', { entityType: 'session', entityId: created.id, decision: 'approved' }));
  const material = await service.execute(monitor, 'monitor', command('material_create01', 'saveMaterial', { material: { disciplineId: 'T390', title: 'Reference', type: 'Link', url: 'https://firebase.google.com/docs' } }));
  await service.execute(professor, 'professor', command('material_approve1', 'decideApproval', { entityType: 'material', entityId: material.id, decision: 'approved' }));
  await service.execute(monitor, 'monitor', command('material_archive1', 'archiveMaterial', { materialId: material.id }));
  await service.execute(monitor, 'monitor', command('session_archive01', 'archiveSession', { sessionId: created.id }));
  assert.equal((await db.collection('materials').doc(material.id).get()).data().archived, true);
  assert.equal((await db.collection('sessions').doc(created.id).get()).data().archived, true);
});

const canonical=value=>Array.isArray(value)?value.map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))
  :value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;

test('scoped queries preserve all three role views, counts and cancelled history while avoiding unrelated profiles and audit history', {skip:!enabled},async()=>{
  await reset();
  await db.doc('users/student-1').update({disciplineIds:['T390']});
  const rows=[];
  for(let i=0;i<90;i++){
    rows.push(['users/foreign-'+i,{id:'foreign-'+i,roles:['student'],name:'Unrelated private profile'}]);
    rows.push(['sessions/foreign-'+i,{id:'foreign-'+i,disciplineId:'foreign-course',monitorId:'foreign-monitor',professorId:'foreign-professor',status:'pending'}]);
    rows.push(['auditLogs/history-'+i,{id:'history-'+i,action:'HISTORICAL_AUDIT'}]);
  }
  for(let i=0;i<35;i++)rows.push(['sessions/large-'+i,{...(await db.doc('sessions/session-1').get()).data(),id:'large-'+i}]);
  rows.push(['sessions/archived',{...(await db.doc('sessions/session-1').get()).data(),id:'archived',archived:true,status:'cancelled'}]);
  rows.push(['reservations/own-history',{id:'own-history',studentId:'student-1',sessionId:'archived',status:'cancelled'}]);
  rows.push(['reservations/another-student',{id:'another-student',studentId:'student-2',sessionId:'session-1',status:'confirmed'}]);
  rows.push(['attendanceCodes/private-code',{id:'private-code',sessionId:'session-1',code:'123456',active:true}]);
  const batch=db.batch();for(const [p,v] of rows)batch.set(db.doc(p),v);await batch.commit();
  const baseline=await new FirestoreStore(db).read();
  for(const [sub,role,roles] of [['student-1','student',['student']],['monitor-1','monitor',['student','monitor']],['professor-1','professor',['professor']]]){
    const identity={sub,roles},paths=[],counts=[];
    const metered={doc:p=>db.doc(p),collection:p=>db.collection(p),runTransaction:(fn,options)=>db.runTransaction(tx=>fn(new Proxy(tx,{get(target,key){if(key==='get')return async ref=>{const result=await target.get(ref);const docs=result.docs||[result];counts.push(Math.max(1,docs.length));paths.push(...docs.filter(d=>d.exists).map(d=>d.ref.path));return result;};return typeof target[key]==='function'?target[key].bind(target):target[key];}})),options)};
    const actual=await new AcademicService(new FirestoreStore(metered)).read(identity,role);
    assert.deepEqual(canonical(actual),canonical(visibleState(baseline,identity,role)));
    assert.ok(!paths.some(p=>p.startsWith('auditLogs/')||p.startsWith('attendanceCodes/')||p.startsWith('users/foreign-')));
    assert.ok(counts.reduce((a,b)=>a+b,0)<200,'Scoped read unexpectedly loads unrelated records');
    console.log('Measured scoped read units (local emulator):',role,counts.reduce((a,b)=>a+b,0));
    if(role==='student'){
      assert.equal(actual.sessions.find(x=>x.id==='session-1').reservedCount,1);
      assert.ok(actual.reservations.some(x=>x.id==='own-history'));
      assert.ok(actual.sessions.some(x=>x.id==='archived'));
      assert.ok(!actual.users.some(x=>x.id==='student-2'));
    }
  }
});

test('login auditing reads two documents, keeps idempotency and leaves the academic revision unchanged', {skip:!enabled},async()=>{
  await reset();await db.doc('auditLogs/original').set({id:'original',action:'KEEP_ME'});
  const originalRevision=(await db.doc('system/academicRevision').get()).data();
  let reads=0;const metered={doc:p=>db.doc(p),runTransaction:fn=>db.runTransaction(tx=>fn(new Proxy(tx,{get(target,key){if(key==='get')return ref=>{reads++;return target.get(ref);};return typeof target[key]==='function'?target[key].bind(target):target[key];}})))};
  const service=new AcademicService(new FirestoreStore(metered));
  const command={id:'auth_audit_cost_00001',action:'recordSignIn',input:{}};
  await service.execute(identity('student-1'),'student',command);assert.equal(reads,2);
  await service.execute(identity('student-1'),'student',command);
  const logs=await db.collection('auditLogs').get();assert.equal(logs.size,2);
  assert.equal((await db.doc('auditLogs/original').get()).data().action,'KEEP_ME');
  assert.deepEqual((await db.doc('system/academicRevision').get()).data(),originalRevision);
  await assert.rejects(service.execute(identity('student-1'),'student',{...command,action:'recordSignOut'}),/outra operação/);
});

test('academic mutations append audit entries without reading or erasing historical audits', {skip:!enabled},async()=>{
  await reset();await db.doc('auditLogs/original').set({id:'original',action:'KEEP_ME'});
  const metered={doc:p=>db.doc(p),collection:p=>{const ref=db.collection(p);return p!=='auditLogs'?ref:new Proxy(ref,{get(target,key){assert.ok(!['limit','where','get'].includes(key),'Audit history should never be queried during a mutation');return typeof target[key]==='function'?target[key].bind(target):target[key];}});},runTransaction:(fn,options)=>db.runTransaction(fn,options)};
  await new AcademicService(new FirestoreStore(metered)).execute(identity('student-1'),'student',{id:'audit_preserve_00001',action:'reserve',input:{sessionId:'session-1'}});
  assert.equal((await db.doc('auditLogs/original').get()).data().action,'KEEP_ME');
  assert.equal((await db.collection('auditLogs').get()).size,2);
});

test('scoped reads always recheck current permissions and disabled accounts without a stale authorization cache', {skip:!enabled},async()=>{
  await reset();assert.ok((await service.read(identity('student-1'),'student')).sessions.length);
  await db.doc('users/student-1').update({disabled:true});
  await assert.rejects(service.read(identity('student-1'),'student'),/autorizado/);
  await db.doc('users/student-1').update({disabled:false,roles:[]});
  await assert.rejects(service.read(identity('student-1'),'student'),/autorizado/);
});
