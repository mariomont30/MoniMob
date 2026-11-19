import test from 'node:test';
import assert from 'node:assert/strict';
import { GeminiClient } from '../src/geminiClient.js';
const ok=()=>({ok:true,json:async()=>({candidates:[{content:{parts:[{text:'Resposta real do contrato de teste.'}]}}]})});
const instant={sleep:async()=>{},random:()=>0};

test('a transient primary failure retries a lightweight model with the same sanitized role context',async()=>{
 const calls=[];
 const client=new GeminiClient({apiKey:'test',...instant,fetchImpl:async(url,options)=>{
  calls.push({url,body:JSON.parse(options.body)});return calls.length===1?{ok:false,status:503}:ok();
 }});
 await client.generate({role:'monitor',message:'Contato pessoa@unifor.br',context:{sessions:[],source:'MoniMob Cloud Firestore'}});
 assert.match(calls[0].url,/gemini-3\.5-flash-lite:generateContent$/);
 assert.match(calls[1].url,/gemini-3\.1-flash-lite:generateContent$/);
 assert.deepEqual(calls[0].body,calls[1].body);
 assert.equal(calls[1].body.generationConfig.thinkingConfig.thinkingLevel,'minimal');
 assert.doesNotMatch(JSON.stringify(calls),/pessoa@unifor/);
 assert.equal(client.model,'gemini-3.5-flash-lite');
});

test('rate limits honor the same model and Retry-After, without using model fallback to bypass quota',async()=>{
 const urls=[],delays=[];
 const client=new GeminiClient({apiKey:'test',random:()=>0,sleep:async delay=>delays.push(delay),fetchImpl:async url=>{
  urls.push(url);return urls.length===1?{ok:false,status:429,headers:{get:()=> '2'}}:ok();
 }});
 await client.generate({role:'student',message:'Como estudar filas?'});
 assert.equal(urls.length,2);assert.equal(urls[0],urls[1]);assert.deepEqual(delays,[2000]);
});

test('concurrent profiles do not alter each other model selection or leak role context',async()=>{
 const calls=[];let failed=false;
 const client=new GeminiClient({apiKey:'test',...instant,fetchImpl:async(url,options)=>{
  const role=JSON.parse(options.body).systemInstruction.parts[0].text.match(/Active role: (\w+)/)[1];
  calls.push({role,url});if(role==='professor'&&!failed){failed=true;return{ok:false,status:503};}return ok();
 }});
 await Promise.all(['professor','student','monitor'].map(role=>client.generate({role,message:'Como usar meu perfil?'})));
 for(const role of ['student','monitor'])assert.ok(calls.filter(c=>c.role===role).every(c=>c.url.includes('gemini-3.5-flash-lite:')));
 assert.equal(calls.filter(c=>c.role==='professor').length,2);
 assert.ok(calls.find(c=>c.role==='professor'&&c.url.includes('gemini-3.1-flash-lite:')));
});
