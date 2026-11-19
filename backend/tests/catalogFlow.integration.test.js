import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createRuntime } from '../src/runtime.js';
import { ensureCourseCatalog } from '../src/catalogBootstrap.js';
import { MonitoringService } from '../src/domain/monitoring.js';
const enabled=Boolean(process.env.FIRESTORE_EMULATOR_HOST&&process.env.FIREBASE_AUTH_EMULATOR_HOST);

test('blank database: actual runtime initializes catalogue, professor/tutor/student complete the protected HTTP workflow', {skip:!enabled}, async()=>{
 const app=initializeApp({projectId:'demo-monimob'}),db=getFirestore(app),auth=getAuth(app);
 const clear=async()=>{for(const collection of await db.listCollections())await db.recursiveDelete(collection);};
 let server;
 try{
  await clear();assert.equal((await db.collection('disciplines').get()).size,0);
  const handler=createRuntime();await handler.ready;
  assert.equal((await db.collection('disciplines').get()).size,49);
  assert.equal((await db.collection('users').get()).size,0);
  assert.equal((await db.collection('monitorDisciplines').get()).size,0);
  assert.equal((await ensureCourseCatalog(db)).created,0);
  server=createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port,tokens={};
  const users=[{id:'flow-prof',roles:['professor'],name:'Professor QA'},{id:'flow-tutor',roles:['student','monitor'],name:'Monitor QA'},{id:'flow-student',roles:['student'],name:'Aluno QA'}];
  for(const user of users){try{await auth.deleteUser(user.id);}catch{}const email=user.id+'@edu.unifor.br';await auth.createUser({uid:user.id,email,emailVerified:true,password:'QaPassword-2026'});await auth.setCustomUserClaims(user.id,{roles:user.roles});await db.doc('users/'+user.id).set({...user,email,registration:user.id,registrationStatus:'active'});const response=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password:'QaPassword-2026',returnSecureToken:true})});tokens[user.id]=(await response.json()).idToken;assert.ok(tokens[user.id]);}
  let serial=0;
  const request=async(uid,path,body)=>{const response=await fetch(origin+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+tokens[uid],'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return{status:response.status,body:await response.json()};};
  const command=async(uid,role,action,input={},status=200)=>{const response=await request(uid,'/api/actions',{role,command:{id:'catalog_flow_command_'+(++serial),action,input}});assert.equal(response.status,status,JSON.stringify(response.body));return response.body.result;};
  const state=async(uid,role)=>(await request(uid,'/api/state?role='+role)).body.state;
  assert.equal((await state('flow-prof','professor')).disciplines.length,49);

  const directory=await state('flow-tutor','monitor');assert.equal(directory.professorDisciplines.length,0);assert.ok(directory.users.some(x=>x.id==='flow-prof'&&x.name==='Professor QA'));assert.equal(directory.users.find(x=>x.id==='flow-prof').email,undefined);
  const date=new Date(Date.now()+7*86400000).toISOString().slice(0,10),session={disciplineId:'T390',topic:'Encontro do fluxo completo',date,time:'15:00',capacity:2,location:'Sala QA',durationMinutes:60};
  await command('flow-tutor','monitor','saveSession',{session},403);
  const pending=await command('flow-tutor','monitor','requestMonitorLink',{disciplineId:'T390',professorId:'flow-prof'});
  assert.ok((await state('flow-prof','professor')).linkRequests.some(x=>x.id===pending.id&&x.status==='pending'));
  const received=await state('flow-prof','professor');assert.equal(new MonitoringService({read:()=>received}).reportForProfessor('flow-prof').pending,1);assert.match(new MonitoringService({read:()=>received}).exportReportCsv('flow-prof'),/Vínculo solicitado/);
  await command('flow-prof','professor','decideMonitorLink',{requestId:pending.id,decision:'approved',validUntil:date,validUntilTime:'16:00',comment:'Vínculo concedido'});
  assert.equal((await state('flow-prof','professor')).professorDisciplines.length,1);
  await command('flow-tutor','monitor','saveSession',{session:{...session,time:'15:01'}},409);
  await command('flow-tutor','monitor','saveSession',{session:{...session,date:new Date(Date.parse(date+'T12:00:00Z')+86400000).toISOString().slice(0,10)}},409);
  const published=await command('flow-tutor','monitor','saveSession',{session});assert.equal(published.status,'approved');
  await command('flow-tutor','monitor','saveSession',{session:{...session,id:published.id,durationMinutes:61}},409);
  const student=await state('flow-student','student');assert.ok(student.sessions.some(x=>x.id===published.id));
  const booking=await command('flow-student','student','reserve',{sessionId:published.id});assert.equal(booking.status,'confirmed');
  await command('flow-student','student','reserve',{sessionId:published.id},409);
  const agenda=await state('flow-student','student');assert.ok(agenda.reservations.some(x=>x.id===booking.id&&x.status==='confirmed'));assert.equal(agenda.sessions.find(x=>x.id===published.id).reservedCount,1);
  const bytes=Buffer.alloc(132*1024,1);bytes.set([255,216,255],0);
  const uploaded=await request('flow-tutor','/api/materials/upload?role=monitor',{operationId:'catalog_flow_file_0001',disciplineId:'T390',title:'Material do encontro',name:'IMG-20261116.jpg',data:bytes.toString('base64')});assert.equal(uploaded.status,200,JSON.stringify(uploaded.body));const material=uploaded.body.result;
  assert.ok(!(await state('flow-student','student')).materials.some(x=>x.id===material.id));
  await command('flow-prof','professor','decideApproval',{entityType:'material',entityId:material.id,decision:'approved'});
  assert.ok((await state('flow-student','student')).materials.some(x=>x.id===material.id));
  const download=await fetch(origin+'/api/materials/'+material.id+'/file?role=student',{headers:{authorization:'Bearer '+tokens['flow-student']}});assert.equal(download.status,200);assert.deepEqual(Buffer.from(await download.arrayBuffer()),bytes);
  await command('flow-student','professor','decideMonitorLink',{requestId:pending.id,decision:'approved',validUntil:'2099-12-31'},403);
  const professor=await state('flow-prof','professor'),domain=new MonitoringService({read:()=>professor});const csv=domain.exportReportCsv('flow-prof');assert.match(csv,/Vínculo aprovado/);assert.match(csv,/Monitoria publicada/);assert.match(csv,/Reserva criada/);assert.match(csv,/Material do encontro/);
  await command('flow-tutor','monitor','archiveSession',{sessionId:published.id});const updated=await state('flow-student','student');assert.equal(updated.reservations.find(x=>x.id===booking.id).status,'cancelled');
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await clear();for(const uid of ['flow-prof','flow-tutor','flow-student'])try{await auth.deleteUser(uid);}catch{}await deleteApp(app);}
});
