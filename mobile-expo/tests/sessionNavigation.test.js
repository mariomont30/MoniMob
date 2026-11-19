import test from 'node:test';
import assert from 'node:assert/strict';
import { completeSignOut, publicSession, sessionNavigation } from '../src/services/sessionNavigation.js';

test('a new app starts at welcome without a user or an active role', () => {
  const state=publicSession();
  assert.equal(state.route,'welcome');assert.equal(state.user,null);assert.equal(state.activeRole,null);
  assert.equal(sessionNavigation(state,{type:'go',route:'home'}),state);
  assert.equal(sessionNavigation(state,{type:'go',route:'professorDashboard'}),state);
});

for(const [role,home] of [['student','home'],['monitor','monitorDashboard'],['professor','professorDashboard']]){
  test(role+' signs in explicitly and signs out with no private navigation left behind',()=>{
    let state=sessionNavigation(publicSession(),{type:'signedIn',user:{id:role,roles:role==='monitor'?['student','monitor']:[role],requestedRole:role}});
    assert.equal(state.route,home);assert.equal(state.activeRole,role);
    state=sessionNavigation(state,{type:'go',route:'profile'});assert.equal(state.route,'profile');
    state=sessionNavigation(state,{type:'signedOut'});
    assert.deepEqual(state,publicSession());
    state=sessionNavigation(state,{type:'back'});assert.equal(state.route,'welcome');
    assert.equal(sessionNavigation(state,{type:'go',route:home}).route,'welcome');
  });
}

test('profile updates arriving after logout cannot bring the previous user back',()=>{
  const state=publicSession();
  assert.equal(sessionNavigation(state,{type:'updateUser',user:{id:'old',roles:['professor']}}),state);
  assert.equal(sessionNavigation(state,{type:'updateUser'}),state);
});

test('role selection and navigation only expose areas authorized for the account',()=>{
  let state=sessionNavigation(publicSession(),{type:'signedIn',user:{id:'monitor',roles:['student','monitor']}});
  assert.equal(state.route,'roleAccess');
  assert.equal(sessionNavigation(state,{type:'chooseRole',role:'professor'}),state);
  state=sessionNavigation(state,{type:'chooseRole',role:'monitor'});
  assert.equal(state.route,'monitorDashboard');assert.equal(sessionNavigation(state,{type:'go',route:'approvals'}),state);
  state=sessionNavigation(state,{type:'chooseRole',role:'student'});
  assert.equal(state.route,'home');assert.deepEqual(state.history,[]);
  assert.equal(sessionNavigation(state,{type:'go',route:'manageSessions'}),state);
});

test('a blocked logout event does not block the welcome screen or the local sign-out',async()=>{
  let state=sessionNavigation(publicSession(),{type:'signedIn',user:{id:'owner',roles:['student']}}),release,started=false;
  const exiting=completeSignOut({reset:()=>{state=sessionNavigation(state,{type:'signedOut'});},signOut:()=>{started=true;return new Promise(resolve=>{release=resolve;});},recordEvent:()=>new Promise(()=>{})});
  assert.deepEqual(state,publicSession());assert.equal(started,true);
  release();await exiting;assert.equal(state.route,'welcome');
});

test('a rejected event is ignored while a failed local sign-out is reported after clearing private UI',async()=>{
  let cleared=false;
  await assert.rejects(completeSignOut({reset:()=>{cleared=true;},signOut:async()=>{throw new Error('storage unavailable');},recordEvent:async()=>{throw new Error('offline');}}),/storage unavailable/);
  assert.equal(cleared,true);
});
