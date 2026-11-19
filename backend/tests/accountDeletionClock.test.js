import test from 'node:test';
import assert from 'node:assert/strict';
import {requireRecentPasswordAuthentication as check} from '../src/accountDeletion.js';
const now=Date.now(),seconds=Math.floor(now/1000);
test('fresh password survives the observed 131-second workstation clock delay',()=>{
 const identity={provider:'password',authTime:seconds+131,issuedAt:seconds+131};
 assert.ok(identity.authTime*1000>now+30000,'v1.4.1 reproduces its false expiration');
 assert.doesNotThrow(()=>check(identity,now));
});
test('fresh Google time tolerates bounded skew for every application role',()=>{
 for(const role of ['student','monitor','professor'])for(const skew of [-120,0,131,299])assert.doesNotThrow(()=>check({role,provider:'password',authTime:seconds+skew,issuedAt:seconds+skew},now));
});
test('old sessions, old-auth refreshes and excessive future timestamps are rejected',()=>{
 assert.throws(()=>check({provider:'password',authTime:seconds-301,issuedAt:seconds},now),e=>e.code==='RECENT_LOGIN_REQUIRED');
 assert.throws(()=>check({provider:'password',authTime:seconds-299,issuedAt:seconds+3},now),e=>e.code==='RECENT_LOGIN_REQUIRED');
 assert.throws(()=>check({provider:'password',authTime:seconds+301,issuedAt:seconds+301},now),e=>e.code==='AUTH_CLOCK_SKEW');
 assert.throws(()=>check({provider:'google.com',authTime:seconds,issuedAt:seconds},now),e=>e.code==='RECENT_LOGIN_REQUIRED');
});
