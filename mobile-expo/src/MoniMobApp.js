import { Adjustments } from './screens/adjustments.js';
import { Favorites } from './screens/favorites.js';
import React, { useEffect, useReducer, useRef, useState } from 'react';
import { Alert, Linking, Text, View } from 'react-native';
import { OperationContext, Screen, Card, Button, BottomNav } from './components/ui.js';
import { styles } from './theme/styles.js';
import { ROLE_LABELS, createSessionFilters } from './constants.js';
import {
  WelcomeScreen,
  LoginScreen,
  RegisterScreen,
  ForgotScreen,
  RoleAccessScreen,
} from './screens/authentication.js';
import {
  StudentHome,
  Catalog,
  Filters,
  Details,
  Confirm,
  Agenda,
  Notifications,
  Materials,
  Attendance,
} from './screens/student.js';
import { MoniBot } from './screens/assistant.js';
import { Profile } from './screens/profile.js';
import { DeleteAccount } from './screens/deleteAccount.js';
import {
  MonitorDashboard,
  ManageSessions,
  CreateSession,
  Participants,
} from './screens/monitor.js';
import { ManageMaterials, CreateMaterial } from './screens/materials.js';
import { AcademicLinks } from './screens/academicLinks.js';
import { openAcademicMaterial, uploadMaterialFile } from './services/materialFileApi.js';
import { ProfessorDashboard, Approvals, Reports } from './screens/professor.js';
import { DashboardOverview } from './screens/dashboardOverview.js';
import { MoreScreen } from './screens/more.js';
import { FirebaseAuthRepository } from './infrastructure/firebaseAuthRepository.js';
import { loadAcademicState } from './infrastructure/academicLoader.js';
import { sendCommand } from './services/academicApi.js';
import { MonitoringService } from './domain/monitoring.js';
import { FirestoreStateRepository } from './infrastructure/repositories.js';
import { userErrorMessage } from './services/userErrors.js';
import {
  completeSignOut,
  homeForRole,
  publicSession,
  sessionNavigation,
} from './services/sessionNavigation.js';
import { useRestartOpening } from './components/launchExperience.js';

export default function MoniMobApp() {
  return (
    <View style={styles.flex}>
      <MoniMobRouter />
    </View>
  );
}

function MoniMobRouter() {
  const restartOpening = useRestartOpening();
  const repository = useRef(new FirestoreStateRepository(loadAcademicState)).current;
  const domain = useRef(new MonitoringService(repository)).current;
  const auth = useRef(new FirebaseAuthRepository()).current;
  const [state, setState] = useState(repository.read());
  const [{ route, user, activeRole }, dispatchSession] = useReducer(
    sessionNavigation,
    undefined,
    publicSession,
  );
  const deletionGuard = useRef(false);
  const liveAccount = useRef(user);
  liveAccount.current = user;
  const [processing, setProcessing] = useState(false);
  const operationLock = useRef(false);
  const operationVersion = useRef(0);
  const logoutLock = useRef(false);
  const [signingOut, setSigningOut] = useState(false);
  const [dataStatus, setDataStatus] = useState('idle');
  const [dataError, setDataError] = useState('');
  const loadVersion = useRef(0);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState(null);
  const [overviewKind,setOverviewKind]=useState('pending');
  const openOverview=kind=>{setOverviewKind(kind);dispatchSession({type:'go',route:'overview'});};
  const [filters, setFilters] = useState(createSessionFilters);

  const refresh = () => setState(repository.read());
  const go = (next) => dispatchSession({ type: 'go', route: next });
  const back = () => dispatchSession({ type: 'back' });
  const notify = (message) => Alert.alert('MoniMob', message);
  const execute = async (action, input = {}) => {
    if (operationLock.current) return null;
    operationLock.current = true;
    setProcessing(true);
    const operation = ++operationVersion.current;
    const version = loadVersion.current;
    try {
      const token = await auth.getToken(user?.id);
      const result = await sendCommand(token, activeRole, action, input);
      if (version !== loadVersion.current) return null;
      try {
        await repository.load(user, activeRole);
        if (version !== loadVersion.current) return null;
        refresh();
      } catch {
        setDataStatus('error');
        setDataError(
          'A operação foi salva, mas não foi possível atualizar a tela. Recarregue os dados.',
        );
      }
      return result;
    } catch (error) {
      if (version === loadVersion.current) notify(userErrorMessage(error));
      return null;
    } finally {
      if (operation === operationVersion.current) {
        operationLock.current = false;
        setProcessing(false);
      }
    }
  };
  const openMaterial = async material => {
    if (operationLock.current) return;
    operationLock.current = true; setProcessing(true);
    const operation = ++operationVersion.current;
    try { await openAcademicMaterial({ token: await auth.getToken(user?.id), role: activeRole, material }); }
    catch (error) { notify(userErrorMessage(error)); }
    finally { if (operation === operationVersion.current) { operationLock.current = false; setProcessing(false); } }
  };
  const saveMaterial = async (material, file) => {
    let saved;
    if (file) {
      if (operationLock.current) return;
      operationLock.current = true; setProcessing(true);
      const operation = ++operationVersion.current;
      const version = loadVersion.current;
      try {
        saved = await uploadMaterialFile({ token: await auth.getToken(user?.id), role: activeRole, file, title: material.title, disciplineId: material.disciplineId, materialId: material.id, expectedRevision: material.expectedRevision });
        if (version !== loadVersion.current) return;
        try { await repository.load(user, activeRole); if (version !== loadVersion.current) return; refresh(); }
        catch { setDataStatus('error'); setDataError('Material salvo. Atualize os dados para visualizar a publicação.'); }
      } finally { if (operation === operationVersion.current) { operationLock.current = false; setProcessing(false); } }
    } else saved = await execute('saveMaterial', { material });
    if (saved) { notify(activeRole === 'professor' ? 'Material publicado e disponível para alunos e monitores vinculados.' : 'Material enviado ao professor para aprovação.'); go('manageMaterials'); }
  };
  const homeFor = homeForRole;
  const chooseRole = (role) => {
    if (operationLock.current || logoutLock.current) return;
    if (!user?.roles?.includes(role)) return notify('Perfil não autorizado para esta conta.');
    dispatchSession({ type: 'chooseRole', role });
    void loadData(user, role);
  };
  const signOut = async () => {
    if (logoutLock.current) return;
    logoutLock.current = true;
    setSigningOut(true);
    const previousRole = activeRole;
    let token = Promise.resolve(null);
    try {
      if (user) token = auth.getToken(user?.id);
    } catch {}
    try {
      await completeSignOut({
        reset: () => {
          loadVersion.current += 1;
          operationVersion.current += 1;
          operationLock.current = false;
          repository.clear();
          refresh();
          setProcessing(false);
          setDataStatus('idle');
          setDataError('');
          setSelectedSessionId(null);
          setEditingSessionId(null);
          setSelectedMaterialId(null);
          setFilters(createSessionFilters());
          dispatchSession({ type: 'signedOut' });
          restartOpening();
        },
        signOut: () => auth.signOut(),
        recordEvent: async () => {
          const value = await token;
          if (value && previousRole) await sendCommand(value, previousRole, 'recordSignOut', {});
        },
      });
    } catch (error) {
      notify('Não foi possível concluir a saída da conta neste aparelho. Tente novamente.');
    } finally {
      logoutLock.current = false;
      setSigningOut(false);
    }
  };
  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;
  const selectedSession = state.sessions.find((item) => item.id === selectedSessionId) || null;
  const editingSession = state.sessions.find((item) => item.id === editingSessionId) || null;
  const selectedMaterial = state.materials.find((item) => item.id === selectedMaterialId) || null;
  const openSession = (session) => {
    setSelectedSessionId(session.id);
    go('details');
  };
  const secondaryRoutes = [
    'adjustments',
    'favorites',
    'overview',
    'more',
    'bot',
    'profile',
    'materials',
    'attendance',
    'notifications',
    'manageMaterials',
    'createMaterial',
    'academicLinks',
  ];
  const navRoute = secondaryRoutes.includes(route)
    ? 'more'
    : route === 'createSession'
      ? 'manageSessions'
      : ['confirm', 'filters'].includes(route)
        ? 'catalog'
        : route;
  const nav = user ? <BottomNav role={activeRole} go={go} activeRoute={navRoute} /> : null;
  const screenProps = { onBack: back, role: activeRole, footer: nav };

  const loadData = async (signedUser, role = activeRole) => {
    const version = ++loadVersion.current;
    setDataStatus('loading');
    setDataError('');
    try {
      await repository.load(signedUser, role);
      if (version !== loadVersion.current) return;
      refresh();
      setDataStatus('ready');
    } catch (error) {
      if (version !== loadVersion.current) return;
      repository.clear();
      refresh();
      setDataStatus('error');
      setDataError(
        ['DATA_QUOTA_EXCEEDED', 'resource-exhausted', 'SERVER_BUSY'].includes(error.code)
          ? userErrorMessage(error)
          : error.code === 'permission-denied'
            ? 'Sua conta não tem acesso a estes dados.'
            : 'Não foi possível carregar os dados. Verifique sua conexão e tente novamente.',
      );
    }
  };
  const acceptUser = (signedUser) => {
    const selectedRole = signedUser.roles.includes(signedUser.requestedRole)
      ? signedUser.requestedRole
      : null;
    const role = selectedRole || signedUser.roles[0];
    dispatchSession({ type: 'signedIn', user: signedUser });
    void loadData(signedUser, role);
    void auth
      .getToken()
      .then((token) => sendCommand(token, role, 'recordSignIn', {}))
      .catch(() => {});
  };
  useEffect(() => {
    // Read once on entry so a decision made by another account is not hidden
    // behind the previous snapshot. Do not poll or re-run on loading renders.
    if (user && activeRole === 'monitor' && route === 'adjustments') {
      void loadData(user, activeRole);
    }
  }, [route, user?.id, activeRole]);
  useEffect(() => {
    // Opening the project always starts at welcome. Only an explicit sign-in
    // may enter an academic area; a QR scan in an already open Expo project exits it.
    const subscription = Linking.addEventListener('url', (event) => {
      if (/^exps?:\/\//i.test(event.url || '') && !deletionGuard.current) void signOutRef.current();
    });
    return () => {
      subscription.remove();
      loadVersion.current += 1;
      operationVersion.current += 1;
      repository.clear();
    };
  }, []);

  if (route === 'welcome') return <WelcomeScreen go={go} loading={signingOut} />;
  if (route === 'login')
    return (
      <LoginScreen auth={auth} onBack={back} onForgot={() => go('forgot')} onSuccess={acceptUser} />
    );
  if (route === 'register')
    return <RegisterScreen auth={auth} onBack={back} onSuccess={acceptUser} />;
  if (route === 'forgot') return <ForgotScreen auth={auth} onBack={back} />;
  if (route === 'roleAccess')
    return <RoleAccessScreen user={user} chooseRole={chooseRole} signOut={signOut} />;

  if (user && route === 'deleteAccount')
    return (
      <DeleteAccount
        auth={auth}
        user={user}
        activeRole={activeRole}
        state={state}
        countsReady={dataStatus === 'ready'}
        onBack={back}
        onGuardChange={(value) => {
          deletionGuard.current = value;
        }}
        onDeleted={() => {
          if (liveAccount.current?.id === user.id) return signOut();
        }}
      />
    );

  if (user && !['profile', 'bot'].includes(route) && dataStatus !== 'ready') {
    return (
      <Screen {...screenProps} title="Dados acadêmicos">
        <Card>
          <Text style={styles.cardTitle}>
            {dataStatus === 'loading' ? 'Carregando dados…' : 'Dados indisponíveis'}
          </Text>
          <Text style={styles.cardBody}>
            {dataError || 'Aguarde a consulta ao banco de dados.'}
          </Text>
          {dataStatus !== 'loading' ? (
            <Button label="Tentar novamente" onPress={() => loadData(user)} />
          ) : null}
        </Card>
        <Button label="Meu perfil" variant="outline" onPress={() => go('profile')} />
        <Button label="Sair" variant="primary" onPress={signOut} />
      </Screen>
    );
  }
  if (['details', 'confirm'].includes(route) && !selectedSession)
    return (
      <Screen {...screenProps} title="Monitoria">
        <Text style={styles.cardBody}>Nenhuma monitoria selecionada.</Text>
      </Screen>
    );

  if (!user) return <WelcomeScreen go={go} />;

  const views = {
    adjustments: <Adjustments {...screenProps} state={state} user={user} reloadData={()=>loadData(user,activeRole)}
      editSession={item=>{setEditingSessionId(item.id);go('createSession');}} editMaterial={item=>{setSelectedMaterialId(item.id);go('createMaterial');}} />,
    favorites: <Favorites {...screenProps} state={state} user={user} go={go} openSession={openSession}
      reloadData={() => loadData(user, activeRole)} removeFavorite={sessionId => execute('setFavorite', { sessionId, favorite: false })} />,
    overview: <DashboardOverview {...screenProps} state={state} user={user} kind={overviewKind} go={go} openSession={openSession} reloadData={()=>loadData(user,activeRole)} openParticipants={id=>{setSelectedSessionId(id);go('participants');}} />,
    home: (
      <StudentHome
        openOverview={openOverview}
        {...screenProps}
        state={state}
        user={user}
        recommendations={domain.recommendations(user.id)}
        reloadData={() => loadData(user, activeRole)}
        go={go}
        openSession={openSession}
      />
    ),
    catalog: (
      <Catalog
        reloadData={() => loadData(user, activeRole)}
        {...screenProps}
        state={state}
        sessions={domain.listSessions({ ...filters, approvedOnly: true })}
        filters={filters}
        setFilters={setFilters}
        go={go}
        openSession={openSession}
      />
    ),
    filters: (
      <Filters
        {...screenProps}
        state={state}
        filters={filters}
        setFilters={setFilters}
        apply={() => go('catalog')}
      />
    ),
    details: (
      <Details
        {...screenProps}
        state={state}
        session={selectedSession}
        user={user}
        domain={domain}
        execute={execute}
        go={go}
        openMaterial={openMaterial}
      />
    ),
    confirm: (
      <Confirm
        {...screenProps}
        state={state}
        session={selectedSession}
        reserve={async () => {
          const saved = await execute('reserve', {
            sessionId: selectedSession.id,
            studentId: user.id,
          });
          if (saved) {
            notify('Reserva confirmada.');
            go('agenda');
          }
        }}
      />
    ),
    agenda: (
      <Agenda
        reloadData={() => loadData(user, activeRole)}
        {...screenProps}
        state={state}
        user={user}
        openSession={openSession}
        cancel={(reservation) =>
          Alert.alert(
            'Cancelar reserva',
            'Confirma o cancelamento? A vaga poderá ser repassada à lista de espera.',
            [
              { text: 'Manter', style: 'cancel' },
              {
                text: 'Cancelar reserva',
                style: 'destructive',
                onPress: () =>
                  execute('cancelReservation', {
                    reservationId: reservation.id,
                    studentId: user.id,
                  }),
              },
            ],
          )
        }
      />
    ),
    notifications: (
      <Notifications
        {...screenProps}
        state={state}
        user={user}
        refresh={refresh}
        repository={repository}
        execute={execute}
      />
    ),
    materials: <Materials {...screenProps} state={state} user={user} openMaterial={openMaterial} reloadData={() => loadData(user, activeRole)} />,
    academicLinks: <AcademicLinks {...screenProps} state={state} user={user} execute={execute} reloadData={() => loadData(user, activeRole)} />,
    attendance: (
      <Attendance {...screenProps} state={state} user={user} execute={execute} domain={domain} />
    ),
    bot: (
      <MoniBot
        key={`${user.id}:${activeRole}`}
        {...screenProps}
        getToken={() => auth.getToken(user?.id)}
        activeRole={activeRole}
        selectedSession={state.sessions.find((item) => item.id === selectedSessionId)}
      />
    ),
    more: <MoreScreen {...screenProps} role={activeRole} go={go} />,
    profile: (
      <Profile
        {...screenProps}
        auth={auth}
        user={user}
        setUser={(updated) => dispatchSession({ type: 'updateUser', user: updated })}
        activeRole={activeRole}
        chooseRole={chooseRole}
        signOut={signOut}
        onDeleteAccount={() => go('deleteAccount')}
      />
    ),
    monitorDashboard: (
      <MonitorDashboard
        openOverview={openOverview}
        {...screenProps}
        state={state}
        user={user}
        go={go}
        create={() => {
          setEditingSessionId(null);
          go('createSession');
        }}
      />
    ),
    manageSessions: (
      <ManageSessions
        {...screenProps}
        state={state}
        user={user}
        go={go}
        openSession={openSession}
        create={() => {
          setEditingSessionId(null);
          go('createSession');
        }}
        edit={(session) => {
          setEditingSessionId(session.id);
          go('createSession');
        }}
        archive={(session) =>
          Alert.alert(
            'Cancelar monitoria',
            'Esta ação avisará os participantes e arquivará a sessão. Continuar?',
            [
              { text: 'Voltar', style: 'cancel' },
              {
                text: 'Confirmar',
                style: 'destructive',
                onPress: () =>
                  execute('archiveSession', { actorId: user.id, sessionId: session.id }),
              },
            ],
          )
        }
      />
    ),
    createSession: (
      <CreateSession
        {...screenProps}
        state={state}
        user={user}
        editingSession={editingSession}
        goLinks={() => go('academicLinks')}
        reloadData={() => loadData(user, activeRole)}
        save={async (session) => {
          const saved = await execute('saveSession', { actorId: user.id, session });
          if (saved) {
            setEditingSessionId(null);
            notify(saved.status === 'pending' ? 'Correção enviada ao professor. Aguarde a nova aprovação.' : 'Monitoria publicada e disponível para os alunos.');
            go('manageSessions');
          }
        }}
      />
    ),
    participants: (
      <Participants
        {...screenProps}
        state={state}
        user={user}
        domain={domain}
        execute={execute}
        preferredSessionId={selectedSessionId}
        refresh={refresh}
      />
    ),
    manageMaterials: <ManageMaterials {...screenProps} state={state} user={user} openMaterial={openMaterial} reloadData={() => loadData(user, activeRole)} review={() => go('approvals')}
      create={() => { setSelectedMaterialId(null); go('createMaterial'); }}
      edit={material => { setSelectedMaterialId(material.id); go('createMaterial'); }}
      remove={material => Alert.alert('Excluir material', 'O arquivo ou link ficará indisponível. O registro acadêmico da exclusão será preservado nos relatórios. Continuar?', [
        { text: 'Manter', style: 'cancel' },
        { text: 'Excluir', style: 'destructive', onPress: async () => { const saved = await execute('deleteMaterial', { materialId: material.id }); if (saved) notify(saved.storageDeletionPending ? 'Acesso removido. A limpeza do arquivo será concluída automaticamente pelo servidor.' : 'Material excluído. O histórico foi preservado no relatório.'); } },
      ])} />,
    createMaterial: <CreateMaterial key={selectedMaterialId || 'new'} {...screenProps} state={state} user={user} selectedMaterial={selectedMaterial} save={saveMaterial} goLinks={() => go('academicLinks')} />,
    professorDashboard: (
      <ProfessorDashboard
        openOverview={openOverview}
        reloadData={() => loadData(user, activeRole)}
        {...screenProps}
        state={state}
        user={user}
        report={activeRole === 'professor' ? domain.reportForProfessor(user.id) : {}}
          openSession={openSession}
        suspend={session => Alert.alert('Suspender monitoria', 'A sessão será cancelada e os participantes serão avisados. Continuar?', [{ text: 'Manter', style: 'cancel' }, { text: 'Suspender', style: 'destructive', onPress: () => execute('suspendSession', { sessionId: session.id }) }])}
        go={go}
      />
    ),
    approvals: (
      <Approvals
        reloadData={() => loadData(user, activeRole)}
        {...screenProps}
        state={state}
        user={user}
        openMaterial={openMaterial}
        decide={(type, id, decision, comment, expectedRevision) =>
          execute('decideApproval', {
            professorId: user.id,
            entityType: type,
            entityId: id,
            decision,
            comment,
            expectedRevision,
          })
        }
      />
    ),
    reports: <Reports {...screenProps} state={state} user={user} domain={domain} />,
  };
  return (
    <OperationContext.Provider value={processing}>
      <View style={styles.flex}>{views[route] || views[homeFor(activeRole)]}</View>
    </OperationContext.Provider>
  );
}
