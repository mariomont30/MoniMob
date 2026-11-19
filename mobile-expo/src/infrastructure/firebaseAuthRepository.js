import {
  signInWithEmailAndPassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  reload,
  updateProfile,
} from 'firebase/auth';

import { doc, getDocFromServer, updateDoc } from 'firebase/firestore';

import { auth, db } from '../services/firebaseConfig.js';
import { AuthRepository } from './repositories.js';
import { apiRequest } from '../services/academicApi.js';
import { restoreVerifiedSession } from '../services/sessionRestore.js';

import { validateRegistration, validateEmail } from '../services/formValidation.js';

export class FirebaseAuthRepository extends AuthRepository {
  async restore() {
    return restoreVerifiedSession({
      ready: () => auth.authStateReady(),
      currentUser: () => auth.currentUser,
      readProfile: (user) => this.readProfile(user),
      signOut: () => signOut(auth),
    });
  }

  async getToken(expectedUserId) {
    if (expectedUserId && auth.currentUser?.uid !== expectedUserId)
      throw new Error('Sua sessão mudou. Entre novamente.');
    if (!auth.currentUser) throw new Error('Entre na sua conta para usar o MoniBot.');
    return auth.currentUser.getIdToken();
  }

  async readProfile(firebaseUser) {
    await reload(firebaseUser);
    if (!firebaseUser.emailVerified)
      throw Object.assign(
        new Error('Confirme seu e-mail institucional pelo link enviado antes de entrar.'),
        { code: 'EMAIL_NOT_VERIFIED' },
      );
    await firebaseUser.getIdToken(true);
    let snapshot = await getDocFromServer(doc(db, 'users', firebaseUser.uid));
    if (!snapshot.exists())
      throw new Error('Perfil acadêmico não cadastrado. Solicite a regularização da conta.');
    let activatedProfile = null;
    const data = snapshot.data();
    if (
      (data.requestedRole && data.registrationStatus === 'awaiting_email') ||
      (!data.registrationStatus && data.roles?.length === 1 && data.roles[0] === 'student')
    ) {
      const activation = await apiRequest('/api/registration/activate', {
        method: 'POST',
        token: await firebaseUser.getIdToken(true),
        body: {},
      });
      if (activation.activated) activatedProfile = activation.profile;
      await firebaseUser.getIdToken(true);
      snapshot = await getDocFromServer(doc(db, 'users', firebaseUser.uid));
    }
    const profile = snapshot.data();
    if (
      String(profile.email || '').toLowerCase() !== String(firebaseUser.email || '').toLowerCase()
    )
      throw new Error(
        'O e-mail do perfil não corresponde à conta autenticada. Solicite a regularização.',
      );
    const roles = (Array.isArray(profile.roles) ? profile.roles : []).filter((role) =>
      ['student', 'monitor', 'professor'].includes(role),
    );
    if (!roles.length) throw new Error('Usuário sem perfil autorizado.');
    return { ...profile, id: firebaseUser.uid, roles, activatedProfile };
  }

  async signIn(email, password) {
    const credential = await signInWithEmailAndPassword(auth, String(email).trim(), password);

    try {
      return await this.readProfile(credential.user);
    } catch (error) {
      if (auth.currentUser?.uid === credential.user.uid) await signOut(auth);
      throw error;
    }
  }

  async signOut() {
    await signOut(auth);
    return true;
  }

  async resendVerification(email, password) {
    auth.languageCode = 'pt-BR';
    const credential = await signInWithEmailAndPassword(auth, String(email).trim(), password);
    try {
      if (credential.user.emailVerified)
        return { message: 'Seu e-mail já está confirmado. Entre novamente na conta.' };
      await sendEmailVerification(credential.user);
      return {
        message: 'Um novo link foi enviado. Confira sua caixa de entrada e a pasta de spam.',
      };
    } finally {
      if (auth.currentUser?.uid === credential.user.uid) await signOut(auth);
    }
  }

  async registerStudent(input) {
    return this.registerAccount({ ...input, role: 'student' });
  }

  async registerAccount(input) {
    auth.languageCode = 'pt-BR';
    const role = input.role || 'student';
    validateRegistration({ ...input, role });
    const email = validateEmail(input.email),
      name = input.name.trim(),
      registration = input.registration.trim().toLowerCase();
    let credential;
    try {
      credential = await createUserWithEmailAndPassword(auth, email, input.password);
    } catch (error) {
      if (error.code !== 'auth/email-already-in-use') throw error;
      credential = await signInWithEmailAndPassword(auth, email, input.password);
      if (credential.user.emailVerified) {
        await signOut(auth);
        throw Object.assign(
          new Error('Este e-mail já está cadastrado. Entre ou recupere sua senha.'),
          { code: 'auth/email-already-in-use' },
        );
      }
    }
    try {
      const result = await apiRequest('/api/registration', {
        method: 'POST',
        token: await credential.user.getIdToken(),
        body: { name, registration, role },
      });
      try {
        await sendEmailVerification(credential.user);
      } catch {
        throw new Error(
          'Seu cadastro foi salvo, mas o e-mail não pôde ser enviado agora. Na tela Entrar, informe seu e-mail e senha e use Reenviar confirmação de e-mail.',
        );
      }
      return result;
    } finally {
      if (auth.currentUser?.uid === credential.user.uid) await signOut(auth);
    }
  }

  async requestPasswordReset(email) {
    auth.languageCode = 'pt-BR';
    validateEmail(email);
    try {
      await sendPasswordResetEmail(auth, String(email).trim().toLowerCase());
    } catch (error) {
      if (error.code !== 'auth/user-not-found') throw error;
    }

    return {
      message: 'Se o e-mail estiver cadastrado, você receberá instruções de recuperação.',
    };
  }

  clearDeletionVerification() {
    this.deletionVerification = null;
  }

  async verifyDeletionPassword(userId, password) {
    this.clearDeletionVerification();
    const account = auth.currentUser;
    if (!account || account.uid !== userId || !account.email)
      throw new Error('Sua sessão mudou. Entre novamente.');
    if (!password) throw new Error('Informe sua senha atual.');
    const credential = await reauthenticateWithCredential(
      account,
      EmailAuthProvider.credential(account.email, password),
    );
    if (auth.currentUser?.uid !== userId || credential.user.uid !== userId)
      throw new Error('Sua sessão mudou. Entre novamente.');
    // Reauthentication can replace the User's token manager. Use its returned
    // user, rather than a previously captured User with an older refresh token.
    const token = await credential.user.getIdToken(true);
    if (auth.currentUser?.uid !== userId) throw new Error('Sua sessão mudou. Entre novamente.');
    this.deletionVerification = { userId, token, expiresAt: Date.now() + 240000 };
    return { verified: true };
  }

  async deleteAccount(userId) {
    const proof = this.deletionVerification;
    if (auth.currentUser?.uid !== userId) throw new Error('Sua sessão mudou. Entre novamente.');
    if (!proof || proof.userId !== userId || Date.now() >= proof.expiresAt) {
      this.clearDeletionVerification();
      throw Object.assign(new Error('Valide sua senha atual para continuar.'), {
        code: 'PASSWORD_VERIFICATION_REQUIRED',
      });
    }
    const result = await apiRequest('/api/account/delete', {
      method: 'POST',
      token: proof.token,
      body: { confirmation: 'DELETE' },
    });
    if (result.deleted !== true)
      throw new Error('Não foi possível confirmar a exclusão. Tente novamente.');
    this.clearDeletionVerification();
    try {
      if (auth.currentUser?.uid === userId) await signOut(auth);
    } catch {}
    return result;
  }

  async updateProfile(userId, input) {
    if (auth.currentUser?.uid !== userId) {
      throw new Error('Usuário não autorizado.');
    }

    const name = String(input.name || '').trim();

    if (!name || name.length > 120) {
      throw new Error('Informe seu nome, com até 120 caracteres.');
    }

    await updateProfile(auth.currentUser, {
      displayName: name,
    });

    await updateDoc(doc(db, 'users', userId), {
      name,
    });

    const snapshot = await getDocFromServer(doc(db, 'users', userId));

    return {
      id: userId,
      ...snapshot.data(),
    };
  }
}
