import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Screen, SectionTitle, Card, Button, MenuLink, Kpi, Badge, Choice, Field } from '../components/ui.js';
import { styles } from '../theme/styles.js';
import { statusLabel } from '../constants.js';

export function MonitorDashboard({ state, user, go, create, ...props }) {
  const sessions = state.sessions.filter(item => item.monitorId === user.id && !item.archived);
  const participants = state.reservations.filter(item => sessions.some(session => session.id === item.sessionId) && item.status === 'confirmed').length;
  return (
    <Screen {...props} title="Área do monitor" subtitle={`Olá, ${user.name.split(' ')[0]}`}>
      <View style={styles.kpiRow}>
        <Kpi label="Monitorias" value={sessions.length} />
        <Kpi label="Alunos reservados" value={participants} />
      </View>
      <Button label="Cadastrar nova monitoria" onPress={create} />
      <MenuLink title="Minhas monitorias" subtitle="Editar sessões e acompanhar aprovações" onPress={() => go('manageSessions')} />
    </Screen>
  );
}

export function ManageSessions({ state, user, openSession, create, edit, archive, ...props }) {
  const sessions = state.sessions.filter(item => item.monitorId === user.id && !item.archived);
  return <Screen {...props} title="Gerenciar monitorias" subtitle="CRUD por sessão"><Button label="Cadastrar monitoria" onPress={create} />{sessions.map(session => { const discipline = state.disciplines.find(item => item.id === session.disciplineId); return <Card key={session.id}><View style={styles.rowBetween}><Badge>{discipline?.code}</Badge><Badge tone={session.status === 'approved' ? 'success' : session.status === 'rejected' ? 'error' : 'warning'}>{statusLabel(session.status)}</Badge></View><Text style={styles.cardTitle}>{discipline?.name}</Text><Text style={styles.cardBody}>{session.topic}</Text><Text style={styles.meta}>{session.date} · {session.time}</Text><View style={styles.actionWrap}><Button compact variant="outline" label="Detalhes" onPress={() => openSession(session)} /><Button compact variant="outline" label="Editar" onPress={() => edit(session)} /><Button compact variant="danger" label="Arquivar" onPress={() => archive(session)} /></View></Card>; })}</Screen>;
}

export function CreateSession({ state, user, editingSession, save, ...props }) {
  const links = state.monitorDisciplines.filter(item => item.monitorId === user.id && item.active);
  const [form, setForm] = useState({ id: editingSession?.id, disciplineId: editingSession?.disciplineId || links[0]?.disciplineId || '', topic: editingSession?.topic || '', description: editingSession?.description || '', date: editingSession?.date || '', time: editingSession?.time || '', durationMinutes: String(editingSession?.durationMinutes || 60), modality: editingSession?.modality || 'Presencial', location: editingSession?.location || '', capacity: String(editingSession?.capacity || 10), monitoringUrl: editingSession?.monitoringUrl || '', linkValidUntil: editingSession?.linkValidUntil || '' });
  const set = key => value => setForm(previous => ({ ...previous, [key]: value }));
  return <Screen {...props} title={editingSession ? 'Editar monitoria' : 'Cadastrar monitoria'} subtitle="Será enviada para aprovação"><SectionTitle>Disciplina vinculada</SectionTitle>{links.map(link => { const d = state.disciplines.find(item => item.id === link.disciplineId); return <Choice key={link.disciplineId} label={`${d?.code} · ${d?.name}`} selected={form.disciplineId === link.disciplineId} onPress={() => set('disciplineId')(link.disciplineId)} />; })}<Field label="Conteúdo" value={form.description} onChangeText={set('description')} multiline /><Field label="Assunto" value={form.topic} onChangeText={set('topic')} /><Field label="Data (AAAA-MM-DD)" value={form.date} onChangeText={set('date')} /><Field label="Horário (HH:MM)" value={form.time} onChangeText={set('time')} /><Field label="Duração em minutos" value={form.durationMinutes} onChangeText={set('durationMinutes')} keyboardType="number-pad" /><View style={styles.choiceRow}>{['Presencial','Online'].map(item => <Choice key={item} label={item} selected={form.modality === item} onPress={() => set('modality')(item)} />)}</View><Field label="Local" value={form.location} onChangeText={set('location')} /><Field label={form.modality === 'Online' ? 'Link da monitoria (obrigatório)' : 'Link da monitoria (opcional)'} value={form.monitoringUrl} onChangeText={set('monitoringUrl')} /><Field label="Validade do link (AAAA-MM-DDTHH:MM:SS)" value={form.linkValidUntil} onChangeText={set('linkValidUntil')} /><Field label="Vagas" value={form.capacity} onChangeText={set('capacity')} keyboardType="number-pad" /><Button label="Enviar para validação" onPress={() => save(form)} /></Screen>;
}

export function Participants({ state, user, domain, execute, ...props }) {
  const sessions = state.sessions.filter(item => item.monitorId === user.id && !item.archived && item.status === 'approved');
  const [sessionId, setSessionId] = useState(sessions[0]?.id || '');
  const [latest, setLatest] = useState(null);
  const reservations = state.reservations.filter(item => item.sessionId === sessionId && item.status === 'confirmed');
  const canGenerate = sessionId ? domain.canGenerateAttendanceCode(sessionId) : false;
  const canSetAttendance = sessionId ? domain.canSetAttendance(sessionId) : false;
  const confirmAttendance = (studentId, status) => Alert.alert('Alterar presença', 'Confirma a alteração deste participante?', [{ text: 'Voltar', style: 'cancel' }, { text: 'Confirmar', onPress: () => execute('setAttendance', { sessionId, studentId, status }) }]);
  const generate = async () => { const code = await execute('generateAttendanceCode', { actorId: user.id, sessionId }); if (code) setLatest(code); };
  return <Screen {...props} title="Participantes e presença" subtitle="Dados isolados por sessão"><SectionTitle>Sessão aprovada</SectionTitle>{sessions.map(item => { const d = state.disciplines.find(x => x.id === item.disciplineId); return <Choice key={item.id} label={`${d?.name} · ${item.date} ${item.time}`} selected={sessionId === item.id} onPress={() => { setSessionId(item.id); setLatest(null); }} />; })}{!sessions.length ? <Card><Text style={styles.cardBody}>Não há monitorias aprovadas para gerenciar presença.</Text></Card> : null}<View style={styles.kpiRow}><Kpi label="Reservas" value={reservations.length} /><Kpi label="Presentes" value={state.attendance.filter(item => item.sessionId === sessionId && item.status === 'present').length} /></View><Button label="Gerar novo código" disabled={!sessionId || !canGenerate} onPress={generate} />{sessionId && !canGenerate ? <Text style={styles.caption}>O código fica disponível 15 minutos antes do início até 30 minutos após o término.</Text> : null}{latest ? <Card accent><Text style={styles.label}>Código temporário de presença</Text><Text style={styles.code} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.4}>{latest.code}</Text><Text style={styles.caption}>Expira em {new Date(latest.expiresAt).toLocaleTimeString('pt-BR')}</Text></Card> : null}<SectionTitle>Lista de participantes</SectionTitle>{reservations.length ? reservations.map(item => { const student = state.users.find(x => x.id === item.studentId); const attendance = state.attendance.find(x => x.sessionId === sessionId && x.studentId === item.studentId); return <Card key={item.id}><View style={styles.rowBetween}><Text style={styles.cardTitle}>{student?.name}</Text><Badge tone={attendance?.status === 'present' ? 'success' : attendance?.status === 'absent' ? 'error' : 'warning'}>{attendance?.status === 'present' ? 'Presente' : attendance?.status === 'absent' ? 'Ausente' : 'Pendente'}</Badge></View><View style={styles.buttonRow}><Button compact label="Presente" disabled={!canSetAttendance} onPress={() => confirmAttendance(item.studentId, 'present')} /><Button compact variant="danger" label="Ausente" disabled={!canSetAttendance} onPress={() => confirmAttendance(item.studentId, 'absent')} /></View></Card>; }) : <Card><Text style={styles.cardBody}>Nenhum participante reservado nesta sessão.</Text></Card>}</Screen>;
}

export function ManageMaterials({ state, user, go, create, select, archive, ...props }) {
  const items = state.materials.filter(item => item.monitorId === user.id && !item.archived);
  return <Screen {...props} title="Gerenciar materiais" subtitle="CRUD por disciplina"><Button label="Cadastrar material" onPress={create} />{items.map(item => { const d = state.disciplines.find(x => x.id === item.disciplineId); return <Card key={item.id}><View style={styles.rowBetween}><Badge>{d?.code}</Badge><Badge tone={item.status === 'approved' ? 'success' : item.status === 'rejected' ? 'error' : 'warning'}>{statusLabel(item.status)}</Badge></View><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.cardBody}>{d?.name} · {item.type}</Text><View style={styles.buttonRow}><Button compact variant="outline" label="Editar" onPress={() => { select(item.id); go('createMaterial'); }} /><Button compact variant="danger" label="Arquivar" onPress={() => archive(item)} /></View></Card>; })}</Screen>;
}

export function CreateMaterial({ state, user, selectedMaterial, save, ...props }) {
  const links = state.monitorDisciplines.filter(item => item.monitorId === user.id && item.active);
  const editing = selectedMaterial?.monitorId === user.id ? selectedMaterial : null;
  const [form, setForm] = useState({ id: editing?.id, disciplineId: editing?.disciplineId || links[0]?.disciplineId || '', title: editing?.title || '', type: editing?.type || 'Link', url: editing?.url || '' });
  const set = key => value => setForm(previous => ({ ...previous, [key]: value }));
  return <Screen {...props} title={editing ? 'Editar material' : 'Cadastrar material'} subtitle="Validação acadêmica obrigatória"><SectionTitle>Disciplina</SectionTitle>{links.map(link => { const d = state.disciplines.find(item => item.id === link.disciplineId); return <Choice key={link.disciplineId} label={`${d?.code} · ${d?.name}`} selected={form.disciplineId === link.disciplineId} onPress={() => set('disciplineId')(link.disciplineId)} />; })}<Field label="Título" value={form.title} onChangeText={set('title')} /><Field label="Tipo" value={form.type} onChangeText={set('type')} /><Field label="URL do material" value={form.url} onChangeText={set('url')} /><Button label="Enviar para validação" onPress={() => save(form)} /></Screen>;
}
