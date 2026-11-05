import React, { useEffect, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { OperationContext, Screen, Card, Button, BottomNav } from './components/ui.js';
import { styles } from './theme/styles.js';
import { ROLE_LABELS, createSessionFilters } from './constants.js';
import { WelcomeScreen, LoginScreen, RegisterScreen, ForgotScreen, RoleAccessScreen } from './screens/authentication.js';
import { StudentHome, Catalog, Filters, Details, Confirm, Agenda, Notifications, Materials, Attendance } from './screens/student.js';
import { MoniBot } from './screens/assistant.js';
import { Profile } from './screens/profile.js';
import { MonitorDashboard, ManageSessions, CreateSession, Participants, ManageMaterials, CreateMaterial } from './screens/monitor.js';
import { ProfessorDashboard, Approvals, Reports } from './screens/professor.js';
import { MoreScreen } from './screens/more.js';
import { FirebaseAuthRepository } from './infrastructure/firebaseAuthRepository.js';
import { loadAcademicState } from './infrastructure/academicLoader.js';
import { sendCommand } from './services/academicApi.js';
import { MonitoringService } from './domain/monitoring.js';
import { FirestoreStateRepository } from './infrastructure/repositories.js';
import { userErrorMessage } from './services/userErrors.js';

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
  const [filters, setFilters] = useState(createSessionFilters);

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
  const secondaryRoutes = ['more', 'bot', 'profile', 'materials', 'attendance', 'notifications', 'manageMaterials', 'createMaterial'];
  const navRoute = secondaryRoutes.includes(route) ? 'more' : route === 'createSession' ? 'manageSessions' : ['confirm', 'filters'].includes(route) ? 'catalog' : route;
  const nav = user ? <BottomNav role={activeRole} go={go} activeRoute={navRoute} /> : null;
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

  if (restoring) return <WelcomeScreen go={go} loading />;
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
    more: <MoreScreen {...screenProps} role={activeRole} go={go} />,
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
