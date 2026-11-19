import test from 'node:test';import assert from 'node:assert/strict';
import {dashboardItems} from '../src/services/dashboardData.js';
import {emptyState} from '../../backend/src/academicService.js';
import {MonitoringService} from '../src/domain/monitoring.js';
test('each professor KPI opens only its matching items and counts include link requests',()=>{
 const s=emptyState();s.users=[{id:'p',roles:['professor']}];s.disciplines=[{id:'c',name:'Course'},{id:'other'}];s.professorDisciplines=[{professorId:'p',disciplineId:'c',active:true}];
 s.sessions=[{id:'ended',professorId:'p',disciplineId:'c',status:'approved',date:'2000-01-01',time:'12:00',durationMinutes:60},{id:'review',professorId:'p',disciplineId:'c',status:'approved',reviewPending:true,date:'2099-01-01',time:'12:00'},{id:'foreign',professorId:'q',disciplineId:'other',status:'pending'}];
 s.linkRequests=[{id:'req',professorId:'p',disciplineId:'c',status:'pending'},{id:'foreign',professorId:'q',status:'pending'}];s.materials=[{id:'mat',professorId:'p',disciplineId:'c',status:'pending'}];
 const report=new MonitoringService({read:()=>s}).reportForProfessor('p');
 for(const [kind,n] of [['disciplines',report.disciplines],['completed',report.sessions],['pending',report.pending]])assert.equal(dashboardItems(s,'p','professor',kind).length,n);
 const pending=dashboardItems(s,'p','professor','pending');assert.equal(pending.length,3);assert.equal(pending.find(x=>x.id==='link-req').route,'academicLinks');assert.equal(pending.find(x=>x.id==='material-mat').route,'approvals');assert.deepEqual(dashboardItems(s,'p','professor','completed').map(x=>x.session.id),['ended']);
});
test('student and tutor cards preserve ownership and support zero-item indicators',()=>{
 const s=emptyState();s.users=[{id:'s',name:'Student'}];s.sessions=[{id:'own',monitorId:'m',status:'adjustments_requested',topic:'Topic'},{id:'foreign',monitorId:'q',authorizationInvalid:true}];s.reservations=[{id:'a',sessionId:'own',studentId:'s',status:'confirmed'},{id:'b',sessionId:'foreign',studentId:'other',status:'confirmed'}];
 assert.equal(dashboardItems(s,'m','monitor','participants')[0].participantSessionId,'own');assert.equal(dashboardItems(s,'m','monitor','adjustments').length,1);assert.equal(dashboardItems(s,'s','student','reservations').length,1);assert.deepEqual(dashboardItems(s,'s','student','pending'),[]);assert.deepEqual(dashboardItems(s,'other','monitor','participants'),[]);
});
