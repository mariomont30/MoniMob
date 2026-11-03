import test from 'node:test';
import assert from 'node:assert/strict';
import {startReminderScheduler} from '../src/reminderScheduler.js';

test('actual timer cycles do not overlap and stop prevents future work',async()=>{
 let calls=0,active=0,max=0,finish;
 const done=new Promise(resolve=>finish=resolve);
 const scheduler=startReminderScheduler({intervalMs:2,run:async()=>{calls++;active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,10));active--;},onResult:()=>{if(calls===2){scheduler.stop();finish();}}});
 try{await Promise.race([done,new Promise((_,reject)=>setTimeout(()=>reject(Error('timer did not run')),2000))]);await new Promise(r=>setTimeout(r,20));assert.equal(max,1);assert.equal(calls,2);}finally{scheduler.stop();}
});
test('a failed automatic cycle is reported and the next cycle can recover',async()=>{
 let calls=0,errors=0,finish;const done=new Promise(resolve=>finish=resolve);
 const scheduler=startReminderScheduler({intervalMs:2,run:async()=>{if(++calls===1)throw Error('Expected isolated failure');return 'ok';},onError:()=>errors++,onResult:result=>{assert.equal(result,'ok');scheduler.stop();finish();}});
 try{await Promise.race([done,new Promise((_,reject)=>setTimeout(()=>reject(Error('timer did not recover')),2000))]);assert.equal(errors,1);assert.equal(calls,2);}finally{scheduler.stop();}
});
