import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRegistration, validateEmail, validateFuture, projectDateTime } from '../src/services/formValidation.js';
import { MonitoringService } from '../src/domain/monitoring.js';
import { createSeedState } from './fixtures/state.js';
import { MemoryStateRepository } from './fixtures/repository.js';
const valid={role:'student',name:'João d’Ávila',registration:'001234',email:' User@edu.unifor.br ',password:'senha123',confirmPassword:'senha123'};
test('registration validates each role, email, identification and password confirmation',()=>{
 for(const role of ['student','monitor','professor']) assert.doesNotThrow(()=>validateRegistration({...valid,role}));
 for(const patch of [{name:'  '},{registration:'1'},{email:'x@@edu.unifor.br'},{password:'1234567'},{confirmPassword:'different'},{password:'        ',confirmPassword:'        '},{role:'admin'}])assert.throws(()=>validateRegistration({...valid,...patch}));
 assert.equal(validateEmail(valid.email),'user@edu.unifor.br');
 assert.throws(()=>validateEmail('a b@edu.unifor.br'));
});
test('date and time are validated together against Brasilia time',()=>{
 const now=Date.parse('2030-01-02T12:00:00-03:00');
 assert.throws(()=>validateFuture('2030-01-01','23:59',now));
 assert.throws(()=>validateFuture('2030-01-02','11:59',now));
 assert.throws(()=>validateFuture('2030-01-02','12:00',now));
 assert.throws(()=>validateFuture('2030-02-31','12:00',now));
 assert.doesNotThrow(()=>validateFuture('2030-01-03','00:01',now));
 assert.deepEqual(projectDateTime(new Date('2030-01-03T01:00:00Z')),{date:'2030-01-02',time:'22:00'});
});
test('supervision rejection cancels confirmed bookings and preserves their history',()=>{
 const repository=new MemoryStateRepository(createSeedState()),service=new MonitoringService(repository);
 const session=service.saveSession({actorId:'monitor-1',session:{disciplineId:'T390',topic:'Revisão',location:'Sala 10',date:'2031-07-17',time:'10:00',durationMinutes:60,capacity:2}});
 const booking=service.reserve({studentId:'student-1',sessionId:session.id});
 service.decideApproval({professorId:'professor-1',entityType:'session',entityId:session.id,decision:'rejected',comment:'Revisar proposta'});
 assert.equal(repository.read().reservations.find(r=>r.id===booking.id).status,'cancelled');
 assert.ok(repository.read().notifications.some(n=>n.userId==='student-1'&&n.title==='Monitoria cancelada pela supervisão'));
});
test('completed sessions cannot be recycled into future appointments',()=>{
 const state=createSeedState();const previous=state.sessions[0];previous.date='2000-01-01';
 const service=new MonitoringService(new MemoryStateRepository(state));
 assert.throws(()=>service.saveSession({actorId:previous.monitorId,session:{...previous,date:'2031-01-01'}}),e=>e.code==='SESSION_STARTED');
});
test('valid monitor publication is immediately reservable while professor can request adjustments',()=>{
 const repository=new MemoryStateRepository(createSeedState()),service=new MonitoringService(repository);
 const session=service.saveSession({actorId:'monitor-1',session:{disciplineId:'T390',topic:'Publicação direta',location:'Sala 20',date:'2031-06-17',time:'10:00',durationMinutes:60,capacity:2}});
 assert.equal(session.status,'approved');
 assert.ok(service.listSessions({approvedOnly:true}).some(x=>x.id===session.id));
 service.reserve({studentId:'student-1',sessionId:session.id});
 assert.throws(()=>service.saveSession({actorId:'monitor-1',session:{...session,id:undefined}}),e=>e.code==='SCHEDULE_CONFLICT');
 assert.throws(()=>service.saveSession({actorId:'monitor-1',session:{...session,capacity:0}}),e=>e.code==='INVALID_CAPACITY');
 service.decideApproval({professorId:'professor-1',entityType:'session',entityId:session.id,decision:'adjustments_requested',comment:'Revisar conteúdo'});
 assert.ok(!service.listSessions({approvedOnly:true}).some(x=>x.id===session.id));
});
