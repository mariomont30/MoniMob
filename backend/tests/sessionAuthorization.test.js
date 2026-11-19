import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState, applyAction, visibleState} from '../src/academicService.js';
import {sessionAuthorizationIssue} from '../src/domain/sessionAuthorization.js';
import {MonitoringService} from '../src/domain/monitoring.js';
const actors={professor:{sub:'p',roles:['professor']},monitor:{sub:'m',roles:['monitor']},student:{sub:'s',roles:['student']}};
const run=(s,role,action,input)=>applyAction(s,actors[role],role,action,input);
function linked(time) {
 const s=emptyState();s.users=Object.entries(actors).map(([role,a])=>({id:a.sub,name:role,roles:a.roles}));s.disciplines=[{id:'c',code:'C',name:'Course',active:true}];
 const request=run(s,'monitor','requestMonitorLink',{disciplineId:'c',professorId:'p'});
 run(s,'professor','decideMonitorLink',{requestId:request.id,decision:'approved',validUntil:'2099-11-24',...(time?{validUntilTime:time}:{})});return s;
}
const session=(date='2099-11-24',time='17:00',durationMinutes=60)=>({disciplineId:'c',topic:'Limits',date,time,durationMinutes,capacity:2,location:'Room'});
test('date-only approval includes the last second of the chosen Brasília date',()=>{
 const s=linked();assert.equal(s.monitorDisciplines[0].validUntil,'2099-11-24T23:59:59-03:00');
 assert.equal(run(s,'monitor','saveSession',{session:session('2099-11-24','22:59')}).status,'approved');
 for(const v of [session('2099-11-25'),session('2099-11-24','23:00')])assert.throws(()=>run(s,'monitor','saveSession',{session:v}),e=>e.code==='SESSION_OUTSIDE_AUTHORIZATION');
});
test('time and complete duration are checked on creation, editing and reservation at the backend',()=>{
 const s=linked('18:00');assert.equal(s.monitorDisciplines[0].validUntil,'2099-11-24T18:00:00-03:00');
 const saved=run(s,'monitor','saveSession',{session:session()});
 for(const v of [session('2099-11-24','17:01'),session('2099-11-24','18:00'),session('2099-11-24','17:00',61),session('2099-11-25')])assert.throws(()=>run(s,'monitor','saveSession',{session:{...v,id:saved.id}}),e=>e.code==='SESSION_OUTSIDE_AUTHORIZATION');
 assert.equal(s.sessions[0].time,'17:00');
 s.sessions[0].time='17:30';s.sessions[0].reviewPending=false;
 assert.throws(()=>run(s,'student','reserve',{sessionId:saved.id}),e=>['SESSION_UNAVAILABLE','SESSION_OUTSIDE_AUTHORIZATION'].includes(e.code));
 assert.throws(()=>run(s,'professor','decideApproval',{entityType:'session',entityId:saved.id,decision:'approved'}),e=>e.code==='SESSION_OUTSIDE_AUTHORIZATION');
 const teacher=visibleState(s,actors.professor,'professor');assert.equal(teacher.sessions[0].authorizationInvalid,true);
 assert.equal(new MonitoringService({read:()=>teacher}).reportForProfessor('p').pending,1);
 assert.equal(visibleState(s,actors.student,'student').sessions.length,0);
 s.reservations.push({id:'old',studentId:'s',sessionId:saved.id,status:'confirmed'});
 assert.equal(visibleState(s,actors.student,'student').sessions[0].authorizationInvalid,true,'Existing booking remains visible with warning');
 run(s,'professor','decideApproval',{entityType:'session',entityId:saved.id,decision:'adjustments_requested',comment:'Correct the time'});
 assert.equal(s.sessions[0].status,'adjustments_requested');
});
test('authorization respects validFrom and preserves completed history after expiry or revocation',()=>{
 const s=linked('18:00'),link=s.monitorDisciplines[0];link.validFrom='2099-11-24T16:00:00-03:00';
 assert.match(sessionAuthorizationIssue(session('2099-11-24','15:59'),link),/antes/);
 assert.equal(sessionAuthorizationIssue(session('2099-11-24','17:00'),link),null);
 assert.equal(sessionAuthorizationIssue(session('2000-01-01'),{...link,active:false}),null);
});
test('approval refuses malformed time limits without granting a tutor assignment',()=>{
 for(const time of ['24:00','18:60','5:00','18:00:00']){
 const s=linked();s.monitorDisciplines=[];s.linkRequests[0].status='pending';
 assert.throws(()=>run(s,'professor','decideMonitorLink',{requestId:s.linkRequests[0].id,decision:'approved',validUntil:'2099-11-24',validUntilTime:time}),e=>e.code==='INVALID_LINK_EXPIRY');assert.equal(s.monitorDisciplines.length,0);
 }
});
