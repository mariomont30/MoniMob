import {
  entityRevision,
  latestReview,
  monitorAdjustments,
} from '../domain/review.js';
import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import {
  Screen,
  SectionTitle,
  Card,
  Button,
  MenuLink,
  Kpi,
  Badge,
  Choice,
  Field,
} from '../components/ui.js';
import { styles } from '../theme/styles.js';
import { RoleHero } from '../components/brand.js';
import { displayDate } from '../services/presentation.js';
import { DateTimeField } from '../components/dateTimeField.js';
import { sessionAuthorizationIssue } from '../domain/sessionAuthorization.js';
import { projectDateTime, validateFuture } from '../services/formValidation.js';
import { activeAcademicLink } from '../domain/workflow.js';
import { statusLabel } from '../constants.js';

export function MonitorDashboard({
  state,
  user,
  go,
  create,
  openOverview,
  ...props
}) {
  const sessions = state.sessions.filter(
    (item) => item.monitorId === user.id && !item.archived,
  );
  const participants = state.reservations.filter(
    (item) =>
      sessions.some((session) => session.id === item.sessionId) &&
      item.status === 'confirmed',
  ).length;
  return (
    <Screen
      {...props}
      title="Área do monitor"
      subtitle={`Olá, ${user.name.split(' ')[0]}`}
    >
      <RoleHero
        title="Compartilhe conhecimento"
        onPress={() => go('adjustments')}
        description="Organize suas sessões e acompanhe quem está aprendendo com você."
        metric={`${monitorAdjustments(state, user.id).length} item(ns) aguardando ajustes`}
      />
      <View style={styles.kpiRow}>
        <Kpi
          label="Monitorias"
          value={sessions.length}
          onPress={() => go('manageSessions')}
        />
        <Kpi
          label="Alunos reservados"
          value={participants}
          onPress={() => openOverview('participants')}
        />
      </View>
      <MenuLink
        title="Ajustes solicitados"
        subtitle="Consulte as orientações do professor e reenvie as correções"
        onPress={() => go('adjustments')}
      />
      <MenuLink
        title="Disciplinas e vínculos"
        subtitle="Solicite o vínculo ao professor e acompanhe a decisão"
        onPress={() => go('academicLinks')}
      />
      <MenuLink
        title="Materiais"
        subtitle="Envie arquivos ou links para o professor validar"
        onPress={() => go('manageMaterials')}
      />
      <Button label="Cadastrar nova monitoria" onPress={create} />
      <MenuLink
        title="Minhas monitorias"
        subtitle="Editar sessões e acompanhar publicações"
        onPress={() => go('manageSessions')}
      />
    </Screen>
  );
}

export function ManageSessions({
  state,
  user,
  openSession,
  create,
  edit,
  archive,
  ...props
}) {
  const sessions = state.sessions.filter(
    (item) => item.monitorId === user.id && !item.archived,
  );
  return (
    <Screen
      {...props}
      title="Gerenciar monitorias"
      subtitle="Organize seus encontros e acompanhe as publicações"
    >
      <Button label="Cadastrar monitoria" onPress={create} />
      {sessions.map((session) => {
        const discipline = state.disciplines.find(
          (item) => item.id === session.disciplineId,
        );
        const feedback = latestReview(state, 'session', session.id);
        return (
          <Card key={session.id}>
            <View style={styles.rowBetween}>
              <Badge>{discipline?.code}</Badge>
              <Badge
                tone={
                  session.status === 'approved'
                    ? 'success'
                    : session.status === 'rejected'
                      ? 'error'
                      : 'warning'
                }
              >
                {statusLabel(session.status)}
              </Badge>
            </View>
            <Text style={styles.cardTitle}>{discipline?.name}</Text>
            <Text style={styles.cardBody}>{session.topic}</Text>
            {session.status === 'adjustments_requested' ? (
              <Text style={styles.cardBody}>
                Ajuste solicitado:{' '}
                {feedback?.comment ||
                  'Abra Ajustes solicitados para conferir a orientação.'}
              </Text>
            ) : null}
            {session.status === 'pending' ? (
              <Text style={styles.cardBody}>
                Correção reenviada. Aguarde a nova aprovação do professor.
              </Text>
            ) : null}
            {session.authorizationInvalid ? (
              <Text style={styles.meta}>
                Fora do período autorizado. Edite a data, o horário ou a duração
                antes de publicar novamente.
              </Text>
            ) : null}
            <Text style={styles.meta}>
              {displayDate(session.date)} · {session.time}
            </Text>
            <View style={styles.actionWrap}>
              <Button
                compact
                variant="outline"
                label="Detalhes"
                onPress={() => openSession(session)}
              />
              <Button
                compact
                variant="outline"
                label={
                  session.status === 'adjustments_requested'
                    ? 'Corrigir e reenviar'
                    : 'Editar'
                }
                onPress={() => edit(session)}
              />
              <Button
                compact
                variant="danger"
                label="Arquivar"
                onPress={() => archive(session)}
              />
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}

export function CreateSession({
  state,
  user,
  editingSession,
  save,
  goLinks,
  reloadData,
  ...props
}) {
  const links = state.monitorDisciplines.filter(
    (item) => item.monitorId === user.id && activeAcademicLink(item),
  );
  const [form, setForm] = useState({
    id: editingSession?.id,
    expectedRevision: editingSession
      ? entityRevision(editingSession)
      : undefined,
    disciplineId: editingSession?.disciplineId || links[0]?.disciplineId || '',
    topic: editingSession?.topic || '',
    description: editingSession?.description || '',
    date: editingSession?.date || '',
    time: editingSession?.time || '',
    durationMinutes: editingSession
      ? String(editingSession.durationMinutes || 60)
      : '',
    modality: editingSession?.modality || 'Presencial',
    location: editingSession?.location || '',
    capacity: editingSession ? String(editingSession.capacity || 10) : '',
    monitoringUrl: editingSession?.monitoringUrl || '',
    linkValidUntil: editingSession?.linkValidUntil || '',
  });
  const needsApproval = Boolean(
    editingSession &&
    (editingSession.approvalRequired ||
      ['adjustments_requested', 'pending', 'rejected'].includes(
        editingSession.status,
      )),
  );
  const feedback = editingSession
    ? latestReview(state, 'session', editingSession.id)
    : null;
  const selectedAuthorization = links.find(
    (x) => x.disciplineId === form.disciplineId,
  );
  const limit = selectedAuthorization?.validUntil
    ? projectDateTime(new Date(selectedAuthorization.validUntil))
    : null;
  const set = (key) => (value) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  if (!links.length)
    return (
      <Screen
        {...props}
        title="Cadastrar monitoria"
        subtitle="Primeiro, vincule-se a uma disciplina"
      >
        <Card>
          <Text style={styles.cardTitle}>Vínculo aprovado necessário</Text>
          <Text style={styles.cardBody}>
            Abra Meus vínculos, escolha a disciplina e o professor e envie a
            solicitação. Após a aprovação, atualize sua autorização para
            cadastrar e publicar a monitoria para os alunos.
          </Text>
          <Button label="Solicitar vínculo" onPress={goLinks} />
          <Button
            label="Atualizar autorização"
            variant="outline"
            onPress={reloadData}
          />
        </Card>
      </Screen>
    );
  return (
    <Screen
      {...props}
      title={editingSession ? 'Editar monitoria' : 'Cadastrar monitoria'}
      subtitle={
        needsApproval
          ? 'Correção sujeita à nova aprovação do professor'
          : 'Disponível aos alunos após salvar'
      }
    >
      {needsApproval ? (
        <Card>
          <Text style={styles.cardTitle}>Corrigir monitoria</Text>
          <Text style={styles.cardBody}>
            {feedback?.comment || 'Revise os dados solicitados pelo professor.'}
          </Text>
          <Text style={styles.meta}>
            Após o reenvio, aguarde a aprovação antes da liberação aos alunos.
          </Text>
        </Card>
      ) : null}
      <SectionTitle>Disciplina vinculada</SectionTitle>
      {limit ? (
        <Card>
          <Text style={styles.cardBody}>
            Autorizado até {displayDate(limit.date)} às {limit.time} (Brasília).
            A monitoria deve começar e terminar até esse limite.
          </Text>
        </Card>
      ) : null}
      {!links.length ? (
        <Card>
          <Text style={styles.cardBody}>
            Solicite nesta aplicação o vínculo com uma disciplina. Após a
            aprovação do professor, suas monitorias são publicadas ao salvar.
          </Text>
          <Button label="Solicitar vínculo" onPress={goLinks} />
        </Card>
      ) : null}
      {links.map((link) => {
        const d = state.disciplines.find(
          (item) => item.id === link.disciplineId,
        );
        return (
          <Choice
            key={link.disciplineId}
            label={`${d?.code} · ${d?.name}`}
            selected={form.disciplineId === link.disciplineId}
            onPress={() => set('disciplineId')(link.disciplineId)}
          />
        );
      })}
      <Field
        label="Conteúdo"
        value={form.description}
        onChangeText={set('description')}
        multiline
      />
      <Field label="Assunto" value={form.topic} onChangeText={set('topic')} />
      <DateTimeField
        label="Data da monitoria"
        value={form.date}
        maximumDate={limit?.date}
        onChange={set('date')}
      />
      <DateTimeField
        label="Horário de Brasília (24 horas)"
        date={form.date}
        value={form.time}
        onChange={set('time')}
        mode="time"
      />
      <Field
        label="Duração em minutos"
        placeholder="Ex.: 60"
        value={form.durationMinutes}
        onChangeText={set('durationMinutes')}
        keyboardType="number-pad"
      />
      <View style={styles.choiceRow}>
        {['Presencial', 'Online'].map((item) => (
          <Choice
            key={item}
            label={item}
            selected={form.modality === item}
            onPress={() => set('modality')(item)}
          />
        ))}
      </View>
      <Field
        label={
          form.modality === 'Online'
            ? 'Local (opcional)'
            : 'Local (obrigatório)'
        }
        value={form.location}
        onChangeText={set('location')}
      />
      <Field
        label={
          form.modality === 'Online'
            ? 'Link da monitoria (obrigatório)'
            : 'Link da monitoria (opcional)'
        }
        value={form.monitoringUrl}
        onChangeText={set('monitoringUrl')}
      />
      <DateTimeField
        label="Validade do link — data (opcional)"
        value={form.linkValidUntil.slice(0, 10)}
        onChange={(value) =>
          set('linkValidUntil')(
            value +
              'T' +
              (form.linkValidUntil.slice(11, 16) || '23:59') +
              ':00-03:00',
          )
        }
      />
      <DateTimeField
        label="Validade do link — horário"
        mode="time"
        date={form.linkValidUntil.slice(0, 10) || form.date}
        value={form.linkValidUntil.slice(11, 16)}
        onChange={(value) =>
          set('linkValidUntil')(
            (form.linkValidUntil.slice(0, 10) || form.date) +
              'T' +
              value +
              ':00-03:00',
          )
        }
      />
      {form.linkValidUntil ? (
        <Button
          label="Remover validade do link"
          variant="ghost"
          onPress={() => set('linkValidUntil')('')}
        />
      ) : null}
      <Field
        label="Vagas"
        placeholder="Ex.: 10"
        value={form.capacity}
        onChangeText={set('capacity')}
        keyboardType="number-pad"
      />
      <Button
        label={
          needsApproval
            ? 'Reenviar para aprovação'
            : 'Salvar e publicar monitoria'
        }
        disabled={!links.length}
        onPress={() => {
          try {
            validateFuture(form.date, form.time);
            const issue = sessionAuthorizationIssue(
              {
                ...form,
                monitorId: user.id,
                professorId: selectedAuthorization?.professorId,
                durationMinutes: Number(form.durationMinutes || 60),
              },
              selectedAuthorization,
            );
            if (issue) throw new Error(issue);
            return save(form);
          } catch (error) {
            Alert.alert('Monitoria', error.message);
          }
        }}
      />
    </Screen>
  );
}

export function Participants({
  state,
  user,
  domain,
  execute,
  preferredSessionId,
  ...props
}) {
  const sessions = state.sessions.filter(
    (item) =>
      item.monitorId === user.id &&
      !item.archived &&
      item.status === 'approved',
  );
  const [sessionId, setSessionId] = useState(
    preferredSessionId || sessions[0]?.id || '',
  );
  const [latest, setLatest] = useState(null);
  const reservations = state.reservations.filter(
    (item) => item.sessionId === sessionId && item.status === 'confirmed',
  );
  const canGenerate = sessionId
    ? domain.canGenerateAttendanceCode(sessionId)
    : false;
  const canSetAttendance = sessionId
    ? domain.canSetAttendance(sessionId)
    : false;
  const confirmAttendance = (studentId, status) =>
    Alert.alert(
      'Alterar presença',
      'Confirma a alteração deste participante?',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: () =>
            execute('setAttendance', { sessionId, studentId, status }),
        },
      ],
    );
  const generate = async () => {
    const code = await execute('generateAttendanceCode', {
      actorId: user.id,
      sessionId,
    });
    if (code) setLatest(code);
  };
  return (
    <Screen
      {...props}
      title="Participantes e presença"
      subtitle="Acompanhe os participantes de cada encontro"
    >
      <SectionTitle>Sessão aprovada</SectionTitle>
      {sessions.map((item) => {
        const d = state.disciplines.find((x) => x.id === item.disciplineId);
        return (
          <Choice
            key={item.id}
            label={`${d?.name} · ${displayDate(item.date)} ${item.time}`}
            selected={sessionId === item.id}
            onPress={() => {
              setSessionId(item.id);
              setLatest(null);
            }}
          />
        );
      })}
      {!sessions.length ? (
        <Card>
          <Text style={styles.cardBody}>
            Não há monitorias aprovadas para gerenciar presença.
          </Text>
        </Card>
      ) : null}
      <View style={styles.kpiRow}>
        <Kpi label="Reservas" value={reservations.length} />
        <Kpi
          label="Presentes"
          value={
            state.attendance.filter(
              (item) =>
                item.sessionId === sessionId && item.status === 'present',
            ).length
          }
        />
      </View>
      <Button
        label="Gerar novo código"
        disabled={!sessionId || !canGenerate}
        onPress={generate}
      />
      {sessionId && !canGenerate ? (
        <Text style={styles.caption}>
          O código fica disponível 15 minutos antes do início até 30 minutos
          após o término.
        </Text>
      ) : null}
      {latest ? (
        <Card accent>
          <Text style={styles.label}>Código temporário de presença</Text>
          <Text
            style={styles.code}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.4}
          >
            {latest.code}
          </Text>
          <Text style={styles.caption}>
            Expira em {new Date(latest.expiresAt).toLocaleTimeString('pt-BR')}
          </Text>
        </Card>
      ) : null}
      <SectionTitle>Lista de participantes</SectionTitle>
      {reservations.length ? (
        reservations.map((item) => {
          const student = state.users.find((x) => x.id === item.studentId);
          const attendance = state.attendance.find(
            (x) => x.sessionId === sessionId && x.studentId === item.studentId,
          );
          return (
            <Card key={item.id}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>{student?.name}</Text>
                <Badge
                  tone={
                    attendance?.status === 'present'
                      ? 'success'
                      : attendance?.status === 'absent'
                        ? 'error'
                        : 'warning'
                  }
                >
                  {attendance?.status === 'present'
                    ? 'Presente'
                    : attendance?.status === 'absent'
                      ? 'Ausente'
                      : 'Pendente'}
                </Badge>
              </View>
              <View style={styles.buttonRow}>
                <Button
                  compact
                  label="Presente"
                  disabled={!canSetAttendance}
                  onPress={() => confirmAttendance(item.studentId, 'present')}
                />
                <Button
                  compact
                  variant="danger"
                  label="Ausente"
                  disabled={!canSetAttendance}
                  onPress={() => confirmAttendance(item.studentId, 'absent')}
                />
              </View>
            </Card>
          );
        })
      ) : (
        <Card>
          <Text style={styles.cardBody}>
            Nenhum participante reservado nesta sessão.
          </Text>
        </Card>
      )}
    </Screen>
  );
}
