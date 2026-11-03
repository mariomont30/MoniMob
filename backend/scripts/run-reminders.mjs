import {getFirestore} from 'firebase-admin/firestore';
import {getFirebaseAdminAuth} from '../src/firebaseAdmin.js';
import {FirestoreStore} from '../src/firestoreStore.js';
import {sendReminders} from '../src/reminders.js';
import {startReminderScheduler} from '../src/reminderScheduler.js';

if(!process.argv.includes('--apply'))throw new Error('Use --apply with authorized Firebase credentials to enable local reminders.');
getFirebaseAdminAuth();const store=new FirestoreStore(getFirestore());
const runner=startReminderScheduler({run:()=>sendReminders(store),onResult:()=>console.log('Reminder cycle completed.'),onError:()=>console.error('Reminder cycle failed; the next hourly cycle will retry.')});
console.log('Local hourly reminders enabled. Keep this process running; this does not publish a cloud scheduler.');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{runner.stop();process.exit(0);});
