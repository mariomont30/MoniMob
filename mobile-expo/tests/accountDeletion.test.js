import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sessionNavigation,publicSession} from '../src/services/sessionNavigation.js';
for(const role of ['student','monitor','professor'])test(role+': deletion uses a separate protected route and cancel returns to profile',()=>{
 let state=sessionNavigation(publicSession(),{type:'signedIn',user:{id:'user',roles:[role]}});
 state=sessionNavigation(state,{type:'go',route:'profile'});state=sessionNavigation(state,{type:'go',route:'deleteAccount'});assert.equal(state.route,'deleteAccount');assert.equal(state.user.id,'user');
 state=sessionNavigation(state,{type:'back'});assert.equal(state.route,'profile');assert.equal(state.user.id,'user');
 assert.equal(sessionNavigation(publicSession(),{type:'go',route:'deleteAccount'}).route,'welcome');
});
test('deletion reauthentication uses its returned user and one password verification',()=>{
 const result=spawnSync(process.execPath,['--loader',new URL('./deletion-auth-loader.mjs',import.meta.url).href,fileURLToPath(new URL('./deletion-auth-contract.mjs',import.meta.url))],{encoding:'utf8',windowsHide:true,timeout:15000});
 assert.equal(result.status,0,result.stderr||result.error?.message);assert.match(result.stdout,/PASS:/);
});
