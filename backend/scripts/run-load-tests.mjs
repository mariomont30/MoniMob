import {spawn} from 'node:child_process';
if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_AUTH_EMULATOR_HOST||process.env.GCLOUD_PROJECT!=='demo-monimob')throw new Error('Start both local Firebase emulators with project demo-monimob before running the load tests.');
const child=spawn(process.execPath,['--test',new URL('../tests/load.integration.test.js',import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/,'')],{env:{...process.env,MONIMOB_RUN_LOAD_TESTS:'1'},stdio:'inherit',windowsHide:true});
child.on('exit',code=>process.exitCode=code);
