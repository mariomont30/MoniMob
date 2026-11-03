import test from 'node:test';
import assert from 'node:assert/strict';
import {MutationQueue} from '../src/mutationQueue.js';
test('concurrent jobs execute in order without overlapping and a failed write does not stall following work',async()=>{
 const queue=new MutationQueue();let active=0,max=0;const order=[];
 const results=await Promise.allSettled(Array.from({length:40},(_,i)=>queue.run(async()=>{
  active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,1));order.push(i);active--;if(i===7)throw new Error('expected isolated failure');return i;
 })));
 assert.equal(max,1);assert.deepEqual(order,Array.from({length:40},(_,i)=>i));assert.equal(results.filter(x=>x.status==='rejected').length,1);assert.equal(results[39].value,39);
});
test('queue rejects excess work rather than growing without bound',async()=>{
 let release;const queue=new MutationQueue({limit:2});const first=queue.run(()=>new Promise(r=>release=r));
 const pending=[queue.run(async()=>1),queue.run(async()=>2)];await assert.rejects(queue.run(async()=>3),e=>e.code==='SERVER_BUSY'&&e.status===503);
 release(0);assert.equal(await first,0);assert.deepEqual(await Promise.all(pending),[1,2]);
});
test('expired queued work is never executed after the caller received a busy result',async()=>{
 let release,ran=false;const queue=new MutationQueue({waitMs:10});const first=queue.run(()=>new Promise(r=>release=r));
 await assert.rejects(queue.run(async()=>{ran=true;}),e=>e.code==='SERVER_BUSY');
 release();await first;await queue.run(async()=>{});assert.equal(ran,false);
});
