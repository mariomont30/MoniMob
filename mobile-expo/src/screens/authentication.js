import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Image, Pressable, ScrollView, StatusBar, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useOpeningExperience } from '../components/launchExperience.js';
import { OpeningBackdrop, OpeningEmblem } from '../components/openingVisuals.js';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Screen, Logo, Button, Field, Card, Choice } from '../components/ui.js';
import { styles } from '../theme/styles.js';
import { ROLE_LABELS } from '../constants.js';
import { validateRegistration, validateEmail } from '../services/formValidation.js';
import { userErrorMessage } from '../services/userErrors.js';

function useFormActive() {
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  return active;
}

export function WelcomeScreen({ go, loading = false }) {
  const openingStyle = useOpeningExperience();
  return (
    <View style={styles.welcome}>
      <LinearGradient
        pointerEvents="none"
        colors={['#081A65', '#1036CC', '#0058F5', '#007FA8']}
        locations={[0, 0.32, 0.65, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.welcomeBackground}
      />
      <OpeningBackdrop progress={openingStyle.progress} />
      <SafeAreaView style={styles.welcomeViewport}>
        <StatusBar barStyle="light-content" />
        <ScrollView
          style={styles.welcomeViewport}
          bounces={false}
          contentContainerStyle={styles.welcomeBrandScroll}
        >
          <View style={styles.welcomeBrandInner}>
            <Animated.View style={[styles.welcomeUniversity, openingStyle.universityStyle]}>
              <Image
                source={require('../../assets/unifor-logo.png')}
                resizeMode="contain"
                accessibilityRole="image"
                accessibilityLabel="Universidade de Fortaleza"
                style={styles.welcomeUniversityImage}
              />
            </Animated.View>
            <OpeningEmblem opening={openingStyle} />
            <Animated.Text
              accessibilityRole="header"
              style={[styles.welcomeBrandTitle, openingStyle.titleStyle]}
            >
              MoniMob
            </Animated.Text>
            <Animated.Text style={[styles.welcomeTagline, openingStyle.taglineStyle]}>
              Monitoria acadêmica mais simples, próxima e conectada.
            </Animated.Text>
            <Animated.View style={[styles.welcomeActions, openingStyle.actionsStyle]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Entrar"
                accessibilityState={{ disabled: loading, busy: loading }}
                disabled={loading}
                onPress={() => go('login')}
                style={({ pressed }) => [
                  styles.welcomeAction,
                  styles.welcomeActionPrimary,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.welcomeActionPrimaryText}>Entrar</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Criar conta"
                accessibilityState={{ disabled: loading, busy: loading }}
                disabled={loading}
                onPress={() => go('register')}
                style={({ pressed }) => [
                  styles.welcomeAction,
                  styles.welcomeActionSecondary,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.welcomeActionSecondaryText}>Criar conta</Text>
              </Pressable>
            </Animated.View>
            <Text style={styles.welcomeCourse}>
              Exclusivo para disciplinas atuais do curso de Ciências da Computação.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

export function LoginScreen({ auth, onBack, onForgot, onSuccess }) {
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const requestLock = useRef(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const submit = async () => {
    if (requestLock.current) return;
    requestLock.current = true;
    setBusy(true);
    try {
      validateEmail(email);
      if (!password) throw new Error('Informe sua senha.');
      const signedUser = await auth.signIn(email, password);
      if (!active.current) return;
      if (signedUser.activatedProfile)
        Alert.alert(
          'Permissão concedida',
          'Permissão concedida para o perfil ' +
            signedUser.activatedProfile +
            '. Seu e-mail foi confirmado.',
        );
      onSuccess(signedUser);
    } catch (error) {
      if (active.current) {
        setNeedsVerification(error.code === 'EMAIL_NOT_VERIFIED');
        Alert.alert('Acesso não autorizado', userErrorMessage(error));
      }
    } finally {
      requestLock.current = false;
      if (active.current) setBusy(false);
    }
  };
  const resend = async () => {
    if (requestLock.current) return;
    requestLock.current = true;
    setBusy(true);
    try {
      const result = await auth.resendVerification(email, password);
      if (!active.current) return;
      Alert.alert('Confirmação de e-mail', result.message);
    } catch (error) {
      if (active.current) Alert.alert('Confirmação de e-mail', userErrorMessage(error));
    } finally {
      requestLock.current = false;
      if (active.current) setBusy(false);
    }
  };
  return (
    <Screen title="Entrar" subtitle="Acesse sua conta" onBack={onBack}>
      <Logo />
      <Field
        editable={!busy}
        label="E-mail institucional"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
      />
      <Field
        editable={!busy}
        label="Senha"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <Button label={busy ? 'Entrando…' : 'Entrar'} disabled={busy} onPress={submit} />
      {needsVerification ? (
        <Button
          label="Reenviar confirmação de e-mail"
          variant="outline"
          disabled={busy}
          onPress={resend}
        />
      ) : null}
      <Button label="Esqueci minha senha" variant="ghost" onPress={onForgot} />
    </Screen>
  );
}

export function RegisterScreen({ auth, onBack }) {
  const active = useFormActive();
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const requestLock = useRef(false);
  const [form, setForm] = useState({
    name: '',
    registration: '',
    email: '',
    password: '',
    role: 'student',
    confirmPassword: '',
  });
  const set = (key) => (value) => {
    setErrors((previous) => ({ ...previous, [key]: null }));
    setForm((previous) => ({ ...previous, [key]: value }));
  };
  const submit = async () => {
    if (requestLock.current) return;
    requestLock.current = true;
    setBusy(true);
    try {
      validateRegistration(form);
      const result = await auth.registerAccount(form);
      if (!active.current) return;
      Alert.alert(
        'Confirmação de acesso — ' + ROLE_LABELS[form.role],
        'Enviamos um e-mail de confirmação para ' +
          result.email +
          '. Confirme o endereço para ativar seu acesso como ' +
          ROLE_LABELS[form.role] +
          '. Depois, entre com seu e-mail e senha.',
        [{ text: 'Entendi', onPress: onBack }],
      );
    } catch (error) {
      if (!active.current) return;
      setErrors(error.field ? { [error.field]: error.message } : {});
      Alert.alert('Cadastro', userErrorMessage(error));
    } finally {
      requestLock.current = false;
      setBusy(false);
    }
  };
  return (
    <Screen title="Criar conta" subtitle="Escolha seu perfil" onBack={onBack}>
      {['student', 'monitor', 'professor'].map((role) => (
        <Choice
          key={role}
          label={'Sou ' + ROLE_LABELS[role]}
          selected={form.role === role}
          onPress={() => {
            if (!busy) set('role')(role);
          }}
        />
      ))}
      <Card accent>
        <Text style={styles.cardBody}>
          Confirme seu e-mail institucional para ativar o perfil escolhido. As disciplinas e os
          vínculos acadêmicos continuam sendo cadastrados separadamente.
        </Text>
      </Card>
      <Field
        editable={!busy}
        label="Nome completo"
        error={errors.name}
        value={form.name}
        onChangeText={set('name')}
      />
      <Field
        editable={!busy}
        label={form.role === 'professor' ? 'Registro funcional' : 'Matrícula'}
        error={errors.registration}
        value={form.registration}
        onChangeText={set('registration')}
      />
      <Field
        editable={!busy}
        label="E-mail institucional"
        error={errors.email}
        value={form.email}
        onChangeText={set('email')}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
      />
      <Field
        editable={!busy}
        label="Senha (mínimo de 8 caracteres)"
        error={errors.password}
        value={form.password}
        onChangeText={set('password')}
        secureTextEntry
      />
      <Field
        editable={!busy}
        label="Confirmar senha"
        error={errors.confirmPassword}
        value={form.confirmPassword}
        onChangeText={set('confirmPassword')}
        secureTextEntry
      />
      <Button
        label={busy ? 'Preparando confirmação…' : 'Cadastrar como ' + ROLE_LABELS[form.role]}
        disabled={busy}
        onPress={submit}
      />
    </Screen>
  );
}

export function ForgotScreen({ auth, onBack }) {
  const active = useFormActive();
  const [busy, setBusy] = useState(false);
  const requestLock = useRef(false);
  const [email, setEmail] = useState('');
  const submit = async () => {
    if (requestLock.current) return;
    requestLock.current = true;
    setBusy(true);
    try {
      validateEmail(email);
      const result = await auth.requestPasswordReset(email);
      if (!active.current) return;
      Alert.alert('Recuperação de senha', result.message);
    } catch (error) {
      if (active.current) Alert.alert('Recuperação de senha', userErrorMessage(error));
    } finally {
      requestLock.current = false;
      setBusy(false);
    }
  };
  return (
    <Screen title="Recuperar senha" subtitle="Redefina sua senha por e-mail" onBack={onBack}>
      <Card accent>
        <Text style={styles.cardBody}>
          Informe o e-mail da sua conta para receber as instruções de recuperação.
        </Text>
      </Card>
      <Field
        editable={!busy}
        label="E-mail institucional"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
      />
      <Button label="Solicitar recuperação" disabled={busy} onPress={submit} />
    </Screen>
  );
}

export function RoleAccessScreen({ user, chooseRole, signOut }) {
  return (
    <Screen title="Escolher área" subtitle="Somente papéis vinculados à conta">
      <Text style={styles.lead}>Olá, {user.name}. Selecione o ambiente que deseja usar.</Text>
      {user.roles.map((role) => (
        <Card key={role}>
          <Text style={styles.cardTitle}>{ROLE_LABELS[role]}</Text>
          <Text style={styles.cardBody}>
            {role === 'student'
              ? 'Buscar, reservar, acessar materiais e registrar presença.'
              : role === 'professor'
                ? 'Supervisionar disciplinas, validar monitorias e materiais e exportar relatórios.'
                : 'Gerenciar sessões, participantes, presença e materiais.'}
          </Text>
          <Button label={`Acessar como ${ROLE_LABELS[role]}`} onPress={() => chooseRole(role)} />
        </Card>
      ))}
      <Button label="Sair" variant="primary" onPress={signOut} />
    </Screen>
  );
}
