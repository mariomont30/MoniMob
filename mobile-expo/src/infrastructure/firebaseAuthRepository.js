
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  deleteUser,
} from "firebase/auth";

import {
  doc,
  getDocFromServer,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import { auth, db } from "../services/firebaseConfig.js";
import { AuthRepository } from "./repositories.js";

export class FirebaseAuthRepository extends AuthRepository {
  async restore() {
    await auth.authStateReady();
    if (!auth.currentUser) return null;
    return this.readProfile(auth.currentUser);
  }

  async getToken() {
    if (!auth.currentUser) throw new Error('Entre na sua conta para usar o MoniBot.');
    return auth.currentUser.getIdToken();
  }

  async readProfile(firebaseUser) {
    const snapshot = await getDocFromServer(doc(db, 'users', firebaseUser.uid));
    if (!snapshot.exists()) throw new Error('Perfil acadêmico não cadastrado. Solicite a regularização da conta.');
    const profile = snapshot.data();
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

  async registerStudent(input) {
    const name = String(input.name || "").trim();
    const registration = String(input.registration || "").trim();
    const email = String(input.email || "").trim().toLowerCase();
    const password = input.password || "";

    if (!name || !registration || !email || password.length < 8) {
      throw new Error("Preencha todos os campos corretamente.");
    }

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
      course: "Ciência da Computação",
    };

    try {
      await setDoc(doc(db, 'users', user.id), user);
    } catch (error) {
      // Roll back only the newly created Auth account if profile creation fails.
      try { await deleteUser(credential.user); }
      catch { await signOut(auth); throw new Error('Não foi possível criar o perfil nem desfazer a conta. Solicite a regularização antes de tentar novamente.'); }
      throw error;
    }

    return user;
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
