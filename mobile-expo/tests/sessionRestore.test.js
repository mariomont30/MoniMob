import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreVerifiedSession } from '../src/services/sessionRestore.js';
import { sessionErrorMessage } from '../src/services/userErrors.js';

test('temporary restoration failure retains the saved account and the next attempt revalidates it', async () => {
  const user={uid:'owner'};let attempts=0,signOuts=0;
  const hooks={ready:async()=>{},currentUser:()=>user,signOut:async()=>{signOuts++;},readProfile:async current=>{
    assert.equal(current,user);
    if(++attempts===1)throw Object.assign(new Error('Network request failed'),{code:'auth/network-request-failed'});
    return {id:'owner',roles:['student']};
  }};
  await assert.rejects(restoreVerifiedSession(hooks),{code:'auth/network-request-failed'});
  assert.equal(signOuts,0);
  assert.deepEqual(await restoreVerifiedSession(hooks),{id:'owner',roles:['student']});
  assert.equal(attempts,2);
});

test('unverified accounts are signed out without receiving an authorized profile',async()=>{
  let signedOut=false;
  assert.equal(await restoreVerifiedSession({ready:async()=>{},currentUser:()=>({uid:'pending'}),readProfile:async()=>{throw Object.assign(new Error('Pending'),{code:'EMAIL_NOT_VERIFIED'});},signOut:async()=>{signedOut=true;}}),null);
  assert.equal(signedOut,true);
});

test('a stored identity does not grant access before online profile verification finishes',async()=>{
  let resolve,finished=false;
  const pending=restoreVerifiedSession({ready:async()=>{},currentUser:()=>({uid:'owner'}),readProfile:()=>new Promise(done=>{resolve=done;}),signOut:()=>assert.fail()}).then(value=>{finished=true;return value;});
  await new Promise(done=>setImmediate(done));assert.equal(finished,false);
  resolve({id:'owner',roles:['student']});assert.equal((await pending).id,'owner');
});

test('no saved user returns to login without profile reads',async()=>{
  assert.equal(await restoreVerifiedSession({ready:async()=>{},currentUser:()=>null,readProfile:()=>assert.fail(),signOut:()=>assert.fail()}),null);
});

test('restoration errors distinguish Firebase from the application server and hide raw host details',()=>{
  assert.match(sessionErrorMessage({code:'auth/network-request-failed'}),/sessão no Firebase/);
  assert.match(sessionErrorMessage({code:'unavailable'}),/perfil no Firebase/);
  const message=sessionErrorMessage(new TypeError('Network request failed: private-old-host.example'));
  assert.match(message,/servidor do MoniMob.*tente novamente/i);
  assert.doesNotMatch(message,/Configurar conexão/);
  assert.doesNotMatch(message,/private-old-host/);
});
