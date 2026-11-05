
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  reload,
  updateProfile,
  deleteUser,
} from "firebase/auth";

import {
  doc,
  getDocFromServer,
  writeBatch,
  updateDoc,
} from "firebase/firestore";

import { auth, db } from "../services/firebaseConfig.js";
import { AuthRepository } from "./repositories.js";

const isInstitutionalEmail = value => /.+@(edu\.unifor\.br|unifor\.br)$/i.test(String(value || '').trim());

export class FirebaseAuthRepository extends AuthRepository {
  async restore() {
    await auth.authStateReady();
    if (!auth.currentUser) return null;
    await reload(auth.currentUser);
    if (!auth.currentUser.emailVerified) { await signOut(auth); return null; }
    return this.readProfile(auth.currentUser);
  }

  async getToken() {
    if (!auth.currentUser) throw new Error('Entre na sua conta para usar o MoniBot.');
    return auth.currentUser.getIdToken();
  }

  async readProfile(firebaseUser) {
    await reload(firebaseUser);
    if (!firebaseUser.emailVerified) throw Object.assign(new Error('Confirme seu e-mail institucional pelo link enviado antes de entrar.'), { code: 'EMAIL_NOT_VERIFIED' });
    await firebaseUser.getIdToken(true);
    const snapshot = await getDocFromServer(doc(db, 'users', firebaseUser.uid));
    if (!snapshot.exists()) throw new Error('Perfil acadêmico não cadastrado. Solicite a regularização da conta.');
    const profile = snapshot.data();
    if (String(profile.email || '').toLowerCase() !== String(firebaseUser.email || '').toLowerCase()) throw new Error('O e-mail do perfil não corresponde à conta autenticada. Solicite a regularização.');
    const roles = (Array.isArray(profile.roles) ? profile.roles : []).filter(role => ['student', 'monitor', 'professor'].includes(role));
    if (!roles.length) throw new Error('Usuário sem perfil autorizado.');
    return { ...profile, id: firebaseUser.uid, roles };
  }

  async signIn(email, password) {
    const credential = await signInWithEmailAndPassword(
      auth,
      String(email).trim(),
      password
    );

    try { return await this.readProfile(credential.user); }
    catch (error) { await signOut(auth); throw error; }
  }

  async signOut() {
    await signOut(auth);
    return true;
  }

  async resendVerification(email, password) {
    const credential = await signInWithEmailAndPassword(auth, String(email).trim(), password);
    try {
      if (credential.user.emailVerified) return { message: 'Seu e-mail já está confirmado. Entre novamente na conta.' };
      await sendEmailVerification(credential.user);
      return { message: 'Um novo link foi enviado. Confira sua caixa de entrada e a pasta de spam.' };
    } finally { await signOut(auth); }
  }

  async registerStudent(input) {
    const name = String(input.name || "").trim();
    const registration = String(input.registration || "").trim().toLowerCase();
    const email = String(input.email || "").trim().toLowerCase();
    const password = input.password || "";

    if (!name || !/^[a-z0-9._-]{4,64}$/.test(registration) || !email || password.length < 8) {
      throw new Error("Preencha todos os campos corretamente. A matrícula deve ter de 4 a 64 caracteres alfanuméricos.");
    }
    if (!isInstitutionalEmail(email)) throw new Error('Use seu e-mail institucional @edu.unifor.br ou @unifor.br.');

    const credential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

    const user = {
      id: credential.user.uid,
      name,
      registration,
      email,
      roles: ["student"],
      course: "Ciências da Computação",
    };

    try {
      await sendEmailVerification(credential.user);
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', user.id), user);
      batch.set(doc(db, 'studentRegistrationIndex', registration), { uid: user.id });
      await batch.commit();
    } catch (error) {
      // Roll back only the newly created Auth account if registration cannot finish.
      try { await deleteUser(credential.user); }
      catch { await signOut(auth); throw new Error('Não foi possível concluir nem desfazer o cadastro. Solicite a regularização antes de tentar novamente.'); }
      throw error;
    }
    await signOut(auth);
    return { email, requiresEmailVerification: true };
  }

  async requestPasswordReset(email) {
    await sendPasswordResetEmail(
      auth,
      String(email).trim().toLowerCase()
    );

    return {
      message:
        "Se o e-mail estiver cadastrado, você receberá instruções de recuperação.",
    };
  }

  async updateProfile(userId, input) {
    if (auth.currentUser?.uid !== userId) {
      throw new Error("Usuário não autorizado.");
    }

    const name = String(input.name || "").trim();

    if (!name) {
      throw new Error("Informe o nome completo.");
    }

    await updateProfile(auth.currentUser, {
      displayName: name,
    });

    await updateDoc(doc(db, "users", userId), {
      name,
    });

    const snapshot = await getDocFromServer(doc(db, "users", userId));

    return {
      id: userId,
      ...snapshot.data(),
    };
  }
}
