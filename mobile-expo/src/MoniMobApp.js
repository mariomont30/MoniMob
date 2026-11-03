import { userErrorMessage } from './services/userErrors.js';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Image, Keyboard, KeyboardAvoidingView, Linking, Platform, Pressable,
  ScrollView, StatusBar, StyleSheet, Text, TextInput, View, useWindowDimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FirebaseAuthRepository } from './infrastructure/firebaseAuthRepository.js';
import { loadAcademicState } from './infrastructure/academicLoader.js';
import { sendCommand } from './services/academicApi.js';
import { MonitoringService } from './domain/monitoring.js';
import { FirestoreStateRepository } from './infrastructure/repositories.js';
import { askMoniBot } from './services/monibotApi.js';
import { focusedScrollOffset, multilineBounds } from './services/keyboardLayout.js';
import { shareCsvReport } from './services/csvSharing.js';

const OperationContext = createContext(false);
const FieldFocusContext = createContext({ focusField: () => {}, viewportHeight: 800 });

const colors = {
  primary: '#0755E9', primaryDark: '#063997', secondary: '#00A6A6', background: '#F5F7FB',
  surface: '#FFFFFF', text: '#13213C', muted: '#5D6B82', border: '#DCE3EF', success: '#15803D',
  warning: '#B45309', error: '#C62828', tint: '#EAF1FF'
};

const SCREEN_NAMES = {
  welcome: 'MoniMob', login: 'Entrar', register: 'Criar conta', forgot: 'Recuperar senha',
  roleAccess: 'Escolher área', home: 'Início do aluno', catalog: 'Buscar monitorias', filters: 'Filtros',
  details: 'Detalhes', confirm: 'Confirmar reserva', agenda: 'Minha agenda', notifications: 'Notificações',
  materials: 'Materiais', attendance: 'Registrar presença', bot: 'MoniBot', profile: 'Perfil',
  monitorDashboard: 'Painel do monitor', manageSessions: 'Gerenciar monitorias', createSession: 'Cadastrar monitoria',
  participants: 'Participantes e presença', manageMaterials: 'Gerenciar materiais', createMaterial: 'Cadastrar material',
  professorDashboard: 'Painel do professor', approvals: 'Validações acadêmicas', reports: 'Relatórios acadêmicos'
};

const ROLE_LABELS = { student: 'Aluno', monitor: 'Monitor', professor: 'Professor' };

function Button({ label, onPress, variant = 'primary', disabled = false, compact = false }) {
  const processing = useContext(OperationContext);
  disabled = disabled || processing;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled, busy: processing }} accessibilityLabel={label} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.button, styles[`button_${variant}`], compact && styles.buttonCompact, disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
      <Text style={[styles.buttonText, variant !== 'primary' && styles[`buttonText_${variant}`]]}>{label}</Text>
    </Pressable>
  );
}

function Field({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, multiline = false }) {
  const input = useRef(null);
  const { focusField, viewportHeight } = useContext(FieldFocusContext);
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput ref={input} value={String(value ?? '')} onChangeText={onChangeText} placeholder={placeholder}
        onFocus={() => focusField(input.current)} onBlur={() => focusField(null)}
        placeholderTextColor={colors.muted} secureTextEntry={secureTextEntry} keyboardType={keyboardType} disableFullscreenUI
        accessibilityLabel={label} autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'} autoCorrect={!secureTextEntry && keyboardType !== 'email-address'} multiline={multiline} style={[styles.input, multiline && styles.multiline, multiline && multilineBounds(viewportHeight)]} />
    </View>
  );
}

function Card({ children, accent = false }) {
  return <View style={[styles.card, accent && styles.cardAccent]}>{children}</View>;
}

function Badge({ children, tone = 'info' }) {
  return <View style={[styles.badge, styles[`badge_${tone}`]]}><Text style={styles.badgeText}>{children}</Text></View>;
}

function Logo({ light = false }) {
  return (
    <View style={styles.logoWrap}>
      <Image
  accessible accessibilityRole="image" accessibilityLabel="Universidade de Fortaleza"
  source={require('../assets/unifor-logo.png')}
  resizeMode="contain"
  style={styles.uniforLogo}
/>
      <View collapsable={false} accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={styles.appMark}><Text accessible={false} importantForAccessibility="no" allowFontScaling={false} style={styles.appMarkIcon}>M</Text></View>
      <Text accessibilityRole="header" style={[styles.logoTitle, light && styles.lightText]}>MoniMob</Text>
      <Text style={[styles.logoSubtitle, light && styles.lightMuted]}>Monitoria universitária em um só lugar</Text>
    </View>
  );
}

function Header({ title, subtitle, onBack, role }) {
  const processing = useContext(OperationContext);
  const { width, fontScale } = useWindowDimensions();
  const stackedRole = width < 360 || (width < 600 && fontScale >= 1.5);
  return (
    <View testID="screen-header" style={styles.header}>
      {processing ? <View accessibilityLiveRegion="polite" style={styles.processing}><Text style={styles.cardBody}>Salvando…</Text></View> : null}
      <View style={styles.headerRow}>
        {onBack ? <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={onBack} style={styles.back}><Text allowFontScaling={false} style={styles.backText}>‹</Text></Pressable> : <View style={styles.backPlaceholder} />}
        <View style={styles.headerCopy}><Text accessibilityRole="header" style={styles.headerTitle}>{title}</Text>{subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}{role && stackedRole ? <View style={styles.headerRole}><Badge>{ROLE_LABELS[role]}</Badge></View> : null}</View>
        {role && !stackedRole ? <View style={styles.headerRoleSide}><Badge>{ROLE_LABELS[role]}</Badge></View> : <View style={styles.backPlaceholder} />}
      </View>
    </View>
  );
}

function Screen({ title, subtitle, onBack, role, children, footer }) {
  const { width, height, fontScale } = useWindowDimensions();
  const [keyboardVisible, setKeyboardVisible] = useState(Keyboard.isVisible());
  const scroll = useRef(null);
  const focusedField = useRef(null);
  const focusTimer = useRef(null);
  const scrollOffset = useRef(0);
  const [viewportHeight, setViewportHeight] = useState(height);
  const scrollFocusedField = () => {
    clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(() => {
      const input = focusedField.current;
      const container = scroll.current;
      if (!Keyboard.isVisible() || !input?.isFocused?.() || !container) return;
      container.measureInWindow((x, top, w, visibleHeight) => {
        input.measureInWindow((ix, inputTop, iw, inputHeight) => {
          if (focusedField.current !== input || scroll.current !== container || !input.isFocused() || !Keyboard.isVisible()) return;
          const y = focusedScrollOffset({ offset: scrollOffset.current, viewportTop: top, viewportHeight: visibleHeight,
            inputTop, inputHeight, keyboardTop: Keyboard.metrics()?.screenY });
          container.scrollTo({ y, animated: true });
        });
      });
    }, 120);
  };
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => { setKeyboardVisible(true); scrollFocusedField(); });
    const hide = Keyboard.addListener('keyboardDidHide', () => { clearTimeout(focusTimer.current); setKeyboardVisible(false); });
    return () => { show.remove(); hide.remove(); clearTimeout(focusTimer.current); };
  }, []);
  const focusField = input => { focusedField.current = input; if (input) scrollFocusedField(); };
  // Keep the header in the same scroll tree so a keyboard/rotation change does
  // not remount the focused form. Short viewports can scroll the header away.
  const scrollHeader = keyboardVisible || height < 540 || (height < 700 && fontScale >= 1.5);
  const gutter = width < 360 ? 12 : width >= 600 ? 24 : 18;
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <FieldFocusContext.Provider value={{ focusField, viewportHeight }}>
          <ScrollView testID="screen-scroll" ref={scroll} style={styles.flex} contentContainerStyle={styles.scrollContent}
            onScroll={event => { scrollOffset.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={16}
            onLayout={event => { setViewportHeight(event.nativeEvent.layout.height); if (Keyboard.isVisible()) scrollFocusedField(); }}
            stickyHeaderIndices={scrollHeader ? undefined : [0]} keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} scrollsChildToFocus>
            <Header key="header" title={title} subtitle={subtitle} onBack={onBack} role={role} />
            <View testID="screen-content" key="content" style={[styles.content, { paddingHorizontal: gutter }]}>{children}</View>
          </ScrollView>
          {!keyboardVisible ? footer : null}
        </FieldFocusContext.Provider>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SectionTitle({ children, action, onAction }) {
  return <View style={styles.sectionTitleRow}><Text accessibilityRole="header" style={styles.sectionTitle}>{children}</Text>{action ? <Pressable accessibilityRole="button" accessibilityLabel={action} onPress={onAction} style={styles.sectionAction}><Text style={styles.link}>{action}</Text></Pressable> : null}</View>;
}

function SessionCard({ session, state, onDetails, actionLabel, onAction }) {
  const discipline = state.disciplines.find(item => item.id === session.disciplineId);
  const monitor = state.users.find(item => item.id === session.monitorId);
  const count = session.reservedCount ?? state.reservations.filter(item => item.sessionId === session.id && item.status === 'confirmed').length;
  return (
    <Card>
      <View style={styles.rowBetween}><Badge>{discipline?.code}</Badge><Badge tone={session.status === 'approved' ? 'success' : session.status === 'rejected' ? 'error' : 'warning'}>{session.status}</Badge></View>
      <Text style={styles.cardTitle}>{discipline?.name}</Text>
      <Text style={styles.cardBody}>{session.topic}</Text>
      <Text style={styles.meta}>{session.date} · {session.time} · {session.modality}</Text>
      <Text style={styles.meta}>Monitor: {monitor?.name} · {count}/{session.capacity} vagas</Text>
      <View style={styles.buttonRow}><Button compact variant="outline" label="Ver detalhes" onPress={() => onDetails(session)} />{actionLabel ? <Button compact label={actionLabel} onPress={() => onAction(session)} /> : null}</View>
    </Card>
  );
}

function BottomNav({ role, go }) {
  const { width, fontScale } = useWindowDimensions();
  const items = role === 'monitor'
    ? [['monitorDashboard', 'Início'], ['manageSessions', 'Sessões'], ['participants', 'Presença'], ['bot', 'MoniBot'], ['profile', 'Perfil']]
    : role === 'professor'
      ? [['professorDashboard', 'Início'], ['approvals', 'Validar'], ['reports', 'Relatórios'], ['bot', 'MoniBot'], ['profile', 'Perfil']]
      : [['home', 'Início'], ['catalog', 'Buscar'], ['agenda', 'Agenda'], ['bot', 'MoniBot'], ['profile', 'Perfil']];
  const minimumWidth = fontScale > 1.3 ? Math.ceil(Math.max(...items.map(([, label]) => label.length)) * 6.2 * fontScale + 12) : 64;
  const columns = Math.min(items.length, Math.max(2, Math.floor(Math.min(width, 840) / minimumWidth)));
  return <View style={styles.navSurface}><View testID="bottom-navigation" style={styles.nav}>{items.map(([route, label]) => <Pressable key={route} accessibilityRole="button" accessibilityLabel={label} onPress={() => go(route)} style={[styles.navItem, { width: `${100 / columns}%` }]}><Text allowFontScaling={false} style={styles.navDot}>●</Text><Text style={styles.navText}>{label}</Text></Pressable>)}</View></View>;
}

export default function MoniMobApp() {
  const repository = useRef(new FirestoreStateRepository(loadAcademicState)).current;
  const domain = useRef(new MonitoringService(repository)).current;
  const auth = useRef(new FirebaseAuthRepository()).current;
  const [state, setState] = useState(repository.read());
  const [route, setRoute] = useState('welcome');
  const [history, setHistory] = useState([]);
  const [user, setUser] = useState(null);
  const [processing, setProcessing] = useState(false);
  const operationLock = useRef(false);
  const [dataStatus, setDataStatus] = useState('idle');
  const [dataError, setDataError] = useState('');
  const [restoring, setRestoring] = useState(true);
  const loadVersion = useRef(0);
  const [activeRole, setActiveRole] = useState(null);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState(null);
  const [filters, setFilters] = useState({ query: '', semester: '', disciplineId: '', professorId: '', modality: '', date: '', time: '', monitorId: '', availableOnly: false });

  const refresh = () => setState(repository.read());
  const go = next => { setHistory(previous => [...previous, route]); setRoute(next); };
  const back = () => setHistory(previous => { const copy = [...previous]; const previousRoute = copy.pop() || (user ? homeFor(activeRole) : 'welcome'); setRoute(previousRoute); return copy; });
  const notify = message => Alert.alert('MoniMob', message);
  const execute = async (action, input = {}) => {
    if (operationLock.current) return null;
    operationLock.current = true; setProcessing(true);
    const version = loadVersion.current;
    try {
      const token = await auth.getToken();
      const result = await sendCommand(token, activeRole, action, input);
      if (version !== loadVersion.current) return null;
      try { await repository.load(user, activeRole); if (version !== loadVersion.current) return null; refresh(); }
      catch { setDataStatus('error'); setDataError('A operação foi salva, mas não foi possível atualizar a tela. Recarregue os dados.'); }
      return result;
    } catch (error) { notify(userErrorMessage(error)); return null; }
    finally { operationLock.current = false; setProcessing(false); }
  };
  const homeFor = role => role === 'monitor' ? 'monitorDashboard' : role === 'professor' ? 'professorDashboard' : 'home';
  const chooseRole = role => { if (!user?.roles?.includes(role)) return notify('Perfil não autorizado para esta conta.'); setActiveRole(role); setHistory([]); setRoute(homeFor(role)); void loadData(user, role); };
  const signOut = async () => { try { const token = await auth.getToken(); await sendCommand(token, activeRole, 'recordSignOut', {}); } catch {} try { await auth.signOut(); } catch (error) { notify(userErrorMessage(error)); return; } loadVersion.current += 1; repository.clear(); refresh(); setDataStatus('idle'); setUser(null); setActiveRole(null); setHistory([]); setRoute('welcome'); };
  const selectedSession = state.sessions.find(item => item.id === selectedSessionId) || state.sessions[0];
  const editingSession = state.sessions.find(item => item.id === editingSessionId) || null;
  const selectedMaterial = state.materials.find(item => item.id === selectedMaterialId) || null;
  const openSession = session => { setSelectedSessionId(session.id); go('details'); };
  const nav = user ? <BottomNav role={activeRole} go={go} /> : null;
  const screenProps = { onBack: back, role: activeRole, footer: nav };

  const loadData = async (signedUser, role = activeRole) => {
    const version = ++loadVersion.current;
    setDataStatus('loading'); setDataError('');
    try {
      await repository.load(signedUser, role);
      if (version !== loadVersion.current) return;
      refresh(); setDataStatus('ready');
    } catch (error) {
      if (version !== loadVersion.current) return;
      repository.clear(); refresh(); setDataStatus('error');
      setDataError(['DATA_QUOTA_EXCEEDED', 'resource-exhausted', 'SERVER_BUSY'].includes(error.code) ? userErrorMessage(error) : error.code === 'permission-denied'
        ? 'Sua conta não tem acesso a estes dados.'
        : 'Não foi possível carregar os dados. Verifique sua conexão e tente novamente.');
    }
  };
  const acceptUser = signedUser => {
    setUser(signedUser); setHistory([]);
    const role = signedUser.roles[0]; setActiveRole(role);
    setRoute(signedUser.roles.length > 1 ? 'roleAccess' : homeFor(role));
    void loadData(signedUser, role);
    void auth.getToken().then(token => sendCommand(token, role, 'recordSignIn', {})).catch(() => {});
  };
  useEffect(() => {
    let active = true;
    auth.restore().then(signedUser => { if (active && signedUser) acceptUser(signedUser); })
      .catch(error => { if (active) Alert.alert('Sessão', userErrorMessage(error)); })
      .finally(() => { if (active) setRestoring(false); });
    return () => { active = false; loadVersion.current += 1; repository.clear(); };
  }, []);

  if (restoring) return <Screen title="MoniMob"><Text style={styles.cardBody}>Verificando sua sessão…</Text></Screen>;
  if (route === 'welcome') return <WelcomeScreen go={go} />;
  if (route === 'login') return <LoginScreen auth={auth} onBack={back} onForgot={() => go('forgot')} onSuccess={acceptUser} />;
  if (route === 'register') return <RegisterScreen auth={auth} onBack={back} onSuccess={acceptUser} />;
  if (route === 'forgot') return <ForgotScreen auth={auth} onBack={back} />;
  if (route === 'roleAccess') return <RoleAccessScreen user={user} chooseRole={chooseRole} signOut={signOut} />;

  if (user && !['profile', 'bot'].includes(route) && dataStatus !== 'ready') {
    return <Screen {...screenProps} title="Dados acadêmicos"><Card>
      <Text style={styles.cardTitle}>{dataStatus === 'loading' ? 'Carregando dados…' : 'Dados indisponíveis'}</Text>
      <Text style={styles.cardBody}>{dataError || 'Aguarde a consulta ao banco de dados.'}</Text>
      {dataStatus !== 'loading' ? <Button label="Tentar novamente" onPress={() => loadData(user)} /> : null}
    </Card><Button label="Meu perfil" variant="outline" onPress={() => go('profile')} /><Button label="Sair" variant="outline" onPress={signOut} /></Screen>;
  }
  if (['details', 'confirm'].includes(route) && !selectedSession) return <Screen {...screenProps} title="Monitoria"><Text style={styles.cardBody}>Nenhuma monitoria selecionada.</Text></Screen>;

  if (!user) return <WelcomeScreen go={go} />;

  const views = {
    home: <StudentHome {...screenProps} state={state} user={user} recommendations={domain.recommendations(user.id)} go={go} openSession={openSession} />,
    catalog: <Catalog {...screenProps} state={state} sessions={domain.listSessions({ ...filters, approvedOnly: true })} filters={filters} setFilters={setFilters} go={go} openSession={openSession} />,
    filters: <Filters {...screenProps} state={state} filters={filters} setFilters={setFilters} apply={() => go('catalog')} />,
    details: <Details {...screenProps} state={state} session={selectedSession} user={user} domain={domain} execute={execute} go={go} />,
    confirm: <Confirm {...screenProps} state={state} session={selectedSession} reserve={async () => { const saved = await execute('reserve', { sessionId: selectedSession.id, studentId: user.id }); if (saved) { notify('Reserva confirmada.'); go('agenda'); } }} />,
    agenda: <Agenda {...screenProps} state={state} user={user} openSession={openSession} cancel={reservation => Alert.alert('Cancelar reserva', 'Confirma o cancelamento? A vaga poderá ser repassada à lista de espera.', [{ text: 'Manter', style: 'cancel' }, { text: 'Cancelar reserva', style: 'destructive', onPress: () => execute('cancelReservation', { reservationId: reservation.id, studentId: user.id }) }])} />,
    notifications: <Notifications {...screenProps} state={state} user={user} refresh={refresh} repository={repository} execute={execute} />,
    materials: <Materials {...screenProps} state={state} />,
    attendance: <Attendance {...screenProps} state={state} user={user} execute={execute} domain={domain} />,
    bot: <MoniBot {...screenProps} getToken={() => auth.getToken()} activeRole={activeRole} selectedSession={selectedSession} />,
    profile: <Profile {...screenProps} auth={auth} user={user} setUser={setUser} activeRole={activeRole} chooseRole={chooseRole} signOut={signOut} />,
    monitorDashboard: <MonitorDashboard {...screenProps} state={state} user={user} go={go} create={() => { setEditingSessionId(null); go('createSession'); }} />,
    manageSessions: <ManageSessions {...screenProps} state={state} user={user} go={go} openSession={openSession} create={() => { setEditingSessionId(null); go('createSession'); }} edit={session => { setEditingSessionId(session.id); go('createSession'); }} archive={session => Alert.alert('Cancelar monitoria', 'Esta ação avisará os participantes e arquivará a sessão. Continuar?', [{ text: 'Voltar', style: 'cancel' }, { text: 'Confirmar', style: 'destructive', onPress: () => execute('archiveSession', { actorId: user.id, sessionId: session.id }) }])} />,
    createSession: <CreateSession {...screenProps} state={state} user={user} editingSession={editingSession} save={async session => { const saved = await execute('saveSession', { actorId: user.id, session }); if (saved) { setEditingSessionId(null); notify('Sessão enviada para aprovação.'); go('manageSessions'); } }} />,
    participants: <Participants {...screenProps} state={state} user={user} domain={domain} execute={execute} refresh={refresh} />,
    manageMaterials: <ManageMaterials {...screenProps} state={state} user={user} go={go} create={() => { setSelectedMaterialId(null); go('createMaterial'); }} select={id => setSelectedMaterialId(id)} archive={material => Alert.alert('Arquivar material', `Confirma o arquivamento de “${material.title}”?`, [{ text: 'Voltar', style: 'cancel' }, { text: 'Arquivar', style: 'destructive', onPress: () => execute('archiveMaterial', { actorId: user.id, materialId: material.id }) }])} />,
    createMaterial: <CreateMaterial {...screenProps} state={state} user={user} selectedMaterial={selectedMaterial} save={async material => { const saved = await execute('saveMaterial', { actorId: user.id, material }); if (saved) { notify('Material enviado para aprovação.'); go('manageMaterials'); } }} />,
    professorDashboard: <ProfessorDashboard {...screenProps} state={state} user={user} report={domain.reportForProfessor(user.id)} go={go} />,
    approvals: <Approvals {...screenProps} state={state} user={user} decide={(type, id, decision, comment) => execute('decideApproval', { professorId: user.id, entityType: type, entityId: id, decision, comment })} />,
    reports: <Reports {...screenProps} state={state} user={user} domain={domain} />
  };
  return <OperationContext.Provider value={processing}><View style={styles.flex}>{views[route] || views[homeFor(activeRole)]}</View></OperationContext.Provider>;
}

function WelcomeScreen({ go }) {
  return (
    <SafeAreaView style={styles.welcome}>
      <StatusBar barStyle="light-content" />
      <ScrollView style={styles.flex} contentContainerStyle={styles.welcomeScroll}><View style={styles.welcomeInner}><Logo light /><Text style={styles.welcomeText}>Encontre monitorias, organize sessões e acompanhe a aprendizagem das disciplinas atuais de Ciência da Computação.</Text><Button label="Entrar" onPress={() => go('login')} /><Button label="Criar conta de aluno" variant="light" onPress={() => go('register')} /></View></ScrollView>
    </SafeAreaView>
  );
}

function LoginScreen({ auth, onBack, onForgot, onSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const signedUser = await auth.signIn(email, password);
      onSuccess(signedUser);
    } catch (error) { Alert.alert('Acesso não autorizado', userErrorMessage(error)); } finally { setBusy(false); }
  };
  return <Screen title="Entrar" subtitle="Acesse sua conta" onBack={onBack}><Logo /><Field label="E-mail institucional" value={email} onChangeText={setEmail} keyboardType="email-address" /><Field label="Senha" value={password} onChangeText={setPassword} secureTextEntry /><Button label={busy ? 'Entrando…' : 'Entrar'} disabled={busy} onPress={submit} /><Button label="Esqueci minha senha" variant="ghost" onPress={onForgot} /></Screen>;
}

function RegisterScreen({ auth, onBack, onSuccess }) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', registration: '', email: '', password: '' });
  const set = key => value => setForm(previous => ({ ...previous, [key]: value }));
  const submit = async () => { if (busy) return; setBusy(true); try { if (!form.name || !form.registration || !form.email || form.password.length < 8) throw new Error('Preencha os campos e use senha com pelo menos 8 caracteres.'); onSuccess(await auth.registerStudent(form)); } catch (error) { Alert.alert('Cadastro', userErrorMessage(error)); } finally { setBusy(false); } };
  return <Screen title="Criar conta" subtitle="Cadastro de aluno" onBack={onBack}><Card accent><Text style={styles.cardBody}>Monitores e professores não se autocadastram. Esses papéis devem ser concedidos pela instituição.</Text></Card><Field label="Nome completo" value={form.name} onChangeText={set('name')} /><Field label="Matrícula" value={form.registration} onChangeText={set('registration')} keyboardType="number-pad" /><Field label="E-mail institucional" value={form.email} onChangeText={set('email')} keyboardType="email-address" /><Field label="Senha" value={form.password} onChangeText={set('password')} secureTextEntry /><Button label="Cadastrar como aluno" disabled={busy} onPress={submit} /></Screen>;
}

function ForgotScreen({ auth, onBack }) {
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const submit = async () => { if (busy) return; setBusy(true); try { const result = await auth.requestPasswordReset(email); Alert.alert('Recuperação de senha', result.message); } catch (error) { Alert.alert('Recuperação de senha', userErrorMessage(error)); } finally { setBusy(false); } };
  return <Screen title="Recuperar senha" subtitle="Redefina sua senha por e-mail" onBack={onBack}><Card accent><Text style={styles.cardBody}>Informe o e-mail da sua conta para receber as instruções de recuperação.</Text></Card><Field label="E-mail institucional" value={email} onChangeText={setEmail} /><Button label="Solicitar recuperação" disabled={busy} onPress={submit} /></Screen>;
}

function RoleAccessScreen({ user, chooseRole, signOut }) {
  return <Screen title="Escolher área" subtitle="Somente papéis vinculados à conta"><Text style={styles.lead}>Olá, {user.name}. Selecione o ambiente que deseja usar.</Text>{user.roles.map(role => <Card key={role}><Text style={styles.cardTitle}>{ROLE_LABELS[role]}</Text><Text style={styles.cardBody}>{role === 'student' ? 'Buscar, reservar, acessar materiais e registrar presença.' : 'Gerenciar sessões, participantes, presença e materiais.'}</Text><Button label={`Acessar como ${ROLE_LABELS[role]}`} onPress={() => chooseRole(role)} /></Card>)}<Button label="Sair" variant="outline" onPress={signOut} /></Screen>;
}

function StudentHome({ state, user, recommendations, go, openSession, ...props }) {
  const next = state.sessions.filter(item => item.status === 'approved' && !item.archived).slice(0, 2);
  return <Screen {...props} title="Início" subtitle={`Olá, ${user.name.split(' ')[0]}`}><Pressable accessibilityRole="button" accessibilityLabel="Buscar monitorias" style={styles.search} onPress={() => go('catalog')}><Text style={styles.searchText}>⌕ Qual disciplina você quer revisar?</Text></Pressable><View style={styles.quickGrid}><Button compact label="Agenda" onPress={() => go('agenda')} /><Button compact variant="outline" label="Materiais" onPress={() => go('materials')} /><Button compact variant="outline" label="Presença" onPress={() => go('attendance')} /><Button compact variant="outline" label="Avisos" onPress={() => go('notifications')} /></View><SectionTitle action="Ver todas" onAction={() => go('catalog')}>Próximas monitorias</SectionTitle>{!next.length ? <Card><Text style={styles.cardBody}>Nenhuma monitoria publicada no momento.</Text></Card> : null}{next.map(session => <SessionCard key={session.id} session={session} state={state} onDetails={openSession} />)}<SectionTitle>Recomendadas para você</SectionTitle>{recommendations.map(session => <SessionCard key={`rec-${session.id}`} session={session} state={state} onDetails={openSession} />)}</Screen>;
}

function Catalog({ state, sessions, filters, setFilters, go, openSession, ...props }) {
  return <Screen {...props} title="Buscar monitorias" subtitle={`${sessions.length} resultado(s)`}><Field label="Pesquisa" value={filters.query} onChangeText={query => setFilters(previous => ({ ...previous, query }))} placeholder="Disciplina, assunto, professor ou monitor" /><Button variant="outline" label="Abrir filtros avançados" onPress={() => go('filters')} />{sessions.length ? sessions.map(session => <SessionCard key={session.id} session={session} state={state} onDetails={openSession} />) : <Card><Text style={styles.cardTitle}>Nenhuma monitoria encontrada</Text><Text style={styles.cardBody}>Limpe ou ajuste os filtros para ampliar a busca.</Text></Card>}</Screen>;
}

function Choice({ selected, label, onPress }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={label} onPress={onPress} style={[styles.choice, selected && styles.choiceSelected]}><Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text></Pressable>;
}

function Filters({ state, filters, setFilters, apply, ...props }) {
  const set = (key, value) => setFilters(previous => ({ ...previous, [key]: previous[key] === value ? '' : value }));
  const professors = state.users.filter(item => item.roles.includes('professor'));
  const monitors = state.users.filter(item => item.roles.includes('monitor'));
  return <Screen {...props} title="Filtros" subtitle="Refine a busca"><SectionTitle>Semestre</SectionTitle><View style={styles.choiceRow}>{[1,2,3,4,5,6,7,8].map(item => <Choice key={item} label={`${item}º`} selected={filters.semester === item} onPress={() => set('semester', item)} />)}</View><SectionTitle>Disciplina</SectionTitle><View style={styles.choiceColumn}>{state.disciplines.map(item => <Choice key={item.id} label={`${item.code} · ${item.name}`} selected={filters.disciplineId === item.id} onPress={() => set('disciplineId', item.id)} />)}</View><SectionTitle>Professor</SectionTitle>{professors.map(item => <Choice key={item.id} label={item.name} selected={filters.professorId === item.id} onPress={() => set('professorId', item.id)} />)}<SectionTitle>Monitor</SectionTitle>{monitors.map(item => <Choice key={item.id} label={item.name} selected={filters.monitorId === item.id} onPress={() => set('monitorId', item.id)} />)}<SectionTitle>Modalidade</SectionTitle><View style={styles.choiceRow}>{['Presencial','Online'].map(item => <Choice key={item} label={item} selected={filters.modality === item} onPress={() => set('modality', item)} />)}</View><Field label="Data (AAAA-MM-DD)" value={filters.date} onChangeText={value => setFilters(previous => ({ ...previous, date: value }))} /><Field label="Horário (HH:MM)" value={filters.time} onChangeText={value => setFilters(previous => ({ ...previous, time: value }))} /><Choice label="Somente com vagas" selected={filters.availableOnly} onPress={() => setFilters(previous => ({ ...previous, availableOnly: !previous.availableOnly }))} /><View style={styles.buttonRow}><Button variant="outline" label="Limpar" onPress={() => setFilters({ query: '', semester: '', disciplineId: '', professorId: '', modality: '', date: '', time: '', monitorId: '', availableOnly: false })} /><Button label="Aplicar" onPress={apply} /></View></Screen>;
}

function Details({ state, session, user, domain, execute, go, ...props }) {
  const discipline = state.disciplines.find(item => item.id === session.disciplineId);
  const monitor = state.users.find(item => item.id === session.monitorId);
  const professor = state.users.find(item => item.id === session.professorId);
  const spots = domain.availableSpots(session.id);
  const favorite = state.favorites.some(item => item.studentId === user?.id && item.sessionId === session.id);
  const waiting = state.waitlist.some(item => item.studentId === user?.id && item.sessionId === session.id && item.status === 'waiting');
  const openLink = () => { try { const url = domain.validateMonitoringLink(session.id); Linking.openURL(url).catch(() => Alert.alert('Link', 'Não foi possível abrir este endereço.')); } catch (error) { Alert.alert('Link', userErrorMessage(error)); } };
  return <Screen {...props} title="Detalhes da monitoria" subtitle={discipline?.code}><Card accent><Text style={styles.heroTitle}>{discipline?.name}</Text><Text style={styles.cardBody}>{session.topic}</Text></Card><Info label="Data, horário e duração" value={`${session.date} às ${session.time} · ${session.durationMinutes} min`} /><Info label="Modalidade e local" value={`${session.modality} · ${session.location}`} /><Info label="Vagas disponíveis" value={`${spots} de ${session.capacity}`} /><Info label="Monitor" value={monitor?.name} /><Info label="Professor responsável" value={professor?.name} /><Info label="Conteúdos" value={session.description || 'Conteúdo não informado.'} />{session.monitoringUrl ? <Button variant="outline" label="Abrir link válido da monitoria" onPress={openLink} /> : null}{props.role === 'student' && session.status === 'approved' && !session.archived ? <><Button variant="outline" label={favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'} onPress={() => execute('toggleFavorite', { studentId: user.id, sessionId: session.id })} />{spots > 0 ? <Button label="Reservar vaga" onPress={() => go('confirm')} /> : <Button label={waiting ? 'Na lista de espera' : 'Entrar na lista de espera'} disabled={waiting} onPress={() => execute('joinWaitlist', { sessionId: session.id, studentId: user.id })} />}</> : null}</Screen>;
}

function Info({ label, value }) { return <Card><Text style={styles.label}>{label}</Text><Text style={styles.cardBody}>{value}</Text></Card>; }

function Confirm({ state, session, reserve, ...props }) {
  const start = value => new Date(value.date + 'T' + value.time + ':00-03:00').getTime();
  const conflict = state.reservations.some(r => r.status === 'confirmed' && r.sessionId !== session.id && state.sessions.some(other => other.id === r.sessionId && start(other) < start(session) + session.durationMinutes * 60000 && start(session) < start(other) + other.durationMinutes * 60000));
  const discipline = state.disciplines.find(item => item.id === session.disciplineId);
  return <Screen {...props} title="Confirmar reserva" subtitle="Revise os dados"><Card accent><Text style={styles.cardTitle}>{discipline?.name}</Text><Text style={styles.cardBody}>{session.topic}</Text><Text style={styles.meta}>{session.date} · {session.time} · {session.location}</Text></Card><Card><Text style={styles.cardBody}>Ao confirmar, a vaga será vinculada a esta sessão e à sua matrícula. Reservas simultâneas e duplicadas são bloqueadas.</Text></Card>{conflict ? <Card><Text style={styles.cardBody}>Existe conflito com outra reserva da sua agenda.</Text></Card> : null}<Button label="Confirmar reserva" disabled={conflict} onPress={reserve} /></Screen>;
}

function Agenda({ state, user, openSession, cancel, ...props }) {
  const reservations = state.reservations.filter(item => item.studentId === user.id);
  return <Screen {...props} title="Minha agenda" subtitle={`${reservations.length} reserva(s)`}>{reservations.length ? reservations.map(reservation => { const session = state.sessions.find(item => item.id === reservation.sessionId); const attendance = state.attendance.find(item => item.sessionId === session.id && item.studentId === user.id); return <View key={reservation.id}><SessionCard session={session} state={state} onDetails={openSession} actionLabel={reservation.status === 'confirmed' ? 'Cancelar' : undefined} onAction={() => cancel(reservation)} /><Badge>{reservation.status === 'confirmed' ? 'Reserva confirmada' : 'Reserva cancelada'}</Badge><Badge tone={attendance?.status === 'present' ? 'success' : attendance?.status === 'absent' ? 'error' : 'warning'}>{attendance?.status === 'present' ? 'Presença confirmada' : attendance?.status === 'absent' ? 'Ausência registrada' : 'Presença pendente'}</Badge></View>; }) : <Card><Text style={styles.cardTitle}>Agenda vazia</Text><Text style={styles.cardBody}>Busque uma monitoria e confirme sua primeira reserva.</Text></Card>}</Screen>;
}

function Notifications({ state, user, refresh, repository, execute, ...props }) {
  const items = state.notifications.filter(item => item.userId === user.id);
  const markAll = () => execute('markNotificationsRead');
  return <Screen {...props} title="Notificações" subtitle="Atualizações do MoniMob"><Button variant="outline" label="Marcar todas como lidas" onPress={markAll} />{items.map(item => <Card key={item.id}><View style={styles.rowBetween}><Text style={styles.cardTitle}>{item.title}</Text>{!item.read ? <Badge>Novo</Badge> : null}</View><Text style={styles.cardBody}>{item.body}</Text></Card>)}</Screen>;
}

function Materials({ state, ...props }) {
  const items = state.materials.filter(item => item.status === 'approved' && !item.archived);
  return <Screen {...props} title="Materiais" subtitle="Conteúdos aprovados">{items.length ? items.map(item => { const discipline = state.disciplines.find(d => d.id === item.disciplineId); return <Card key={item.id}><Badge>{discipline?.code}</Badge><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.cardBody}>{discipline?.name} · {item.type}</Text><Button variant="outline" compact label="Abrir material" onPress={() => Linking.openURL(item.url).catch(() => Alert.alert('Material', 'Não foi possível abrir este endereço.'))} /></Card>; }) : <Card><Text style={styles.cardBody}>Nenhum material aprovado disponível.</Text></Card>}</Screen>;
}

function Attendance({ state, user, execute, domain, ...props }) {
  const reservations = state.reservations.filter(item => item.studentId === user.id && item.status === 'confirmed');
  const [sessionId, setSessionId] = useState(reservations[0]?.sessionId || '');
  const [code, setCode] = useState('');
  const confirmationOpen = useRef(false);
  const existingAttendance = state.attendance.find(item => item.sessionId === sessionId && item.studentId === user.id);
  const register = () => {
    if (existingAttendance) { Alert.alert('Presença já registrada', 'Esta monitoria já possui seu registro de presença.'); return; }
    if (!sessionId || !/^\d{6}$/.test(code.trim())) { Alert.alert('Código de presença', 'Informe o código de seis dígitos.'); return; }
    if (confirmationOpen.current) return;
    confirmationOpen.current = true;
    const release = () => { confirmationOpen.current = false; };
    Alert.alert('Registrar presença', 'Confirma sua presença nesta monitoria?', [
      { text: 'Voltar', style: 'cancel', onPress: release },
      { text: 'Confirmar', onPress: async () => {
        try {
          const result = await execute('registerAttendance', { sessionId, code: code.trim() });
          if (result) { setCode(''); Alert.alert('Presença confirmada', 'Sua presença foi registrada.'); }
        } finally { release(); }
      } }
    ], { cancelable: true, onDismiss: release });
  };
  return <Screen {...props} title="Registrar presença" subtitle="Um registro por monitoria"><SectionTitle>Reserva</SectionTitle>{reservations.map(item => { const session = state.sessions.find(s => s.id === item.sessionId); const discipline = state.disciplines.find(d => d.id === session.disciplineId); return <Choice key={item.id} label={`${discipline?.name} · ${session.date} ${session.time}`} selected={sessionId === session.id} onPress={() => { setSessionId(session.id); setCode(''); }} />; })}{!reservations.length ? <Card><Text style={styles.cardBody}>Você precisa de uma reserva confirmada antes de registrar presença.</Text></Card> : null}{existingAttendance ? <Card accent><Badge tone={existingAttendance.status === 'present' ? 'success' : 'warning'}>Presença já registrada</Badge><Text style={styles.cardBody}>{existingAttendance.status === 'present' ? 'Sua presença nesta monitoria já está confirmada.' : 'O monitor já registrou sua situação de presença. Consulte a agenda.'}</Text></Card> : <Field label="Código de 6 dígitos" value={code} onChangeText={setCode} keyboardType="number-pad" />}<Button label={existingAttendance ? 'Presença já registrada' : 'Confirmar presença'} disabled={!sessionId || Boolean(existingAttendance)} onPress={register} /></Screen>;
}

function AssistantMessage({ text }) {
  const parts = String(text).replace(/^\s*\*\s+/gm, '• ').split(/(\*\*[^*]+\*\*)/g);
  return <Text accessibilityLiveRegion="polite" style={styles.cardBody}>{parts.map((part, index) => part.startsWith('**') && part.endsWith('**')
    ? <Text key={index} style={{ fontWeight: '700' }}>{part.slice(2, -2)}</Text>
    : part)}</Text>;
}

function MoniBot({ getToken, activeRole, selectedSession, ...props }) {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [failedQuestion, setFailedQuestion] = useState(null);
  const sending = useRef(false);
  const send = async (retry = false) => {
    const text = (retry ? failedQuestion || '' : message).trim();
    if (!text || sending.current) return;
    sending.current = true; setBusy(true); setFailedQuestion(null);
    setMessage(current => current.trim() === text ? '' : current);
    setMessages(previous => retry ? previous.filter(item => item.from !== 'error')
      : [...previous, { id: `u-${Date.now()}`, from: 'user', text }]);
    try {
      const token = await getToken();
      const answer = await askMoniBot({ token, role: activeRole, message: text, context: { screen: 'bot', sessionId: selectedSession?.id } });
      setMessages(previous => [...previous, { id: `b-${Date.now()}`, from: 'bot', text: answer }]);
    } catch (error) {
      setFailedQuestion(text); setMessage(current => current || text);
      setMessages(previous => [...previous, { id: `e-${Date.now()}`, from: 'error', text: userErrorMessage(error) }]);
    } finally { sending.current = false; setBusy(false); }
  };
  return <Screen {...props} title="MoniBot" subtitle="Ajuda sobre suas monitorias">{messages.map(item => <View key={item.id} style={[styles.chat, item.from === 'user' ? styles.chatUser : styles.chatBot]}>{item.from === 'user' ? <Text style={styles.chatUserText}>{item.text}</Text> : item.from === 'error' ? <><Badge tone="error">Resposta não recebida</Badge><Text style={styles.cardBody}>{item.text}</Text></> : <AssistantMessage text={item.text} />}</View>)}<Field label="Mensagem" value={message} onChangeText={setMessage} placeholder="Como posso encontrar uma monitoria?" multiline /><Button label={busy ? 'Consultando…' : 'Enviar'} disabled={busy} onPress={() => send()} />{failedQuestion ? <Button label="Tentar novamente" variant="outline" disabled={busy} onPress={() => send(true)} /> : null}<Text style={styles.caption}>O MoniBot não acessa senhas, tokens, notas ou dados pessoais de terceiros.</Text></Screen>;
}

function Profile({ auth, user, setUser, activeRole, chooseRole, signOut, ...props }) {
  const [name, setName] = useState(user.name);
  const save = async () => { try { const updated = await auth.updateProfile(user.id, { name }); setUser(updated); Alert.alert('Perfil', 'Nome salvo no seu perfil.'); } catch (error) { Alert.alert('Perfil', userErrorMessage(error)); } };
  return <Screen {...props} title="Perfil" subtitle="Dados da sua conta"><Card accent><Text style={styles.heroTitle}>{user.name}</Text><Text style={styles.cardBody}>{user.registration} · {user.email}</Text><Text style={styles.meta}>Área ativa: {ROLE_LABELS[activeRole]}</Text></Card><Field label="Nome de exibição" value={name} onChangeText={setName} /><Button label="Salvar perfil" onPress={save} />{user.roles.length > 1 ? <><SectionTitle>Alternar área</SectionTitle>{user.roles.map(role => <Choice key={role} label={ROLE_LABELS[role]} selected={role === activeRole} onPress={() => chooseRole(role)} />)}</> : null}<Card><Text style={styles.cardTitle}>Como o perfil é definido?</Text><Text style={styles.cardBody}>O papel pertence à conta acadêmica e nunca é escolhido no cadastro. As permissões são administradas pela instituição.</Text></Card><Button label="Sair" variant="outline" onPress={signOut} /></Screen>;
}

function MonitorDashboard({ state, user, go, create, ...props }) {
  const sessions = state.sessions.filter(item => item.monitorId === user.id && !item.archived);
  const participants = state.reservations.filter(item => sessions.some(session => session.id === item.sessionId) && item.status === 'confirmed').length;
  return <Screen {...props} title="Painel do monitor" subtitle={`Olá, ${user.name.split(' ')[0]}`}><View style={styles.kpiRow}><Kpi label="Sessões" value={sessions.length} /><Kpi label="Participantes" value={participants} /><Kpi label="Pendentes" value={sessions.filter(item => item.status === 'pending').length} /></View><Button label="Nova monitoria" onPress={create} /><Button variant="outline" label="Gerenciar monitorias" onPress={() => go('manageSessions')} /><Button variant="outline" label="Participantes e presença" onPress={() => go('participants')} /><Button variant="outline" label="Gerenciar materiais" onPress={() => go('manageMaterials')} /></Screen>;
}

function Kpi({ label, value }) { return <View style={styles.kpi}><Text style={styles.kpiValue}>{value}</Text><Text style={styles.kpiLabel}>{label}</Text></View>; }

function ManageSessions({ state, user, openSession, create, edit, archive, ...props }) {
  const sessions = state.sessions.filter(item => item.monitorId === user.id && !item.archived);
  return <Screen {...props} title="Gerenciar monitorias" subtitle="CRUD por sessão"><Button label="Cadastrar monitoria" onPress={create} />{sessions.map(session => { const discipline = state.disciplines.find(item => item.id === session.disciplineId); return <Card key={session.id}><View style={styles.rowBetween}><Badge>{discipline?.code}</Badge><Badge tone={session.status === 'approved' ? 'success' : session.status === 'rejected' ? 'error' : 'warning'}>{session.status}</Badge></View><Text style={styles.cardTitle}>{discipline?.name}</Text><Text style={styles.cardBody}>{session.topic}</Text><Text style={styles.meta}>{session.date} · {session.time}</Text><View style={styles.actionWrap}><Button compact variant="outline" label="Detalhes" onPress={() => openSession(session)} /><Button compact variant="outline" label="Editar" onPress={() => edit(session)} /><Button compact variant="danger" label="Arquivar" onPress={() => archive(session)} /></View></Card>; })}</Screen>;
}

function CreateSession({ state, user, editingSession, save, ...props }) {
  const links = state.monitorDisciplines.filter(item => item.monitorId === user.id && item.active);
  const [form, setForm] = useState({ id: editingSession?.id, disciplineId: editingSession?.disciplineId || links[0]?.disciplineId || '', topic: editingSession?.topic || '', description: editingSession?.description || '', date: editingSession?.date || '', time: editingSession?.time || '', durationMinutes: String(editingSession?.durationMinutes || 60), modality: editingSession?.modality || 'Presencial', location: editingSession?.location || '', capacity: String(editingSession?.capacity || 10), monitoringUrl: editingSession?.monitoringUrl || '', linkValidUntil: editingSession?.linkValidUntil || '' });
  const set = key => value => setForm(previous => ({ ...previous, [key]: value }));
  return <Screen {...props} title={editingSession ? 'Editar monitoria' : 'Cadastrar monitoria'} subtitle="Será enviada para aprovação"><SectionTitle>Disciplina vinculada</SectionTitle>{links.map(link => { const d = state.disciplines.find(item => item.id === link.disciplineId); return <Choice key={link.disciplineId} label={`${d?.code} · ${d?.name}`} selected={form.disciplineId === link.disciplineId} onPress={() => set('disciplineId')(link.disciplineId)} />; })}<Field label="Conteúdo" value={form.description} onChangeText={set('description')} multiline /><Field label="Assunto" value={form.topic} onChangeText={set('topic')} /><Field label="Data (AAAA-MM-DD)" value={form.date} onChangeText={set('date')} /><Field label="Horário (HH:MM)" value={form.time} onChangeText={set('time')} /><Field label="Duração em minutos" value={form.durationMinutes} onChangeText={set('durationMinutes')} keyboardType="number-pad" /><View style={styles.choiceRow}>{['Presencial','Online'].map(item => <Choice key={item} label={item} selected={form.modality === item} onPress={() => set('modality')(item)} />)}</View><Field label="Local" value={form.location} onChangeText={set('location')} /><Field label="Link da monitoria (opcional)" value={form.monitoringUrl} onChangeText={set('monitoringUrl')} /><Field label="Validade do link (AAAA-MM-DDTHH:MM:SS)" value={form.linkValidUntil} onChangeText={set('linkValidUntil')} /><Field label="Vagas" value={form.capacity} onChangeText={set('capacity')} keyboardType="number-pad" /><Button label="Enviar para validação" onPress={() => save(form)} /></Screen>;
}

function Participants({ state, user, domain, execute, ...props }) {
  const sessions = state.sessions.filter(item => item.monitorId === user.id && !item.archived);
  const [sessionId, setSessionId] = useState(sessions[0]?.id || '');
  const [latest, setLatest] = useState(null);
  const reservations = state.reservations.filter(item => item.sessionId === sessionId && item.status === 'confirmed');
  const confirmAttendance = (studentId, status) => Alert.alert('Alterar presença', 'Confirma a alteração deste participante?', [{ text: 'Voltar', style: 'cancel' }, { text: 'Confirmar', onPress: () => execute('setAttendance', { sessionId, studentId, status }) }]);
  const generate = async () => { const code = await execute('generateAttendanceCode', { actorId: user.id, sessionId }); if (code) setLatest(code); };
  return <Screen {...props} title="Participantes e presença" subtitle="Dados isolados por sessão"><SectionTitle>Sessão</SectionTitle>{sessions.map(item => { const d = state.disciplines.find(x => x.id === item.disciplineId); return <Choice key={item.id} label={`${d?.name} · ${item.date} ${item.time}`} selected={sessionId === item.id} onPress={() => { setSessionId(item.id); setLatest(null); }} />; })}<View style={styles.kpiRow}><Kpi label="Reservas" value={reservations.length} /><Kpi label="Presentes" value={state.attendance.filter(item => item.sessionId === sessionId && item.status === 'present').length} /></View><Button label="Gerar novo código" disabled={!sessionId} onPress={generate} />{latest ? <Card accent><Text style={styles.label}>Código temporário de presença</Text><Text style={styles.code} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.4}>{latest.code}</Text><Text style={styles.caption}>Expira em {new Date(latest.expiresAt).toLocaleTimeString('pt-BR')}</Text></Card> : null}<SectionTitle>Lista de participantes</SectionTitle>{reservations.length ? reservations.map(item => { const student = state.users.find(x => x.id === item.studentId); const attendance = state.attendance.find(x => x.sessionId === sessionId && x.studentId === item.studentId); return <Card key={item.id}><View style={styles.rowBetween}><Text style={styles.cardTitle}>{student?.name}</Text><Badge tone={attendance?.status === 'present' ? 'success' : attendance?.status === 'absent' ? 'error' : 'warning'}>{attendance?.status === 'present' ? 'Presente' : attendance?.status === 'absent' ? 'Ausente' : 'Pendente'}</Badge></View><View style={styles.buttonRow}><Button compact label="Presente" onPress={() => confirmAttendance(item.studentId, 'present')} /><Button compact variant="danger" label="Ausente" onPress={() => confirmAttendance(item.studentId, 'absent')} /></View></Card>; }) : <Card><Text style={styles.cardBody}>Nenhum participante reservado nesta sessão.</Text></Card>}</Screen>;
}

function ManageMaterials({ state, user, go, create, select, archive, ...props }) {
  const items = state.materials.filter(item => item.monitorId === user.id && !item.archived);
  return <Screen {...props} title="Gerenciar materiais" subtitle="CRUD por disciplina"><Button label="Cadastrar material" onPress={create} />{items.map(item => { const d = state.disciplines.find(x => x.id === item.disciplineId); return <Card key={item.id}><View style={styles.rowBetween}><Badge>{d?.code}</Badge><Badge tone={item.status === 'approved' ? 'success' : item.status === 'rejected' ? 'error' : 'warning'}>{item.status}</Badge></View><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.cardBody}>{d?.name} · {item.type}</Text><View style={styles.buttonRow}><Button compact variant="outline" label="Editar" onPress={() => { select(item.id); go('createMaterial'); }} /><Button compact variant="danger" label="Arquivar" onPress={() => archive(item)} /></View></Card>; })}</Screen>;
}

function CreateMaterial({ state, user, selectedMaterial, save, ...props }) {
  const links = state.monitorDisciplines.filter(item => item.monitorId === user.id && item.active);
  const editing = selectedMaterial?.monitorId === user.id ? selectedMaterial : null;
  const [form, setForm] = useState({ id: editing?.id, disciplineId: editing?.disciplineId || links[0]?.disciplineId || '', title: editing?.title || '', type: editing?.type || 'Link', url: editing?.url || '' });
  const set = key => value => setForm(previous => ({ ...previous, [key]: value }));
  return <Screen {...props} title={editing ? 'Editar material' : 'Cadastrar material'} subtitle="Validação acadêmica obrigatória"><SectionTitle>Disciplina</SectionTitle>{links.map(link => { const d = state.disciplines.find(item => item.id === link.disciplineId); return <Choice key={link.disciplineId} label={`${d?.code} · ${d?.name}`} selected={form.disciplineId === link.disciplineId} onPress={() => set('disciplineId')(link.disciplineId)} />; })}<Field label="Título" value={form.title} onChangeText={set('title')} /><Field label="Tipo" value={form.type} onChangeText={set('type')} /><Field label="URL do material" value={form.url} onChangeText={set('url')} /><Button label="Enviar para validação" onPress={() => save(form)} /></Screen>;
}

function ProfessorDashboard({ state, user, report, go, ...props }) {
  const links = state.professorDisciplines.filter(item => item.professorId === user.id);
  return <Screen {...props} title="Painel do professor" subtitle="Supervisão acadêmica"><View style={styles.kpiRow}><Kpi label="Disciplinas" value={report.disciplines} /><Kpi label="Sessões" value={report.sessions} /><Kpi label="Pendências" value={report.pending} /></View><Button label="Validar pendências" onPress={() => go('approvals')} /><Button variant="outline" label="Abrir relatórios" onPress={() => go('reports')} /><SectionTitle>Disciplinas e monitores</SectionTitle>{links.length ? links.map(link => { const discipline = state.disciplines.find(item => item.id === link.disciplineId); const monitors = state.monitorDisciplines.filter(item => item.disciplineId === link.disciplineId); return <Card key={link.id}><Text style={styles.cardTitle}>{discipline?.code} · {discipline?.name}</Text>{monitors.length ? monitors.map(item => <Text key={item.id} style={styles.cardBody}>{state.users.find(profile => profile.id === item.monitorId)?.name} · vínculo até {item.validUntil?.slice(0, 10)}</Text>) : <Text style={styles.cardBody}>Nenhum monitor com vínculo vigente.</Text>}</Card>; }) : <Card><Text style={styles.cardBody}>Nenhuma disciplina vinculada à sua conta.</Text></Card>}</Screen>;
}

function Approvals({ state, user, decide, ...props }) {
  const [comment, setComment] = useState('');
  const items = [
    ...state.sessions.filter(item => item.professorId === user.id && item.status === 'pending' && !item.archived).map(item => ({ ...item, entityType: 'session', label: item.topic })),
    ...state.materials.filter(item => item.professorId === user.id && item.status === 'pending' && !item.archived).map(item => ({ ...item, entityType: 'material', label: item.title }))
  ];
  return <Screen {...props} title="Validações acadêmicas" subtitle="Somente disciplinas vinculadas"><Field label="Observação para a decisão" value={comment} onChangeText={setComment} placeholder="Obrigatória ao solicitar ajustes" multiline />{items.length ? items.map(item => { const d = state.disciplines.find(x => x.id === item.disciplineId); const confirm = (decision, label) => Alert.alert(label, `Confirma a decisão para “${item.label}”?`, [{ text: 'Voltar', style: 'cancel' }, { text: 'Confirmar', onPress: async () => { if (await decide(item.entityType, item.id, decision, comment)) setComment(''); } }]); return <Card key={`${item.entityType}-${item.id}`}><View style={styles.rowBetween}><Badge>{item.entityType === 'session' ? 'Sessão' : 'Material'}</Badge><Badge tone="warning">Pendente</Badge></View><Text style={styles.cardTitle}>{item.label}</Text><Text style={styles.cardBody}>{d?.name}</Text><View style={styles.actionWrap}><Button compact variant="outline" label="Solicitar ajustes" onPress={() => confirm('adjustments_requested', 'Solicitar ajustes')} /><Button compact variant="danger" label="Rejeitar" onPress={() => confirm('rejected', 'Rejeitar item')} /><Button compact label="Aprovar" onPress={() => confirm('approved', 'Aprovar item')} /></View></Card>; }) : <Card><Text style={styles.cardTitle}>Sem pendências</Text><Text style={styles.cardBody}>Não há itens das suas disciplinas aguardando validação.</Text></Card>}</Screen>;
}

function Reports({ state, user, domain, ...props }) {
  const [filters, setFilters] = useState({ disciplineId: '', startDate: '', endDate: '' });
  const [exporting, setExporting] = useState(false);
  const exportLock = useRef(false);
  const report = domain.reportForProfessor(user.id, filters);
  const disciplines = state.professorDisciplines.filter(x => x.professorId === user.id).map(x => state.disciplines.find(d => d.id === x.disciplineId));
  const exportCsv = async () => {
    if (exportLock.current) return;
    exportLock.current=true;setExporting(true);
    try { await shareCsvReport(domain.exportReportCsv(user.id, filters)); }
    catch(error) { Alert.alert('Exportar relatório', userErrorMessage(error)); }
    finally { exportLock.current=false;setExporting(false); }
  };
  return <Screen {...props} title="Relatórios acadêmicos" subtitle="Filtros e exportação CSV"><SectionTitle>Período</SectionTitle><Field label="Data inicial (AAAA-MM-DD)" value={filters.startDate} onChangeText={startDate => setFilters(previous => ({ ...previous, startDate }))} /><Field label="Data final (AAAA-MM-DD)" value={filters.endDate} onChangeText={endDate => setFilters(previous => ({ ...previous, endDate }))} /><SectionTitle>Disciplina</SectionTitle><Choice label="Todas" selected={!filters.disciplineId} onPress={() => setFilters(previous => ({ ...previous, disciplineId: '' }))} />{disciplines.map(item => <Choice key={item.id} label={`${item.code} · ${item.name}`} selected={filters.disciplineId === item.id} onPress={() => setFilters(previous => ({ ...previous, disciplineId: item.id }))} />)}<View style={styles.kpiRow}><Kpi label="Presença" value={`${report.attendanceRate}%`} /><Kpi label="Reservas" value={report.reservations} /><Kpi label="Sessões" value={report.sessions} /></View><Button label={exporting ? "Preparando CSV…" : "Exportar relatório CSV"} disabled={exporting} onPress={exportCsv} /><SectionTitle>Desempenho por disciplina</SectionTitle>{report.rows.map(item => <Card key={item.disciplineId}><Text style={styles.cardTitle}>{item.code} · {item.name}</Text><Text style={styles.cardBody}>{item.sessions} sessão(ões) · {item.reservations} reserva(s) · {item.attendanceRate}% de presença</Text><View style={styles.progress}><View style={[styles.progressFill, { width: `${item.attendanceRate}%` }]} /></View></Card>)}</Screen>;
}

const styles = StyleSheet.create({
  processing: { padding: 12, backgroundColor: '#EAF1FF' }, flex: { flex: 1 }, safe: { flex: 1, backgroundColor: colors.background }, welcome: { flex: 1, backgroundColor: colors.primary },
  welcomeScroll: { flexGrow: 1, alignItems: 'center' }, welcomeInner: { flexGrow: 1, width: '100%', maxWidth: 560, justifyContent: 'center', padding: 24, gap: 14 }, welcomeText: { color: '#E8F0FF', fontSize: 16, lineHeight: 24, textAlign: 'center', marginVertical: 12 },
  logoWrap: { width: '100%', alignItems: 'center', marginVertical: 22 }, uniforLogo: { width: 230, maxWidth: '100%', height: 70, marginBottom: 18 }, logoLight: { tintColor: '#FFFFFF' },
  appMark: { width: 70, height: 70, borderRadius: 22, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center', shadowColor: '#001A56', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 5 },
  appMarkIcon: { color: '#FFFFFF', fontSize: 34, fontWeight: '900' }, logoTitle: { maxWidth: '100%', textAlign: 'center', fontSize: 32, fontWeight: '800', color: colors.text, marginTop: 12 }, logoSubtitle: { maxWidth: '100%', textAlign: 'center', color: colors.muted, marginTop: 4 }, lightText: { color: '#FFFFFF' }, lightMuted: { color: '#DCE8FF' },
  header: { backgroundColor: colors.surface, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border }, headerRow: { width: '100%', maxWidth: 840, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8 }, headerCopy: { flex: 1, minWidth: 0, alignItems: 'center' }, headerTitle: { alignSelf: 'stretch', textAlign: 'center', fontSize: 20, fontWeight: '800', color: colors.text }, headerSubtitle: { alignSelf: 'stretch', textAlign: 'center', fontSize: 12, color: colors.muted, marginTop: 2 }, headerRole: { maxWidth: '100%', marginTop: 6, alignSelf: 'center' }, headerRoleSide: { maxWidth: '32%', flexShrink: 1 }, back: { flexShrink: 0, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, backPlaceholder: { flexShrink: 0, width: 44 }, backText: { fontSize: 36, color: colors.primary, lineHeight: 38 },
  scrollContent: { flexGrow: 1 }, content: { width: '100%', maxWidth: 840, alignSelf: 'center', paddingVertical: 18, paddingBottom: 32, gap: 12 }, lead: { fontSize: 18, lineHeight: 26, color: colors.text, marginBottom: 8 },
  button: { minHeight: 50, maxWidth: '100%', borderRadius: 14, paddingHorizontal: 18, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.primary, flexShrink: 1 },
  buttonCompact: { minHeight: 44, paddingHorizontal: 14 }, button_outline: { backgroundColor: colors.surface, borderColor: colors.primary }, button_ghost: { backgroundColor: 'transparent', borderColor: 'transparent' }, button_light: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' }, button_danger: { backgroundColor: '#FFF1F2', borderColor: '#FDA4AF' },
  buttonText: { maxWidth: '100%', flexShrink: 1, color: '#FFFFFF', fontWeight: '800', textAlign: 'center' }, buttonText_outline: { color: colors.primary }, buttonText_ghost: { color: colors.primary }, buttonText_light: { color: colors.primary }, buttonText_danger: { color: colors.error }, disabled: { opacity: 0.45 }, pressed: { opacity: 0.75 },
  buttonRow: { flexWrap: 'wrap', flexDirection: 'row', gap: 10, marginTop: 10 }, quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  fieldWrap: { minWidth: 0, width: '100%', gap: 6 }, label: { flexShrink: 1, fontSize: 12, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 }, input: { minWidth: 0, width: '100%', minHeight: 50, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 12, color: colors.text, fontSize: 16 }, multiline: { minHeight: 110, maxHeight: 260, textAlignVertical: 'top' },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 16, gap: 7, shadowColor: '#0B1F45', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 1 }, cardAccent: { backgroundColor: colors.tint, borderColor: '#B9CEFF' }, cardTitle: { fontSize: 17, fontWeight: '800', color: colors.text }, heroTitle: { fontSize: 23, fontWeight: '900', color: colors.primaryDark }, cardBody: { color: colors.text, fontSize: 14, lineHeight: 21 }, meta: { color: colors.muted, fontSize: 12, lineHeight: 18 }, caption: { color: colors.muted, fontSize: 12, lineHeight: 17, textAlign: 'center' },
  badge: { flexShrink: 1, maxWidth: '100%', backgroundColor: colors.tint, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 99, alignSelf: 'flex-start' }, badge_success: { backgroundColor: '#DCFCE7' }, badge_warning: { backgroundColor: '#FEF3C7' }, badge_error: { backgroundColor: '#FEE2E2' }, badge_info: { backgroundColor: colors.tint }, badgeText: { flexShrink: 1, color: colors.primaryDark, fontWeight: '800', fontSize: 11 },
  rowBetween: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, sectionTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 10 }, sectionAction: { flexShrink: 1, maxWidth: '50%', minWidth: 44, minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' }, sectionTitle: { flex: 1, minWidth: 0, color: colors.text, fontSize: 18, fontWeight: '900' }, link: { color: colors.primary, fontWeight: '800' },
  search: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, minHeight: 54, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center' }, searchText: { color: colors.muted, fontSize: 15 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choiceColumn: { gap: 7 }, choice: { maxWidth: '100%', minHeight: 44, minWidth: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' }, choiceSelected: { borderColor: colors.primary, backgroundColor: colors.tint }, choiceText: { flexShrink: 1, color: colors.text }, choiceTextSelected: { color: colors.primaryDark, fontWeight: '800' },
  navSurface: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }, nav: { width: '100%', maxWidth: 840, alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', paddingVertical: 8 }, navItem: { minHeight: 48, minWidth: 44, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', gap: 2 }, navDot: { color: colors.primary, fontSize: 12 }, navText: { alignSelf: 'stretch', textAlign: 'center', flexShrink: 1, fontSize: 11, color: colors.muted, fontWeight: '700' },
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, kpi: { flexGrow: 1, flexShrink: 1, flexBasis: 136, minWidth: 0, minHeight: 92, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, alignItems: 'stretch', justifyContent: 'center', padding: 12 }, kpiValue: { textAlign: 'center', color: colors.primary, fontSize: 24, fontWeight: '900' }, kpiLabel: { color: colors.muted, fontSize: 11, textAlign: 'center' },
  code: { fontSize: 42, letterSpacing: 8, fontWeight: '900', color: colors.primary, textAlign: 'center', marginVertical: 8 },
  chat: { maxWidth: '100%', borderRadius: 16, padding: 13 }, chatBot: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, chatUser: { alignSelf: 'flex-end', backgroundColor: colors.primary }, chatUserText: { color: '#FFFFFF', lineHeight: 20 },
  progress: { height: 8, backgroundColor: '#E6EBF3', borderRadius: 99, overflow: 'hidden', marginTop: 8 }, progressFill: { height: 8, backgroundColor: colors.secondary, borderRadius: 99 }
});
