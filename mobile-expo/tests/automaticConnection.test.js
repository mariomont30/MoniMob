import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutomaticConnection, readConnectionDocument, connectionDocumentUrl } from '../src/services/automaticConnection.js';
const projectId = 'demo-monimob';
const document = apiUrl => ({ fields:{ projectId:{stringValue:projectId}, schemaVersion:{integerValue:'1'}, apiUrl:{stringValue:apiUrl} } });
test('published connection must match the project and use a public HTTPS origin', () => {
  assert.equal(readConnectionDocument(document('https://current.trycloudflare.com'),projectId),'https://current.trycloudflare.com');
  for (const origin of ['http://server.example.com','https://user:pass@server.example.com','https://server.example.com/api','https://server.example.com?q=x','https://server.example.com:8787','https://127.0.0.1','https://192.168.1.2','https://localhost']) assert.throws(()=>readConnectionDocument(document(origin),projectId));
  assert.throws(()=>readConnectionDocument(document('https://server.example.com'),'different-project'));
  assert.throws(()=>connectionDocumentUrl('bad/project'));
});
test('parallel requests share one discovery and cache avoids excessive Firestore reads',async()=>{
  let reads=0,time=0;
  const resolver=createAutomaticConnection({projectId,now:()=>time,fetchImpl:async()=>{reads++;await Promise.resolve();return {ok:true,json:async()=>document('https://first.trycloudflare.com')};}});
  const urls=await Promise.all(Array.from({length:20},()=>resolver.resolve()));
  assert.equal(new Set(urls).size,1);assert.equal(reads,1);
  time=59000;await resolver.resolve();assert.equal(reads,1);
  time=61000;await resolver.resolve();assert.equal(reads,2);
});
test('changed tunnel is discovered after invalidation without typing or reinstalling',async()=>{
  let url='https://first.trycloudflare.com';
  const resolver=createAutomaticConnection({projectId,fetchImpl:async()=>({ok:true,json:async()=>document(url)})});
  assert.equal(await resolver.resolve(),url);url='https://next.trycloudflare.com';resolver.invalidate();assert.equal(await resolver.resolve(),url);
});
test('discovery failures recover on retry without retaining a stale address or stuck promise',async()=>{
  let failing=true;
  const resolver=createAutomaticConnection({projectId,fetchImpl:()=>{if(failing)throw new Error('offline');return Promise.resolve({ok:true,json:async()=>document('https://next.trycloudflare.com')});}});
  await assert.rejects(resolver.resolve(),{code:'API_UNAVAILABLE'});failing=false;assert.equal(await resolver.resolve(),'https://next.trycloudflare.com');
});
test('denied or malformed discovery never provides an API destination',async()=>{
  for(const response of [{ok:false,json:async()=>({})},{ok:true,json:async()=>({})}]){
    const resolver=createAutomaticConnection({projectId,fetchImpl:async()=>response});await assert.rejects(resolver.resolve(),{code:'API_UNAVAILABLE'});
  }
});
