import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveFirebasePublicConfig} from '../src/services/firebasePublicConfig.js';
test('Firebase production configuration requires explicit public settings',()=>{
  assert.throws(()=>resolveFirebasePublicConfig({apiKey:'only-one-setting'}),/Configure/);
});
test('Firebase emulator configuration never selects a real project',()=>{
  assert.equal(resolveFirebasePublicConfig({},'localhost').projectId,'demo-monimob');
});
test('Firebase public configuration keeps supplied values and excludes empty optional fields',()=>{
  const values={apiKey:'public-test-key',authDomain:'example.test',projectId:'test-project',appId:'test-app',storageBucket:''};
  assert.deepEqual(resolveFirebasePublicConfig(values),{apiKey:'public-test-key',authDomain:'example.test',projectId:'test-project',appId:'test-app'});
});
