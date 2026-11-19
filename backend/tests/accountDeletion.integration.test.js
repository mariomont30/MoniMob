import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
import {createMoniBotServer} from '../src/app.js';
import {AccountDeletionService} from '../src/accountDeletion.js';
import {FirestoreStore} from '../src/firestoreStore.js';
import {COLLECTIONS} from '../src/academicService.js';
import {createSeedState} from '../../mobile-expo/tests/fixtures/state.js';
const enabled=Boolean(process.env.FIRESTORE_EMULATOR_HOST&&process.env.FIREBASE_AUTH_EMULATOR_HOST);
test('Firebase account deletion: all three roles, private lists, owned registration, retry and crash recovery',{skip:!enabled},async()=>{
 const app=initializeApp({projectId:'demo-monimob'},'deletion-integration'),db=getFirestore(app),auth=getAuth(app);
 const reset=async()=>{for(const name of [...COLLECTIONS,'system','commands','studentRegistrationIndex']){const rows=await db.collection(name).get();for(const row of rows.docs)await row.ref.delete();}};
 try{
 for(const [uid,mode]of [['student-1','normal'],['monitor-1','auth-failure'],['professor-1','finalize-failure']]){
  await reset();const state=createSeedState();state.sessions.push({...state.sessions[0],id:'past',date:'2020-01-01'});
  state.reservations.push({id:'future',studentId:'student-1',sessionId:'session-1',status:'confirmed'},{id:'past',studentId:uid,sessionId:'past',status:'confirmed'});
  state.attendance.push({id:'past',studentId:uid,sessionId:'past'});
  state.favorites.push({id:'f',studentId:uid,sessionId:'session-1'},{id:'other',studentId:'other',sessionId:'session-1'});
  for(let i=0;i<205;i++)state.notifications.push({id:'private-'+i,userId:uid,title:'private'});
  for(const name of COLLECTIONS)for(const [i,row]of (state[name]||[]).entries())await db.collection(name).doc(row.id||'row-'+i).set(row);
  await db.doc('system/settings').set(state.settings);
  const profile=state.users.find(u=>u.id===uid),registration=profile.registration;
  await db.doc('studentRegistrationIndex/'+registration).set({uid});
  try{await auth.deleteUser(uid);}catch{}
  await auth.createUser({uid,email:profile.email,password:'ValidPassword-2026',emailVerified:true});
  let failAuth=mode==='auth-failure',failFinal=mode==='finalize-failure',authCalls=0;
  const authWrapper={deleteUser:async id=>{authCalls++;if(failAuth){failAuth=false;throw Error('temporary Auth outage');}await auth.deleteUser(id);}};
  const wrappedDb=new Proxy(db,{get(target,key){if(key==='runTransaction')return async(...args)=>{if(failFinal){failFinal=false;throw Error('temporary finalization outage');}return target.runTransaction(...args);};return typeof target[key]==='function'?target[key].bind(target):target[key];}});
  const service=new AccountDeletionService({auth:authWrapper,db:wrappedDb,store:new FirestoreStore(db)});
  const identity={userId:uid,provider:'password',authTime:Math.floor(Date.now()/1000)};
  if(mode==='normal'){
   const signIn=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:profile.email,password:'ValidPassword-2026',returnSecureToken:true})});
   const token=(await signIn.json()).idToken;assert.ok(token);
   const server=createMoniBotServer({accountDeletionService:service,verifyFirebaseToken:async token=>{const decoded=await auth.verifyIdToken(token,true);return{userId:decoded.uid,authTime:decoded.auth_time,provider:decoded.firebase.sign_in_provider};},getFirebaseRoles:async()=>{throw Error('deleted roles must not be required');}});
   await new Promise(r=>server.listen(0,'127.0.0.1',r));
   try{const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/account/delete',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({confirmation:'DELETE',uid:'professor-1'})});assert.equal(response.status,200);assert.deepEqual(await response.json(),{deleted:true});}finally{await new Promise(r=>server.close(r));}
  }
  else{
   await assert.rejects(service.deleteOwn(identity,'DELETE'),e=>e.code==='DELETION_PENDING');
   const pending=(await db.doc('users/'+uid).get()).data();assert.equal(pending.disabled,true);assert.equal(pending.deletionPending,true);assert.deepEqual(pending.roles,[]);
   await new AccountDeletionService({auth,db,store:new FirestoreStore(db)}).recoverPending();
  }
  await assert.rejects(auth.getUser(uid),e=>e.code==='auth/user-not-found');
  const tombstone=(await db.doc('users/'+uid).get()).data();
  assert.equal(tombstone.registrationStatus,'deleted');assert.equal(tombstone.deletionPending,false);assert.equal(tombstone.email,undefined);assert.equal(tombstone.registration,undefined);assert.deepEqual(tombstone.roles,[]);
  assert.equal((await db.doc('studentRegistrationIndex/'+registration).get()).exists,false);
  assert.equal((await db.collection('notifications').where('userId','==',uid).get()).empty,true);
  assert.equal((await db.collection('favorites').where('studentId','==',uid).get()).empty,true);
  assert.equal((await db.doc('favorites/other').get()).exists,true);assert.equal((await db.doc('attendance/past').get()).exists,true);assert.equal((await db.doc('reservations/past').get()).data().status,'confirmed');
  const other=state.users.find(u=>u.id!==uid);assert.equal((await db.doc('users/'+other.id).get()).data().name,other.name);
  const noOp=new AccountDeletionService({auth,db,store:new FirestoreStore(db)});await noOp.recoverPending();assert.equal(noOp.hasPending,false);assert.deepEqual(await service.deleteOwn(identity,'DELETE'),{deleted:true});assert.ok(authCalls>=1);
 }
 // A foreign registration index must never be released by another user's deletion.
 await reset();await db.doc('users/foreign-index').set({id:'foreign-index',registration:'reassigned',deletionPending:true,disabled:true,deletedAt:new Date().toISOString()});await db.doc('studentRegistrationIndex/reassigned').set({uid:'other'});
 await new AccountDeletionService({auth,db,store:new FirestoreStore(db)}).complete('foreign-index');assert.equal((await db.doc('studentRegistrationIndex/reassigned').get()).data().uid,'other');
 }finally{await reset();await deleteApp(app);}
});
