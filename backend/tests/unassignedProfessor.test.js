import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, applyAction, visibleState } from '../src/academicService.js';
import { MonitoringService } from '../src/domain/monitoring.js';
const monitor={sub:'m',roles:['monitor']}, professor={sub:'p',roles:['professor']};
test('one registered professor and zero assignments: request is possible, grants nothing, approval establishes both links',()=>{
 const s=emptyState();s.users=[{id:'m',roles:['monitor'],name:'Monitor'},{id:'p',roles:['professor'],name:'Professor',email:'private@unifor.br'},{id:'disabled',roles:['professor'],disabled:true,name:'Bloqueado'}];s.disciplines=[{id:'course',code:'C',name:'Disciplina'}];
 const directory=visibleState(s,monitor,'monitor');assert.equal(directory.professorDisciplines.length,0);assert.ok(directory.users.some(x=>x.id==='p'));assert.ok(!directory.users.some(x=>x.id==='disabled'));assert.equal(directory.users.find(x=>x.id==='p').email,undefined);
 const request=applyAction(s,monitor,'monitor','requestMonitorLink',{disciplineId:'course',professorId:'p'});assert.equal(s.monitorDisciplines.length,0);assert.equal(s.professorDisciplines.length,0);
 const received=visibleState(s,professor,'professor');const report=new MonitoringService({read:()=>received});assert.equal(report.reportForProfessor('p').pending,1);assert.match(report.exportReportCsv('p'),/Vínculo solicitado/);
 assert.throws(()=>applyAction(s,professor,'professor','decideMonitorLink',{requestId:request.id,decision:'approved',validUntil:'2000-01-01'}));assert.equal(s.professorDisciplines.length,0);
 applyAction(s,professor,'professor','decideMonitorLink',{requestId:request.id,decision:'approved',validUntil:'2099-12-31'});assert.equal(s.professorDisciplines.length,1);assert.equal(s.monitorDisciplines.length,1);
});
test('rejecting an initial request grants no course or monitor assignment',()=>{
 const s=emptyState();s.users=[{id:'m',roles:['monitor'],name:'M'},{id:'p',roles:['professor'],name:'P'}];s.disciplines=[{id:'course'}];const request=applyAction(s,monitor,'monitor','requestMonitorLink',{disciplineId:'course',professorId:'p'});applyAction(s,professor,'professor','decideMonitorLink',{requestId:request.id,decision:'rejected'});assert.equal(s.professorDisciplines.length,0);assert.equal(s.monitorDisciplines.length,0);assert.equal(request.status,'rejected');
});
