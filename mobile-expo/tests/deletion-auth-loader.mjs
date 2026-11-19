export async function resolve(specifier,context,next){
 if(specifier==='firebase/auth')return{url:'data:text/javascript,'+encodeURIComponent(['reauthenticateWithCredential','signInWithEmailAndPassword','createUserWithEmailAndPassword','signOut','sendPasswordResetEmail','sendEmailVerification','reload','updateProfile'].map(name=>`export const ${name}=(...args)=>globalThis.__firebaseMocks.${name}(...args);`).join('\n')+'\nexport const EmailAuthProvider={credential:(...args)=>globalThis.__firebaseMocks.credential(...args)};'),shortCircuit:true};
 if(specifier==='firebase/firestore')return{url:'data:text/javascript,export const doc=()=>null;export const getDocFromServer=()=>null;export const updateDoc=()=>null;',shortCircuit:true};
 if(specifier.endsWith('firebaseConfig.js'))return{url:'data:text/javascript,export const auth=globalThis.__firebaseAuth;export const db={};',shortCircuit:true};
 if(specifier.endsWith('academicApi.js'))return{url:'data:text/javascript,export const apiRequest=(...args)=>globalThis.__registrationApi(...args);',shortCircuit:true};
 return next(specifier,context);
}
