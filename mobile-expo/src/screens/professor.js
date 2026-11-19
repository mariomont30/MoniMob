import { entityRevision, latestReview } from '../domain/review.js';
import React, { useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import {
  Screen,
  SectionTitle,
  Card,
  Button,
  MenuLink,
  Kpi,
  Badge,
  Field,
  Choice,
} from '../components/ui.js';
import { RoleHero } from '../components/brand.js';
import { DateTimeField } from '../components/dateTimeField.js';
import { displayDate, displayDeadline } from '../services/presentation.js';
import { styles } from '../theme/styles.js';
import { shareCsvReport } from '../services/csvSharing.js';
import { userErrorMessage } from '../services/userErrors.js';

export function ProfessorDashboard({
  state,
  user,
  report,
  go,
  openSession,
  suspend,
  reloadData,
  openOverview,
  ...props
}) {
  const links = state.professorDisciplines.filter(
    (item) => item.professorId === user.id,
  );
  return (
    <Screen
      {...props}
      title="Área do professor"
      subtitle="Supervisão acadêmica"
    >
      <Button
        label="Atualizar atividades"
        variant="outline"
        onPress={reloadData}
      />
      <RoleHero
        title="Acompanhe o aprendizado"
        onPress={() => openOverview('pending')}
        description="Valide propostas e acompanhe os resultados das suas disciplinas."
      />
      <View style={styles.kpiRow}>
        <Kpi
          label="Disciplinas"
          value={report.disciplines}
          onPress={() => openOverview('disciplines')}
        />
        <Kpi
          label="Sessões concluídas"
          value={report.sessions}
          onPress={() => openOverview('completed')}
        />
        <Kpi
          label="Pendências"
          value={report.pending}
          onPress={() => openOverview('pending')}
        />
      </View>
      <SectionTitle>Ferramentas</SectionTitle>
      <MenuLink
        title="Disciplinas e monitores"
        subtitle="Vincule disciplinas e analise solicitações de monitores"
        onPress={() => go('academicLinks')}
      />
      <MenuLink
        title="Materiais"
        subtitle="Publique arquivos e exclua conteúdos das suas disciplinas"
        onPress={() => go('manageMaterials')}
      />
      <MenuLink
        title="Validações acadêmicas"
        subtitle="Revisar monitorias e materiais enviados"
        onPress={() => go('approvals')}
      />
      <MenuLink
        title="Relatórios"
        subtitle="Acompanhar presença e atividade por disciplina"
        onPress={() => go('reports')}
      />
      <SectionTitle>Monitorias publicadas</SectionTitle>
      {state.sessions
        .filter(
          (item) =>
            item.professorId === user.id &&
            item.status === 'approved' &&
            !item.archived,
        )
        .map((item) => (
          <Card key={item.id} onPress={() => openSession(item)}>
            <Text style={styles.cardTitle}>{item.topic}</Text>
            <Text style={styles.meta}>
              {displayDate(item.date)} · {item.time} · {item.location}
            </Text>
            <Badge tone={item.authorizationInvalid ? 'warning' : 'success'}>
              {item.authorizationInvalid
                ? 'Fora do período autorizado'
                : 'Disponível para alunos'}
            </Badge>
            <Button
              label="Ver detalhes da monitoria"
              variant="outline"
              onPress={() => openSession(item)}
            />
            {Date.parse(item.date + 'T' + item.time + ':00-03:00') >
            Date.now() ? (
              <Button
                label="Suspender monitoria"
                variant="delete"
                onPress={() => suspend(item)}
              />
            ) : null}
          </Card>
        ))}
      <SectionTitle>Disciplinas vinculadas</SectionTitle>
      {links.length ? (
        links.map((link) => {
          const discipline = state.disciplines.find(
            (item) => item.id === link.disciplineId,
          );
          const monitors = state.monitorDisciplines.filter(
            (item) => item.disciplineId === link.disciplineId,
          );
          return (
            <Card
              key={link.id || link.disciplineId}
              onPress={() => go('academicLinks')}
            >
              <Text style={styles.cardTitle}>
                {discipline?.code} · {discipline?.name}
              </Text>
              {monitors.length ? (
                monitors.map((item) => (
                  <Text key={item.id || item.monitorId} style={styles.cardBody}>
                    {
                      state.users.find(
                        (profile) => profile.id === item.monitorId,
                      )?.name
                    }{' '}
                    · vínculo até {displayDeadline(item.validUntil)}
                  </Text>
                ))
              ) : (
                <Text style={styles.meta}>
                  Nenhum monitor com vínculo vigente.
                </Text>
              )}
              <Button
                label="Gerenciar disciplina e vínculos"
                variant="outline"
                onPress={() => go('academicLinks')}
              />
            </Card>
          );
        })
      ) : (
        <Card>
          <Text style={styles.cardBody}>
            Nenhuma disciplina vinculada à sua conta.
          </Text>
        </Card>
      )}
    </Screen>
  );
}

function ApprovalItem({ item, state, decide, openMaterial }) {
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const committing = useRef(false);
  const waiting = item.status === 'adjustments_requested';
  const prior = latestReview(state, item.entityType, item.id);
  const confirm = (decision, label) => {
    if (lock.current) return;
    if (decision === 'adjustments_requested' && !comment.trim()) {
      setError('Descreva o que o monitor deve corrigir.');
      return;
    }
    if (comment.trim().length > 1000) {
      setError('Use uma observação de até 1000 caracteres.');
      return;
    }
    lock.current = true;
    setBusy(true);
    setError('');
    const release = () => {
      lock.current = false;
      committing.current = false;
      setBusy(false);
    };
    Alert.alert(
      label,
      'Confirma a decisão para “' +
        item.label +
        '”, revisão ' +
        entityRevision(item) +
        '?',
      [
        { text: 'Voltar', style: 'cancel', onPress: release },
        {
          text: 'Confirmar',
          onPress: async () => {
            if (committing.current) return;
            committing.current = true;
            try {
              const result = await decide(
                item.entityType,
                item.id,
                decision,
                comment.trim(),
                entityRevision(item),
              );
              if (result) setComment('');
              else
                setError(
                  'Não foi possível concluir a decisão. Atualize a lista e tente novamente.',
                );
            } catch (e) {
              setError(userErrorMessage(e));
            } finally {
              release();
            }
          },
        },
      ],
      {
        cancelable: true,
        onDismiss: () => {
          if (!committing.current) release();
        },
      },
    );
  };
  return (
    <Card>
      <View style={styles.rowBetween}>
        <Badge>
          {item.entityType === 'session' ? 'Monitoria' : 'Material'}
        </Badge>
        <Badge tone="warning">
          {waiting
            ? 'Aguardando correção do monitor'
            : item.status === 'approved'
              ? 'Publicada — revisão disponível'
              : 'Aguardando sua análise'}
        </Badge>
      </View>
      <Text style={styles.cardTitle}>{item.label}</Text>
      <Text style={styles.cardBody}>
        {state.disciplines.find((d) => d.id === item.disciplineId)?.name}
      </Text>
      <Text style={styles.meta}>
        Revisão {entityRevision(item)}
        {item.fileName ? ' · ' + item.fileName : ''}
      </Text>
      {prior?.comment ? (
        <Text style={styles.cardBody}>Última observação: {prior.comment}</Text>
      ) : null}
      {item.authorizationInvalid ? (
        <Text style={styles.cardBody}>
          A monitoria está fora do prazo autorizado. Solicite a correção. A
          aprovação ficará bloqueada até o ajuste.
        </Text>
      ) : null}
      {item.entityType === 'material' ? (
        <Button
          label="Abrir material para análise"
          variant="outline"
          onPress={() => openMaterial(item)}
        />
      ) : (
        <Text style={styles.meta}>
          {displayDate(item.date)} · {item.time} · {item.durationMinutes} min
        </Text>
      )}
      {waiting ? (
        <Text style={styles.cardBody}>
          O monitor precisa corrigir e reenviar este item. Ele voltará à lista
          Para analisar após o reenvio.
        </Text>
      ) : (
        <>
          <Field
            label={'Observação para a decisão — ' + item.label}
            value={comment}
            onChangeText={(value) => {
              setComment(value);
              setError('');
            }}
            placeholder="Explique os ajustes necessários"
            maxLength={1000}
            editable={!busy}
            multiline
          />
          {error ? (
            <Text
              accessibilityRole="alert"
              style={[styles.meta, { color: '#B42318' }]}
            >
              {error}
            </Text>
          ) : null}
          <View style={styles.actionWrap}>
            <Button
              compact
              variant="outline"
              disabled={busy}
              label="Solicitar ajustes"
              onPress={() =>
                confirm('adjustments_requested', 'Solicitar ajustes')
              }
            />
            <Button
              compact
              variant="danger"
              disabled={busy}
              label="Rejeitar"
              onPress={() => confirm('rejected', 'Rejeitar item')}
            />
            <Button
              compact
              disabled={busy || Boolean(item.authorizationInvalid)}
              label="Aprovar"
              onPress={() => confirm('approved', 'Aprovar item')}
            />
          </View>
        </>
      )}
    </Card>
  );
}

export function Approvals({
  state,
  user,
  decide,
  openMaterial,
  reloadData,
  ...props
}) {
  const [filter, setFilter] = useState('pending');
  const all = [
    ...state.sessions
      .filter(
        (item) =>
          item.professorId === user.id &&
          !item.archived &&
          (['pending', 'adjustments_requested'].includes(item.status) ||
            (item.status === 'approved' &&
              (item.reviewPending || item.authorizationInvalid))),
      )
      .map((item) => ({ ...item, entityType: 'session', label: item.topic })),
    ...state.materials
      .filter(
        (item) =>
          item.professorId === user.id &&
          !item.archived &&
          ['pending', 'adjustments_requested'].includes(item.status),
      )
      .map((item) => ({ ...item, entityType: 'material', label: item.title })),
  ];
  const items = all.filter((item) =>
    filter === 'adjustments'
      ? item.status === 'adjustments_requested'
      : item.status !== 'adjustments_requested',
  );
  return (
    <Screen
      {...props}
      title="Validações acadêmicas"
      subtitle="Acompanhe a análise e os ajustes solicitados"
    >
      <Button
        label="Atualizar pendências"
        variant="outline"
        onPress={reloadData}
      />
      <View style={styles.choiceRow}>
        <Choice
          label="Para analisar"
          selected={filter === 'pending'}
          onPress={() => setFilter('pending')}
        />
        <Choice
          label="Aguardando o monitor"
          selected={filter === 'adjustments'}
          onPress={() => setFilter('adjustments')}
        />
      </View>
      {!items.length ? (
        <Card>
          <Text style={styles.cardTitle}>
            {filter === 'pending'
              ? 'Sem pendências'
              : 'Nenhum ajuste aguardando o monitor'}
          </Text>
          <Text style={styles.cardBody}>
            Atualize a lista para consultar os reenvios e as decisões mais
            recentes.
          </Text>
        </Card>
      ) : null}
      {items.map((item) => (
        <ApprovalItem
          key={item.entityType + '-' + item.id + '-' + entityRevision(item)}
          item={item}
          state={state}
          decide={decide}
          openMaterial={openMaterial}
        />
      ))}
    </Screen>
  );
}

export function Reports({ state, user, domain, ...props }) {
  const [filters, setFilters] = useState({
    disciplineId: '',
    startDate: '',
    endDate: '',
  });
  const [exporting, setExporting] = useState(false);
  const exportLock = useRef(false);
  const report = domain.reportForProfessor(user.id, filters);
  const disciplines = state.professorDisciplines
    .filter((x) => x.professorId === user.id)
    .map((x) => state.disciplines.find((d) => d.id === x.disciplineId))
    .filter(Boolean);
  const exportCsv = async () => {
    if (exportLock.current) return;
    exportLock.current = true;
    setExporting(true);
    try {
      await shareCsvReport(domain.exportReportCsv(user.id, filters));
    } catch (error) {
      Alert.alert('Exportar relatório', userErrorMessage(error));
    } finally {
      exportLock.current = false;
      setExporting(false);
    }
  };
  return (
    <Screen
      {...props}
      title="Relatórios acadêmicos"
      subtitle="Filtros e exportação CSV"
    >
      <SectionTitle>Período</SectionTitle>
      <DateTimeField
        label="Data inicial"
        futureOnly={false}
        value={filters.startDate}
        onChange={(startDate) => {
          if (startDate && filters.endDate && startDate > filters.endDate)
            return Alert.alert(
              'Datas',
              'A data inicial deve ser anterior ou igual à final.',
            );
          setFilters((previous) => ({ ...previous, startDate }));
        }}
      />
      <DateTimeField
        label="Data final"
        futureOnly={false}
        value={filters.endDate}
        onChange={(endDate) => {
          if (endDate && filters.startDate && endDate < filters.startDate)
            return Alert.alert(
              'Datas',
              'A data final deve ser posterior ou igual à inicial.',
            );
          setFilters((previous) => ({ ...previous, endDate }));
        }}
      />
      <SectionTitle>Disciplina</SectionTitle>
      <Choice
        label="Todas"
        selected={!filters.disciplineId}
        onPress={() =>
          setFilters((previous) => ({ ...previous, disciplineId: '' }))
        }
      />
      {disciplines.map((item) => (
        <Choice
          key={item.id}
          label={`${item.code} · ${item.name}`}
          selected={filters.disciplineId === item.id}
          onPress={() =>
            setFilters((previous) => ({ ...previous, disciplineId: item.id }))
          }
        />
      ))}
      <View style={styles.kpiRow}>
        <Kpi label="Presença" value={`${report.attendanceRate}%`} />
        <Kpi label="Reservas" value={report.reservations} />
        <Kpi label="Sessões" value={report.sessions} />
      </View>
      <Text style={styles.caption}>
        Presença, reservas e sessões acima consideram encontros concluídos no período,
        incluindo os arquivados. Os indicadores abaixo também incluem encontros futuros publicados.
      </Text>
      <View style={styles.kpiRow}>
        <Kpi label="Demanda" value={report.demand} />
        <Kpi label="Em espera" value={report.waiting} />
        <Kpi label="Ocupação" value={`${report.occupancyRate}%`} />
      </View>
      <Text style={styles.caption}>
        Demanda: pessoas com reserva confirmada ou em espera por encontro.
        Ocupação: {report.bookedPlaces} reserva(s) para {report.capacity} vaga(s)
        em {report.scheduledSessions} monitoria(s) publicada(s) no período.
      </Text>
      <Button
        label={exporting ? 'Preparando CSV…' : 'Exportar relatório CSV'}
        disabled={exporting}
        onPress={exportCsv}
      />
      <View style={styles.kpiRow}>
        <Kpi label="Materiais" value={report.materialsCount} />
        <Kpi label="Exclusões" value={report.deletedMaterials} />
        <Kpi label="Solicitações" value={report.linkRequests} />
      </View>
      <Text style={styles.caption}>
        O CSV inclui o resumo, o histórico dos vínculos, monitorias, reservas,
        presença, materiais e exclusões no período selecionado.
      </Text>
      <SectionTitle>Desempenho por disciplina</SectionTitle>
      {report.rows.map((item) => (
        <Card key={item.disciplineId}>
          <Text style={styles.cardTitle}>
            {item.code} · {item.name}
          </Text>
          <Text style={styles.cardBody}>
            {item.sessions} sessão(ões) · {item.reservations} reserva(s) ·{' '}
            {item.attendanceRate}% de presença
          </Text>
          <Text style={styles.meta}>
            Demanda: {item.demand} · Em espera: {item.waiting} · Ocupação: {item.occupancyRate}%
          </Text>
          <View style={styles.progress}>
            <View
              style={[
                styles.progressFill,
                { width: `${item.attendanceRate}%` },
              ]}
            />
          </View>
        </Card>
      ))}
      <SectionTitle>Atividades acadêmicas</SectionTitle>
      {(report.activityRows || []).slice(0, 50).map((item) => (
        <Card key={item.id}>
          <Badge>{item.actionLabel}</Badge>
          <Text style={styles.cardTitle}>{item.label}</Text>
          <Text style={styles.meta}>
            {item.responsible} ·{' '}
            {new Date(item.createdAt).toLocaleString('pt-BR', {
              timeZone: 'America/Fortaleza',
            })}
          </Text>
          {item.fileName ? (
            <Text style={styles.meta}>{item.fileName}</Text>
          ) : null}
        </Card>
      ))}
      {report.activityRows?.length > 50 ? (
        <Text style={styles.caption}>
          A tela mostra as 50 atividades mais recentes; o CSV contém todas as
          atividades deste filtro.
        </Text>
      ) : null}
    </Screen>
  );
}
