const busy=()=>Object.assign(new Error('Há muitas operações ao mesmo tempo. Tente novamente em instantes.'),{code:'SERVER_BUSY',status:503});

// A cached Functions handler can receive many simultaneous writes. Serialize
// them within this instance; Firestore still provides cross-instance atomicity.
export class MutationQueue {
  constructor({limit=64,waitMs=15000}={}){this.limit=limit;this.waitMs=waitMs;this.jobs=[];this.running=false;}
  run(action){
    if(this.jobs.length>=this.limit)return Promise.reject(busy());
    return new Promise((resolve,reject)=>{
      const job={action,resolve,reject,timer:null};
      if(this.running)job.timer=setTimeout(()=>{
        const index=this.jobs.indexOf(job);
        if(index>=0){this.jobs.splice(index,1);reject(busy());}
      },this.waitMs);
      this.jobs.push(job);void this.drain();
    });
  }
  async drain(){
    if(this.running)return;
    const job=this.jobs.shift();if(!job)return;
    this.running=true;clearTimeout(job.timer);
    try{job.resolve(await job.action());}catch(error){job.reject(error);}
    finally{this.running=false;void this.drain();}
  }
}
