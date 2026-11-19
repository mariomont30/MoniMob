import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareAccountDeletion,AccountDeletionService} from '../src/accountDeletion.js';
import {createSeedState} from '../../mobile-expo/tests/fixtures/state.js';
import {createMoniBotServer} from '../src/app.js';

for(const id of ['student-1','monitor-1','professor-1'])test('account closure preserves history and cancels future commitments: '+id,()=>{
 const state=createSeedState(),now=Date.now();
 state.users.push({id:'waiting',roles:['student']});
 state.sessions[0].capacity=1;
 state.sessions.push({...state.sessions[0],id:'past',date:'2020-01-01'});
 state.reservations.push({id:'future',studentId:'student-1',sessionId:'session-1',status:'confirmed'}, {id:'past-booking',studentId:id,sessionId:'past',status:'confirmed'});
 state.waitlist.push({id:'queue',studentId:'waiting',sessionId:'session-1',status:'waiting',createdAt:'2020-01-01T00:00:00Z'});
 state.attendance.push({id:'historical',studentId:id,sessionId:'past'});
 state.favorites.push({id:'favorite',studentId:id,sessionId:'session-1'});
 const other=structuredClone(state.users.find(u=>u.id==='waiting'));
 prepareAccountDeletion(state,id,now);
 const deleted=state.users.find(u=>u.id===id);
 assert.deepEqual(deleted.roles,[]);assert.equal(deleted.disabled,true);assert.equal(deleted.email,undefined);assert.equal(deleted.name,'Conta excluída');
 assert.equal(state.favorites.some(x=>x.studentId===id),false);
 assert.equal(state.notifications.some(x=>x.userId===id),false);
 assert.equal(state.reservations.find(x=>x.id==='past-booking').status,'confirmed');
 assert.equal(state.attendance[0].id,'historical');assert.equal(state.sessions.find(x=>x.id==='past').archived,false);
 assert.deepEqual(state.users.find(u=>u.id==='waiting'),other);
 assert.equal(state.reservations.find(x=>x.id==='future').status,'cancelled');
 if(id==='student-1')assert.ok(state.reservations.some(x=>x.studentId==='waiting'&&x.status==='confirmed'));
 else {assert.equal(state.sessions[0].archived,true);assert.equal(state.waitlist[0].status,'cancelled');assert.ok(state.notifications.some(x=>x.userId==='student-1'&&x.title==='Monitoria cancelada'));}
 const before=structuredClone(state);prepareAccountDeletion(state,id,now);assert.deepEqual(state,before);
 assert.equal(state.settings.cancellationWindowHours,2);
});
test('deletion requires explicit confirmation and recent password authentication',async()=>{
 let touched=0;const service=new AccountDeletionService({store:{transact:()=>touched++}}),now=Date.now();
 for(const identity of [{userId:'a'}, {userId:'a',authTime:now/1000,provider:'google.com'}, {userId:'a',authTime:(now-301000)/1000,provider:'password'}])await assert.rejects(service.deleteOwn(identity,'DELETE',now),e=>e.code==='RECENT_LOGIN_REQUIRED');
 await assert.rejects(service.deleteOwn({userId:'a'},'',now),e=>e.code==='CONFIRMATION_REQUIRED');assert.equal(touched,0);
});
test('deletion HTTP route uses verified identity, ignores forged uid and does not require active role',async()=>{
 const calls=[];const server=createMoniBotServer({verifyFirebaseToken:async()=>({userId:'owned',authTime:Date.now()/1000,provider:'password'}),getFirebaseRoles:async()=>{throw Error('must not load removed roles');},accountDeletionService:{deleteOwn:async(...args)=>{calls.push(args);return{deleted:true};}}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/api/account/delete';
 try{assert.equal((await fetch(url,{method:'POST'})).status,401);const response=await fetch(url,{method:'POST',headers:{authorization:'Bearer a.b.c','content-type':'application/json'},body:JSON.stringify({uid:'victim',confirmation:'DELETE'})});assert.equal(response.status,200);assert.equal(calls[0][0].userId,'owned');assert.equal(calls[0][1],'DELETE');assert.equal(calls.length,1);}finally{await new Promise(r=>server.close(r));}
});
