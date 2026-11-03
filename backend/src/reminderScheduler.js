export function startReminderScheduler({ run, intervalMs = 3600000, onResult = () => {}, onError = () => {} }) {
  if (!Number.isFinite(intervalMs) || intervalMs < 1) throw new Error('Invalid reminder interval');
  let running=false,stopped=false;
  const tick=async()=>{
    if(running||stopped)return;
    running=true;
    try { const result=await run();if(!stopped)await onResult(result); }
    catch(error){if(!stopped)onError(error);}
    finally{running=false;}
  };
  const timer=setInterval(()=>void tick(),intervalMs);
  return { stop(){stopped=true;clearInterval(timer);} };
}
