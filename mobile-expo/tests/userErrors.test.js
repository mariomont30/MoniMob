import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeApiError,userErrorMessage} from '../src/services/userErrors.js';

test('database quota exhaustion gives a useful message without blaming the internet or exposing Firebase internals',()=>{
  for(const code of ['DATA_QUOTA_EXCEEDED','resource-exhausted']){
    const message=userErrorMessage({code,message:'8 RESOURCE_EXHAUSTED: Quota exceeded. project/private-details'});
    assert.match(message,/limite temporário/);assert.doesNotMatch(message,/internet|project|Firebase|RESOURCE_EXHAUSTED/);
  }
});
test('temporary assistant failure explains recovery without exposing provider details',()=>{
  assert.equal(userErrorMessage({code:'AI_TEMPORARILY_UNAVAILABLE',message:'private provider response'}),'O MoniBot está temporariamente ocupado. Sua pergunta foi mantida. Tente novamente em instantes.');
});
test('offline fetch errors give a recovery instruction instead of a native error',()=>{
  assert.match(normalizeApiError(new TypeError('Network request failed')).message,/internet.*tente novamente/i);
  assert.match(normalizeApiError(new TypeError('Failed to fetch')).message,/conectar/);
});
test('timeouts retain the user-facing retry instruction',()=>assert.match(normalizeApiError(Object.assign(new Error(),{name:'AbortError'})).message,/demorou.*Tente novamente/));
test('Android DNS failures observed in Expo Go do not expose the technical host error',()=>{
  const error=new Error('fetch failed: java.net.UnknownHostException: Unable to resolve host "project.exp.direct": No address associated with hostname');
  const message=userErrorMessage(error);assert.match(message,/internet.*tente novamente/i);assert.ok(!message.includes('UnknownHostException'));assert.ok(!message.includes('exp.direct'));
});
test('business rejection keeps status and code used to avoid retrying the command',()=>{
  const rejection=Object.assign(new Error('Sem vagas.'),{status:409,code:'FULL'});assert.equal(normalizeApiError(rejection),rejection);
});
test('service failures keep their retry classification',()=>{
  const failure=Object.assign(new Error('Serviço indisponível.'),{status:503,code:'REQUEST_FAILED'});assert.equal(normalizeApiError(failure),failure);
});
test('wrong passwords and missing accounts have the same login message',()=>{
  const messages=['auth/wrong-password','auth/user-not-found','auth/invalid-credential'].map(code=>userErrorMessage({code,message:'internal Firebase detail'}));assert.equal(new Set(messages).size,1);assert.equal(messages[0],'E-mail ou senha incorretos.');
});
test('invalid email uses a useful Portuguese message',()=>assert.equal(userErrorMessage({code:'auth/invalid-email'}),'Informe um e-mail válido.'));
test('Firestore offline startup errors observed during configuration reload are localized',()=>{
  const error={code:'unavailable',message:'Failed to get document because the client is offline.'};
  assert.match(userErrorMessage(error),/internet.*tente novamente/i);
  assert.match(userErrorMessage(new Error(error.message)),/internet.*tente novamente/i);
});
test('unknown authentication and configuration errors do not expose setup details',()=>{
  assert.ok(!userErrorMessage({code:'auth/invalid-api-key',message:'Firebase configuration detail'}).includes('Firebase'));
  assert.ok(!userErrorMessage({code:'API_NOT_CONFIGURED',message:'Configure the backend URL'}).includes('backend'));
});
test('local validation messages remain specific',()=>assert.equal(userErrorMessage(new Error('Informe a data.')),'Informe a data.'));
