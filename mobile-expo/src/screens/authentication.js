import React, { useState } from 'react';
import { Alert, Image, ImageBackground, Pressable, ScrollView, StatusBar, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Screen, Logo, Button, Field, Card } from '../components/ui.js';
import { styles } from '../theme/styles.js';
import { ROLE_LABELS } from '../constants.js';
import { userErrorMessage } from '../services/userErrors.js';

export function WelcomeScreen({ go, loading = false }) {
  return (
    <ImageBackground source={require('../../assets/welcome-background.png')} resizeMode="stretch" style={styles.welcome}>
      <SafeAreaView style={styles.flex}>
        <StatusBar barStyle="light-content" />
        <ScrollView bounces={false} contentContainerStyle={styles.welcomeBrandScroll}>
          <View style={styles.welcomeBrandInner}>
            <View style={styles.welcomeUniversity}><Image source={require('../../assets/unifor-logo.png')} resizeMode="contain" accessibilityRole="image" accessibilityLabel="Universidade de Fortaleza" style={styles.welcomeUniversityImage} /></View>
            <View style={styles.welcomeBook}><Image source={require('../../assets/monimob-book.png')} resizeMode="contain" accessible={false} style={styles.welcomeBookImage} /></View>
            <Text accessibilityRole="header" style={styles.welcomeBrandTitle}>MoniMob</Text>
            <Text style={styles.welcomeTagline}>Monitoria acadêmica mais simples, próxima e conectada.</Text>
            <View style={styles.welcomeActions}>
              <Pressable accessibilityRole="button" accessibilityLabel="Entrar" accessibilityState={{disabled: loading, busy: loading}} disabled={loading} onPress={() => go('login')} style={({pressed}) => [styles.welcomeAction, styles.welcomeActionPrimary, pressed && styles.pressed]}><Text style={styles.welcomeActionPrimaryText}>Entrar</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Criar conta" accessibilityState={{disabled: loading, busy: loading}} disabled={loading} onPress={() => go('register')} style={({pressed}) => [styles.welcomeAction, styles.welcomeActionSecondary, pressed && styles.pressed]}><Text style={styles.welcomeActionSecondaryText}>Criar conta</Text></Pressable>
            </View>
            <Text style={styles.welcomeCourse}>Exclusivo para disciplinas atuais de Ciências da Computação</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

export function LoginScreen({ auth, onBack, onForgot, onSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const signedUser = await auth.signIn(email, password);
      onSuccess(signedUser);
    } catch (error) { setNeedsVerification(error.code === 'EMAIL_NOT_VERIFIED'); Alert.alert('Acesso não autorizado', userErrorMessage(error)); } finally { setBusy(false); }
  };
  const resend = async () => {
    if (busy) return;
    setBusy(true);
    try { const result = await auth.resendVerification(email, password); Alert.alert('Confirmação de e-mail', result.message); }
    catch (error) { Alert.alert('Confirmação de e-mail', userErrorMessage(error)); }
    finally { setBusy(false); }
  };
  return <Screen title="Entrar" subtitle="Acesse sua conta" onBack={onBack}><Logo /><Field label="E-mail institucional" value={email} onChangeText={setEmail} keyboardType="email-address" /><Field label="Senha" value={password} onChangeText={setPassword} secureTextEntry /><Button label={busy ? 'Entrando…' : 'Entrar'} disabled={busy} onPress={submit} />{needsVerification ? <Button label="Reenviar confirmação de e-mail" variant="outline" disabled={busy} onPress={resend} /> : null}<Button label="Esqueci minha senha" variant="ghost" onPress={onForgot} /></Screen>;
}

export function RegisterScreen({ auth, onBack, onSuccess }) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', registration: '', email: '', password: '' });
  const set = key => value => setForm(previous => ({ ...previous, [key]: value }));
  const submit = async () => { if (busy) return; setBusy(true); try { if (!form.name || !form.registration || !form.email || form.password.length < 8) throw new Error('Preencha os campos e use senha com pelo menos 8 caracteres.'); const result = await auth.registerStudent(form); Alert.alert('Confirme seu e-mail', `Enviamos um link de confirmação para ${result.email}. Abra a mensagem e confirme o endereço antes de entrar no MoniMob.`, [{ text: 'Entendi', onPress: onBack }]); } catch (error) { const message = error?.code === 'permission-denied' ? 'Não foi possível registrar essa matrícula. Ela pode já estar vinculada a outra conta ou os dados não atendem às regras do cadastro.' : userErrorMessage(error); Alert.alert('Cadastro', message); } finally { setBusy(false); } };
  return <Screen title="Criar conta" subtitle="Cadastro de aluno" onBack={onBack}><Card accent><Text style={styles.cardBody}>Monitores e professores não se autocadastram. Esses papéis devem ser concedidos pela instituição.</Text></Card><Field label="Nome completo" value={form.name} onChangeText={set('name')} /><Field label="Matrícula" value={form.registration} onChangeText={set('registration')} keyboardType="number-pad" /><Field label="E-mail institucional" value={form.email} onChangeText={set('email')} keyboardType="email-address" /><Field label="Senha" value={form.password} onChangeText={set('password')} secureTextEntry /><Button label="Cadastrar como aluno" disabled={busy} onPress={submit} /></Screen>;
}

export function ForgotScreen({ auth, onBack }) {
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const submit = async () => { if (busy) return; setBusy(true); try { const result = await auth.requestPasswordReset(email); Alert.alert('Recuperação de senha', result.message); } catch (error) { Alert.alert('Recuperação de senha', userErrorMessage(error)); } finally { setBusy(false); } };
  return <Screen title="Recuperar senha" subtitle="Redefina sua senha por e-mail" onBack={onBack}><Card accent><Text style={styles.cardBody}>Informe o e-mail da sua conta para receber as instruções de recuperação.</Text></Card><Field label="E-mail institucional" value={email} onChangeText={setEmail} /><Button label="Solicitar recuperação" disabled={busy} onPress={submit} /></Screen>;
}

export function RoleAccessScreen({ user, chooseRole, signOut }) {
  return <Screen title="Escolher área" subtitle="Somente papéis vinculados à conta"><Text style={styles.lead}>Olá, {user.name}. Selecione o ambiente que deseja usar.</Text>{user.roles.map(role => <Card key={role}><Text style={styles.cardTitle}>{ROLE_LABELS[role]}</Text><Text style={styles.cardBody}>{role === 'student' ? 'Buscar, reservar, acessar materiais e registrar presença.' : 'Gerenciar sessões, participantes, presença e materiais.'}</Text><Button label={`Acessar como ${ROLE_LABELS[role]}`} onPress={() => chooseRole(role)} /></Card>)}<Button label="Sair" variant="outline" onPress={signOut} /></Screen>;
}
