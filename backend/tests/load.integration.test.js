import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {performance} from 'node:perf_hooks';
import fs from 'node:fs/promises';
import {getFirestore} from 'firebase-admin/firestore';
import {getFirebaseAdminAuth} from '../src/firebaseAdmin.js';
import {createRuntime} from '../src/runtime.js';
const enabled=process.env.MONIMOB_RUN_LOAD_TESTS==='1';
const project='demo-monimob';
const records={environment:'local Firebase Auth/Firestore emulators; real HTTP handler',project,cases:[],requests:[]};
let db,auth,server,origin;
const actors=[];
const command=(id,action,input)=>({id,action,input});
const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.max(0,Math.ceil(values.length*p)-1)];
async function call(actor,action,input={},id){
 const started=performance.now();
 const r=await fetch(origin+(action?'/api/actions':'/api/state?role=student'),{method:action?'POST':'GET',headers:{'content-type':'application/json',authorization:'Bearer '+actor.token},...(action?{body:JSON.stringify({role:'student',command:command(id||'load_'+crypto.randomUUID().replaceAll('-',''),action,input)})}:{}),signal:AbortSignal.timeout(90000)});
 const data=await r.json();const elapsedMs=Math.round(performance.now()-started);
 records.requests.push({action:action||'read',status:r.status,code:data.code,elapsedMs});
 return {status:r.status,...data,elapsedMs};
}
before(async()=>{
 if(!enabled)return;
 assert.match(process.env.FIRESTORE_EMULATOR_HOST||'',/^(127\.0\.0\.1|localhost):\d+$/);
 assert.match(process.env.FIREBASE_AUTH_EMULATOR_HOST||'',/^(127\.0\.0\.1|localhost):\d+$/);
 assert.equal(process.env.GCLOUD_PROJECT,project,'Load tests must never target a live project');
 auth=getFirebaseAdminAuth();db=getFirestore();
 await fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+'/emulator/v1/projects/'+project+'/databases/(default)/documents',{method:'DELETE'});
 await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/emulator/v1/projects/'+project+'/accounts',{method:'DELETE'});
 const rows=[['users/load-monitor',{id:'load-monitor',name:'Local QA monitor',roles:['monitor']}],['users/load-professor',{id:'load-professor',name:'Local QA professor',roles:['professor']}],['disciplines/LOAD',{id:'LOAD',code:'LOAD',name:'Local load-test discipline',active:true}],['monitorDisciplines/link',{id:'link',monitorId:'load-monitor',professorId:'load-professor',disciplineId:'LOAD',active:true,validUntil:'2099-12-31T23:59:59Z'}],['professorDisciplines/link',{id:'link',professorId:'load-professor',disciplineId:'LOAD'}],['sessions/load-session',{id:'load-session',disciplineId:'LOAD',monitorId:'load-monitor',professorId:'load-professor',topic:'Local concurrency validation',date:'2030-06-10',time:'15:00',durationMinutes:60,modality:'Online',capacity:10,status:'approved',archived:false}],['system/settings',{cancellationWindowHours:2,attendanceCodeMinutes:20}]];
 for(let i=0;i<40;i++)rows.push(['users/load-'+i,{id:'load-'+i,name:'Local QA '+i,email:'load-'+i+'@example.invalid',roles:['student'],disciplineIds:['LOAD']}]);
 const batch=db.batch();rows.forEach(([p,v])=>batch.set(db.doc(p),v));await batch.commit();
 for(let start=0;start<40;start+=8)await Promise.all(Array.from({length:Math.min(8,40-start)},async(_,offset)=>{
  const i=start+offset,uid='load-'+i,email=uid+'@example.invalid',password='Local-Test-Only-9!';
  await auth.createUser({uid,email,password,emailVerified:true});await auth.setCustomUserClaims(uid,{roles:['student']});
  const r=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-emulator-key',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});
  const data=await r.json();assert.ok(r.ok&&data.idToken,'Local test actor did not authenticate');actors.push({uid,token:data.idToken});
 }));
 server=createServer(createRuntime());await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
});
after(async()=>{
 if(server)await new Promise(resolve=>{server.closeAllConnections();server.close(resolve);});
 if(enabled){const elapsed=records.requests.map(x=>x.elapsedMs);records.summary={httpRequests:elapsed.length,p50Ms:percentile(elapsed,.5),p95Ms:percentile(elapsed,.95),technicalErrors:records.requests.filter(x=>x.status>=500).length,productionQuotaConsumed:false};
  if(process.env.MONIMOB_LOAD_REPORT)await fs.writeFile(process.env.MONIMOB_LOAD_REPORT,JSON.stringify(records,null,2));
  console.log('Local load summary',records.summary);
 }
});
test('forty authenticated simultaneous reservations preserve ten seats, idempotency and wait-list promotion',{skip:!enabled,timeout:240000},async()=>{
 const outcomes=await Promise.all(actors.map((actor,i)=>call(actor,'reserve',{sessionId:'load-session'},'load_reserve_'+String(i).padStart(8,'0'))));
 assert.equal(outcomes.filter(x=>x.status===200).length,10);
 assert.ok(outcomes.filter(x=>x.status!==200).every(x=>x.status===409&&x.code==='FULL_SESSION'),JSON.stringify(outcomes.filter(x=>x.status!==200).map(x=>({status:x.status,code:x.code}))));
 const winners=actors.filter((_,i)=>outcomes[i].status===200),waiting=actors.filter((_,i)=>outcomes[i].status!==200);
 const retries=await Promise.all(winners.map(actor=>call(actor,'reserve',{sessionId:'load-session'},'load_reserve_'+String(actors.indexOf(actor)).padStart(8,'0'))));assert.ok(retries.every(x=>x.status===200));
 const joins=await Promise.all(waiting.map(actor=>call(actor,'joinWaitlist',{sessionId:'load-session'})));assert.ok(joins.every(x=>x.status===200));
 const cancelled=await Promise.all(winners.map(actor=>call(actor,'cancelReservation',{reservationId:outcomes[actors.indexOf(actor)].result.id})));assert.ok(cancelled.every(x=>x.status===200));
 const reservations=(await db.collection('reservations').get()).docs.map(x=>x.data());
 assert.equal(reservations.filter(x=>x.status==='confirmed').length,10);
 assert.equal(new Set(reservations.filter(x=>x.status==='confirmed').map(x=>x.studentId)).size,10);
 assert.equal(reservations.filter(x=>x.status==='cancelled').length,10);
 const queue=(await db.collection('waitlist').get()).docs.map(x=>x.data());assert.equal(queue.length,30);assert.equal(new Set(queue.map(x=>x.studentId)).size,30);
 const reads=await Promise.all(waiting.slice(0,10).map(actor=>call(actor)));
 assert.ok(reads.every(x=>x.status===200&&x.state.reservations.every(r=>r.studentId===waiting[reads.indexOf(x)].uid)));
 records.cases.push({name:'40 concurrent authenticated users /10 seats',passed:true,reservationsAccepted:10,expectedFullRejections:30,waitlistEntries:30,promotions:10,overbooking:false,duplicateReservations:false});
});
test('five independent API instances preserve shared capacity under the same forty-user burst',{skip:!enabled,timeout:240000},async()=>{
 const session={id:'load-distributed',disciplineId:'LOAD',monitorId:'load-monitor',professorId:'load-professor',topic:'Cross-instance concurrency',date:'2030-06-14',time:'15:00',durationMinutes:60,modality:'Online',capacity:10,status:'approved',archived:false};
 await db.doc('sessions/'+session.id).set(session);
 const instances=[];
 try{
  for(let i=0;i<5;i++){const instance=createServer(createRuntime());await new Promise(resolve=>instance.listen(0,'127.0.0.1',resolve));instances.push(instance);}
  const outcomes=await Promise.all(actors.map(async(actor,i)=>{
   const started=performance.now();
   const r=await fetch('http://127.0.0.1:'+instances[i%5].address().port+'/api/actions',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+actor.token},body:JSON.stringify({role:'student',command:command('distributed_'+String(i).padStart(8,'0'),'reserve',{sessionId:session.id})}),signal:AbortSignal.timeout(90000)});
   const data=await r.json();records.requests.push({action:'distributed reserve',status:r.status,code:data.code,elapsedMs:Math.round(performance.now()-started)});return {status:r.status,code:data.code};
  }));
  assert.equal(outcomes.filter(x=>x.status===200).length,10);assert.ok(outcomes.filter(x=>x.status!==200).every(x=>x.status===409&&x.code==='FULL_SESSION'),JSON.stringify(outcomes));
  const reservations=await db.collection('reservations').where('sessionId','==',session.id).where('status','==','confirmed').get();assert.equal(reservations.size,10);
  records.cases.push({name:'5 independent HTTP/API runtimes /40 simultaneous users',passed:true,reservationsAccepted:10,expectedFullRejections:30,overbooking:false});
 }finally{await Promise.all(instances.map(instance=>new Promise(resolve=>{instance.closeAllConnections();instance.close(resolve);})))}
});

test('thousands of unrelated records do not leak through scoped reads and a valid write still persists',{skip:!enabled,timeout:180000},async()=>{
 const rows=[];
 for(let i=0;i<800;i++)rows.push(['users/unrelated-'+i,{id:'unrelated-'+i,name:'Unrelated local private profile',roles:['student']}]);
 for(let i=0;i<400;i++)rows.push(['sessions/unrelated-'+i,{id:'unrelated-'+i,disciplineId:'FOREIGN',monitorId:'foreign-monitor',professorId:'foreign-professor',date:'2030-07-01',time:'10:00',durationMinutes:60,status:'pending',capacity:1}]);
 for(let i=0;i<1000;i++)rows.push(['notifications/unrelated-'+i,{id:'unrelated-'+i,userId:'unrelated-'+i,body:'Local private notification'}]);
 for(let i=0;i<200;i++)rows.push(['materials/unrelated-'+i,{id:'unrelated-'+i,disciplineId:'FOREIGN',monitorId:'foreign-monitor',professorId:'foreign-professor',title:'Private local material',status:'pending'}]);
 for(let start=0;start<rows.length;start+=400){const batch=db.batch();rows.slice(start,start+400).forEach(([p,v])=>batch.set(db.doc(p),v));await batch.commit();}
 const result=await call(actors[0]);assert.equal(result.status,200);
 assert.ok(!JSON.stringify(result.state).includes('Unrelated local private profile'));assert.ok(result.state.users.length<=3);
 const session={id:'load-volume',disciplineId:'LOAD',monitorId:'load-monitor',professorId:'load-professor',topic:'Local volume write',date:'2030-06-12',time:'15:00',durationMinutes:60,modality:'Online',capacity:10,status:'approved',archived:false};
 await db.doc('sessions/load-volume').set(session);
 const write=await call(actors[0],'reserve',{sessionId:session.id});assert.equal(write.status,200,write.code);
 assert.equal((await db.doc('reservations/'+write.result.id).get()).data().studentId,actors[0].uid);
 records.cases.push({name:'2400 unrelated records plus40 active actors',passed:true,unrelatedRecords:rows.length,scopedReadElapsedMs:result.elapsedMs,writeElapsedMs:write.elapsedMs,privateDataLeaked:false});
});
