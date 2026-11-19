import React, { useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Keyboard, Text } from 'react-native';
import { Screen, Card, Field, Button } from '../components/ui.js';
import { styles } from '../theme/styles.js';
import { ROLE_LABELS } from '../constants.js';
import { userErrorMessage } from '../services/userErrors.js';

export function DeleteAccount({
  auth,
  user,
  activeRole,
  state,
  countsReady,
  onBack,
  onDeleted,
  onGuardChange,
}) {
  const [password, setPassword] = useState('');
  const [phase, setPhase] = useState('input');
  const [error, setError] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const lock = useRef(false),
    active = useRef(true),
    finished = useRef(false);
  const blocked = phase === 'verifying' || phase === 'deleting' || phase === 'done';
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      auth.clearDeletionVerification();
      onGuardChange(false);
    };
  }, []);
  const leave = () => {
    if (lock.current || finished.current) return;
    auth.clearDeletionVerification();
    onGuardChange(false);
    onBack();
  };
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!blocked) leave();
      return true;
    });
    return () => subscription.remove();
  }, [blocked]);
  const verify = async () => {
    if (lock.current) return;
    if (!password) {
      setError('Informe sua senha atual.');
      return;
    }
    lock.current = true;
    setPhase('verifying');
    setError('');
    setResetMessage('');
    onGuardChange(true);
    try {
      await auth.verifyDeletionPassword(user.id, password);
      if (!active.current) return;
      setPassword('');
      Keyboard.dismiss();
      setPhase('confirm');
    } catch (cause) {
      if (active.current) {
        setError(
          [
            'auth/wrong-password',
            'auth/invalid-credential',
            'auth/invalid-login-credentials',
          ].includes(cause.code)
            ? 'Senha incorreta. Confira e tente novamente.'
            : userErrorMessage(cause),
        );
        setPhase('input');
        onGuardChange(false);
      }
    } finally {
      lock.current = false;
    }
  };
  const remove = async () => {
    if (lock.current || finished.current) return;
    lock.current = true;
    setError('');
    setPhase('deleting');
    try {
      await auth.deleteAccount(user.id);
      finished.current = true;
      if (!active.current) return;
      setPassword('');
      setPhase('done');
      Alert.alert(
        'Conta excluída',
        'Sua conta foi excluída com sucesso',
        [
          {
            text: 'OK',
            onPress: () => {
              if (!active.current) return;
              onGuardChange(false);
              void onDeleted();
            },
          },
        ],
        { cancelable: false },
      );
    } catch (cause) {
      if (active.current) {
        setError(
          cause.code === 'RECENT_LOGIN_REQUIRED' || cause.code === 'PASSWORD_VERIFICATION_REQUIRED'
            ? 'A validação expirou. Informe sua senha atual neste campo para continuar.'
            : userErrorMessage(cause),
        );
        if (['RECENT_LOGIN_REQUIRED', 'PASSWORD_VERIFICATION_REQUIRED'].includes(cause.code)) {
          setPhase('input');
          onGuardChange(false);
        } else setPhase('confirm');
      }
    } finally {
      lock.current = false;
    }
  };
  const resetPassword = async () => {
    if (lock.current) return;
    lock.current = true;
    setError('');
    setResetMessage('');
    setPhase('verifying');
    onGuardChange(true);
    try {
      const result = await auth.requestPasswordReset(user.email);
      if (active.current) setResetMessage(result.message);
    } catch (cause) {
      if (active.current) setError(userErrorMessage(cause));
    } finally {
      lock.current = false;
      if (active.current) {
        setPhase('input');
        onGuardChange(false);
      }
    }
  };
  const start = (session) => Date.parse(`${session.date}T${session.time}:00-03:00`);
  const upcoming = (state?.sessions || []).filter(
    (s) => !s.archived && s.status !== 'cancelled' && start(s) > Date.now(),
  );
  const bookings = (state?.reservations || []).filter(
    (r) =>
      r.studentId === user.id &&
      r.status === 'confirmed' &&
      upcoming.some((s) => s.id === r.sessionId),
  ).length;
  const sessions = upcoming.filter(
    (s) => s.monitorId === user.id || s.professorId === user.id,
  ).length;
  return (
    <Screen
      title="Excluir conta"
      subtitle="Uma decisão definitiva"
      role={activeRole}
      onBack={blocked ? undefined : leave}
    >
      {phase === 'done' ? (
        <Card>
          <Text accessibilityRole="header" style={styles.cardTitle}>
            Exclusão concluída
          </Text>
          <Text style={styles.cardBody}>Toque em OK na confirmação para voltar ao início.</Text>
        </Card>
      ) : (
        <>
          <Card accent>
            <Text style={styles.cardTitle}>{user.email}</Text>
            <Text style={styles.cardBody}>
              Perfis vinculados: {user.roles.map((role) => ROLE_LABELS[role]).join(', ')}
            </Text>
          </Card>
          <Card>
            <Text accessibilityRole="header" style={styles.cardTitle}>
              O que será excluído?
            </Text>
            <Text style={styles.cardBody}>
              Todos os perfis desta conta serão encerrados. Suas reservas futuras e as monitorias
              futuras sob sua responsabilidade serão canceladas. Nome, e-mail e matrícula serão
              removidos do perfil. O histórico acadêmico será preservado com um perfil desativado.
            </Text>
            {countsReady ? (
              <Text style={styles.meta}>
                Nos dados carregados: {bookings} reserva(s) e {sessions} monitoria(s) futura(s)
                afetadas.
              </Text>
            ) : null}
          </Card>
          {phase === 'confirm' || phase === 'deleting' ? (
            <Card>
              <Text accessibilityRole="header" style={styles.cardTitle}>
                Deseja excluir definitivamente sua conta?
              </Text>
              <Text style={styles.cardBody}>
                Sua senha foi validada. Esta ação não pode ser desfeita.
              </Text>
              {error ? (
                <Text
                  accessibilityRole="alert"
                  accessibilityLiveRegion="assertive"
                  style={{ color: '#B42318' }}
                >
                  {error}
                </Text>
              ) : null}
              <Button
                label="Manter minha conta"
                variant="outline"
                disabled={blocked}
                onPress={leave}
              />
              <Button
                label={phase === 'deleting' ? 'Excluindo conta…' : 'Excluir definitivamente'}
                variant="delete"
                disabled={blocked}
                onPress={remove}
              />
            </Card>
          ) : (
            <Card>
              <Field
                label="Senha atual"
                value={password}
                secureTextEntry
                editable={!blocked}
                error={error}
                onChangeText={(value) => {
                  setPassword(value);
                  setError('');
                  auth.clearDeletionVerification();
                }}
              />
              <Button
                label={phase === 'verifying' ? 'Aguarde…' : 'Continuar com a exclusão'}
                variant="delete"
                disabled={blocked}
                onPress={verify}
              />
              <Button
                label="Esqueci minha senha"
                variant="ghost"
                disabled={blocked}
                onPress={resetPassword}
              />
              {resetMessage ? (
                <Text accessibilityLiveRegion="polite" style={styles.cardBody}>
                  {resetMessage}
                </Text>
              ) : null}
              <Button label="Cancelar" variant="outline" disabled={blocked} onPress={leave} />
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
