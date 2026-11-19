import React, { useState } from 'react';
import { Alert, Text } from 'react-native';
import { Screen, Card, SectionTitle, Choice, Field, Button, Badge } from '../components/ui.js';
import { DateTimeField } from '../components/dateTimeField.js';
import { styles } from '../theme/styles.js';
import { activeAcademicLink, ownsCourse } from '../domain/workflow.js';
import { displayDate, displayDeadline } from '../services/presentation.js';
const requestStatus = {
  pending: 'Aguardando professor',
  approved: 'Aprovado',
  rejected: 'Recusado',
  cancelled: 'Cancelado'
};
function RequestDecision({
  request,
  state,
  execute
}) {
  const [comment, setComment] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [validUntilTime, setValidUntilTime] = useState('');
  const course = state.disciplines.find(x => x.id === request.disciplineId);
  const monitor = state.users.find(x => x.id === request.monitorId);
  const needsSupervision = !ownsCourse(state, request.professorId, request.disciplineId);
  const decide = decision => Alert.alert('Analisar solicitação', `${decision === 'approved' ? 'Aprovar' : 'Recusar'} o vínculo de ${monitor?.name || 'monitor'}?${decision === 'approved' && needsSupervision ? ' Ao aprovar, você também confirma a supervisão desta disciplina.' : ''}`, [{
    text: 'Voltar',
    style: 'cancel'
  }, {
    text: 'Confirmar',
    onPress: () => execute('decideMonitorLink', {
      requestId: request.id,
      decision,
      comment,
      validUntil, validUntilTime
    })
  }]);
  return <Card>
    <Badge tone="warning">Solicitação de vínculo</Badge>
    <Text style={styles.cardTitle}>{monitor?.name || 'Monitor'}</Text>
    <Text style={styles.cardBody}>{course?.code} · {course?.name}</Text>
    {request.message ? <Text style={styles.meta}>{request.message}</Text> : null}
    {needsSupervision ? <Text style={styles.cardBody}>A aprovação também vinculará esta disciplina à sua supervisão. A solicitação sozinha não concede acesso ao monitor.</Text> : null}
    <DateTimeField label="Vínculo válido até" value={validUntil} onChange={setValidUntil} />
    <DateTimeField label="Horário limite (opcional)" mode="time" date={validUntil} value={validUntilTime} onChange={setValidUntilTime} />
    <Text style={styles.caption}>Horário de Brasília. Sem horário informado, o prazo termina às 23:59:59 da data escolhida. A monitoria deve terminar dentro desse período.</Text>
    <Field label="Observação da análise" value={comment} onChangeText={setComment} multiline />
    <Button label="Aprovar vínculo" disabled={!validUntil} onPress={() => decide('approved')} />
    <Button label="Recusar solicitação" variant="outline" onPress={() => decide('rejected')} />
  </Card>;
}
export function AcademicLinks({
  state,
  user,
  role,
  execute,
  reloadData,
  ...props
}) {
  const [courseId, setCourseId] = useState('');
  const [professorId, setProfessorId] = useState('');
  const [message, setMessage] = useState('');
  const [courseSearch, setCourseSearch] = useState('');
  const [showAllCourses, setShowAllCourses] = useState(false);
  const teaching = state.professorDisciplines.filter(activeAcademicLink);
  const mine = role === 'professor' ? teaching.filter(x => x.professorId === user.id) : state.monitorDisciplines.filter(x => x.monitorId === user.id);
  const courses = state.disciplines.filter(x => x.active !== false);
  const directory = state.users.filter(x => !x.disabled && x.roles?.includes('professor'));
  const requests = (state.linkRequests || []).filter(x => role === 'professor' ? x.professorId === user.id : x.monitorId === user.id);
  const availableCourses = courses.filter(d => !mine.some(x => x.disciplineId === d.id && activeAcademicLink(x)));
  const normalize = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const matches = availableCourses.filter(d => normalize(d.code + ' ' + d.name).includes(normalize(courseSearch.trim())));
  const visibleCourses = showAllCourses ? matches : matches.slice(0, 8);
  const selectedCourse = availableCourses.find(d => d.id === courseId);
  const pendingRequest = requests.find(r => r.disciplineId === courseId && r.status === 'pending');
  const submit = async () => {
    const saved = await execute(role === 'professor' ? 'registerProfessorDiscipline' : 'requestMonitorLink', {
      disciplineId: courseId,
      professorId,
      message
    });
    if (saved) {
      setMessage('');
      if (role === 'professor') {
        setCourseId('');
        setProfessorId('');
        setCourseSearch('');
      }
      Alert.alert('Vínculos', role === 'professor' ? 'Disciplina vinculada. Você já pode receber solicitações e publicar materiais.' : 'Solicitação enviada ao professor. Acompanhe a decisão nesta tela.');
    }
  };
  return <Screen {...props} role={role} title={role === 'professor' ? 'Disciplinas e monitores' : 'Meus vínculos'} subtitle="Solicitação e acompanhamento acadêmico">
    <Button label="Atualizar vínculos" variant="outline" onPress={reloadData} />
    <SectionTitle>{role === 'professor' ? 'Vincular minha disciplina' : 'Solicitar vínculo'}</SectionTitle>
    <Text style={styles.cardBody}>{role === 'professor' ? 'Selecione uma disciplina que você supervisiona. Os monitores poderão solicitar seu acompanhamento.' : 'Escolha a disciplina e seu professor responsável. Você pode solicitar antes de cadastrar qualquer monitoria.'}</Text>
    {!courses.length ? <Card>
      <Text style={styles.cardTitle}>Catálogo de disciplinas indisponível</Text>
      <Text style={styles.cardBody}>Não há disciplinas ativas carregadas. Toque em Atualizar vínculos. Se continuar vazio, reinicie o servidor pela pasta atualizada do projeto para preparar o catálogo.</Text>
    </Card> : !availableCourses.length ? <Card><Text style={styles.cardBody}>Todas as disciplinas disponíveis já possuem um vínculo ativo com você. Consulte seus vínculos abaixo.</Text></Card> : <Field label="Buscar disciplina por código ou nome" value={courseSearch} onChangeText={value => { setCourseSearch(value); setCourseId(''); setProfessorId(''); setShowAllCourses(false); }} />}
    {visibleCourses.map(d => <Choice key={d.id} label={`${d.code} · ${d.name}`} selected={courseId === d.id} onPress={() => {
      setCourseId(d.id);
      setProfessorId(directory.length === 1 ? directory[0].id : '');
    }} />)}
    {availableCourses.length && !matches.length ? <Text style={styles.meta}>Nenhuma disciplina encontrada. Confira o código ou tente outro nome.</Text> : null}
    {!showAllCourses && matches.length > 8 ? <Button label={`Ver todas as ${matches.length} disciplinas`} variant="ghost" onPress={() => setShowAllCourses(true)} /> : null}
    {selectedCourse ? <Text style={styles.meta}>Selecionada: {selectedCourse.code} · {selectedCourse.name}</Text> : null}
    {role === 'monitor' && courseId ? <>
      <SectionTitle>Professor responsável</SectionTitle>
      {directory.length ? directory.map(professor => <Choice key={professor.id} label={professor.name || 'Professor'} selected={professorId === professor.id} onPress={() => setProfessorId(professor.id)} />) : <Card><Text style={styles.cardBody}>Não há professor com cadastro ativo disponível. O professor precisa concluir o cadastro e confirmar o e-mail. Depois, toque em Atualizar vínculos.</Text></Card>}
      {directory.length && !professorId ? <Text style={styles.meta}>Selecione o professor acima para habilitar o envio.</Text> : null}
      <Field label="Mensagem para o professor (opcional)" value={message} onChangeText={setMessage} multiline />
    </> : null}
    {role === 'monitor' && pendingRequest ? <Card><Text style={styles.cardBody}>Você já enviou uma solicitação para esta disciplina. Aguarde a análise do professor e toque em Atualizar vínculos para consultar a decisão.</Text></Card> : null}
    {availableCourses.length ? <Button label={role === 'professor' ? 'Vincular disciplina' : pendingRequest ? 'Solicitação enviada — aguarde o professor' : 'Enviar solicitação'} disabled={!selectedCourse || role === 'monitor' && (!professorId || Boolean(pendingRequest))} onPress={submit} /> : null}
    {role === 'professor' ? <>
      <SectionTitle>Minhas disciplinas</SectionTitle>
      {mine.map(link => <Card key={link.id}><Badge tone="success">Supervisão ativa</Badge><Text style={styles.cardTitle}>{state.disciplines.find(x => x.id === link.disciplineId)?.name}</Text></Card>)}
      {!mine.length ? <Text style={styles.meta}>Escolha uma disciplina acima para começar a receber solicitações de monitores.</Text> : null}
      <SectionTitle>Solicitações recebidas</SectionTitle>
      {requests.filter(x => x.status === 'pending').map(r => <RequestDecision key={r.id} request={r} state={state} execute={execute} />)}
      {!requests.some(x => x.status === 'pending') ? <Text style={styles.meta}>Nenhuma solicitação pendente.</Text> : null}
    </> : null}
    <SectionTitle>{role === 'professor' ? 'Monitores vinculados' : 'Vínculos concedidos'}</SectionTitle>
    {!state.monitorDisciplines.some(x => role === 'professor' ? x.professorId === user.id : x.monitorId === user.id) ? <Text style={styles.meta}>{role === 'professor' ? 'Os monitores aparecerão aqui após você aprovar suas solicitações.' : 'Nenhum vínculo aprovado. Solicite uma disciplina e aguarde a decisão do professor.'}</Text> : null}
    {state.monitorDisciplines.filter(x => role === 'professor' ? x.professorId === user.id : x.monitorId === user.id).map(link => <Card key={link.id}>
      <Badge tone={activeAcademicLink(link) ? 'success' : 'warning'}>{activeAcademicLink(link) ? 'Ativo' : 'Encerrado ou expirado'}</Badge>
      <Text style={styles.cardTitle}>{state.disciplines.find(x => x.id === link.disciplineId)?.name}</Text>
      <Text style={styles.cardBody}>{state.users.find(x => x.id === (role === 'professor' ? link.monitorId : link.professorId))?.name || 'Responsável'} · até {displayDeadline(link.validUntil)}</Text>
      {role === 'professor' && link.active !== false ? <Button label="Revogar vínculo" variant="delete" onPress={() => Alert.alert('Revogar vínculo', 'As monitorias futuras deste monitor nesta disciplina serão canceladas e os participantes serão avisados. Continuar?', [{
        text: 'Manter',
        style: 'cancel'
      }, {
        text: 'Revogar',
        style: 'destructive',
        onPress: () => execute('revokeMonitorLink', {
          linkId: link.id
        })
      }])} /> : null}
    </Card>)}
    <SectionTitle>Histórico das solicitações</SectionTitle>
    {!requests.length ? <Text style={styles.meta}>Ainda não há solicitações registradas para esta conta.</Text> : null}
    {requests.filter(x => role !== 'professor' || x.status !== 'pending').map(r => <Card key={r.id}>
      <Badge tone={r.status === 'approved' ? 'success' : 'warning'}>{requestStatus[r.status] || r.status}</Badge>
      <Text style={styles.cardTitle}>{state.disciplines.find(x => x.id === r.disciplineId)?.name}</Text>
      <Text style={styles.meta}>{displayDate(r.requestedAt?.slice(0, 10))}{r.validUntil ? ` · validade ${displayDeadline(r.validUntil)}` : ''}</Text>
      {r.comment ? <Text style={styles.cardBody}>{r.comment}</Text> : null}
    </Card>)}
  </Screen>;
}
