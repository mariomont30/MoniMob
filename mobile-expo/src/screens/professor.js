import React, { useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Screen, SectionTitle, Card, Button, MenuLink, Kpi, Badge, Field, Choice } from '../components/ui.js';
import { styles } from '../theme/styles.js';
import { shareCsvReport } from '../services/csvSharing.js';
import { userErrorMessage } from '../services/userErrors.js';

export function ProfessorDashboard({ state, user, report, go, ...props }) {
  const links = state.professorDisciplines.filter(item => item.professorId === user.id);
  return (
    <Screen {...props} title="Área do professor" subtitle="Supervisão acadêmica">
      <View style={styles.kpiRow}>
        <Kpi label="Disciplinas" value={report.disciplines} />
        <Kpi label="Sessões" value={report.sessions} />
        <Kpi label="Pendências" value={report.pending} />
      </View>
      <SectionTitle>Ferramentas</SectionTitle>
      <MenuLink title="Validações acadêmicas" subtitle="Revisar monitorias e materiais enviados" onPress={() => go('approvals')} />
      <MenuLink title="Relatórios" subtitle="Acompanhar presença e atividade por disciplina" onPress={() => go('reports')} />
      <SectionTitle>Disciplinas vinculadas</SectionTitle>
      {links.length ? links.map(link => {
        const discipline = state.disciplines.find(item => item.id === link.disciplineId);
        const monitors = state.monitorDisciplines.filter(item => item.disciplineId === link.disciplineId);
        return <Card key={link.id}>
          <Text style={styles.cardTitle}>{discipline?.code} · {discipline?.name}</Text>
          {monitors.length ? monitors.map(item => <Text key={item.id} style={styles.cardBody}>{state.users.find(profile => profile.id === item.monitorId)?.name} · vínculo até {item.validUntil?.slice(0, 10)}</Text>) : <Text style={styles.meta}>Nenhum monitor com vínculo vigente.</Text>}
        </Card>;
      }) : <Card><Text style={styles.cardBody}>Nenhuma disciplina vinculada à sua conta.</Text></Card>}
    </Screen>
  );
}

export function Approvals({ state, user, decide, ...props }) {
  const [comment, setComment] = useState('');
  const items = [
    ...state.sessions.filter(item => item.professorId === user.id && item.status === 'pending' && !item.archived).map(item => ({ ...item, entityType: 'session', label: item.topic })),
    ...state.materials.filter(item => item.professorId === user.id && item.status === 'pending' && !item.archived).map(item => ({ ...item, entityType: 'material', label: item.title }))
  ];
  return <Screen {...props} title="Validações acadêmicas" subtitle="Somente disciplinas vinculadas"><Field label="Observação para a decisão" value={comment} onChangeText={setComment} placeholder="Obrigatória ao solicitar ajustes" multiline />{items.length ? items.map(item => { const d = state.disciplines.find(x => x.id === item.disciplineId); const confirm = (decision, label) => Alert.alert(label, `Confirma a decisão para “${item.label}”?`, [{ text: 'Voltar', style: 'cancel' }, { text: 'Confirmar', onPress: async () => { if (await decide(item.entityType, item.id, decision, comment)) setComment(''); } }]); return <Card key={`${item.entityType}-${item.id}`}><View style={styles.rowBetween}><Badge>{item.entityType === 'session' ? 'Sessão' : 'Material'}</Badge><Badge tone="warning">Pendente</Badge></View><Text style={styles.cardTitle}>{item.label}</Text><Text style={styles.cardBody}>{d?.name}</Text><View style={styles.actionWrap}><Button compact variant="outline" label="Solicitar ajustes" onPress={() => confirm('adjustments_requested', 'Solicitar ajustes')} /><Button compact variant="danger" label="Rejeitar" onPress={() => confirm('rejected', 'Rejeitar item')} /><Button compact label="Aprovar" onPress={() => confirm('approved', 'Aprovar item')} /></View></Card>; }) : <Card><Text style={styles.cardTitle}>Sem pendências</Text><Text style={styles.cardBody}>Não há itens das suas disciplinas aguardando validação.</Text></Card>}</Screen>;
}

export function Reports({ state, user, domain, ...props }) {
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
