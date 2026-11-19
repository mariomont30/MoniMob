import { favoriteItems } from '../domain/favorites.js';
import { MaterialLibrary } from './materialLibrary.js';
import React, { useRef, useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import {
  Screen,
  SectionTitle,
  SessionCard,
  Card,
  Button,
  Choice,
  Badge,
  Field,
  Kpi,
  MenuLink,
  Info,
} from '../components/ui.js';
import { DateTimeField } from '../components/dateTimeField.js';
import { styles } from '../theme/styles.js';
import { userErrorMessage } from '../services/userErrors.js';
import { Icon, RoleHero } from '../components/brand.js';
import { displayDate } from '../services/presentation.js';
import { CardsGrid } from '../components/ui.js';
import { createSessionFilters } from '../constants.js';
import { nextStudentAppointment } from '../domain/studentSummary.js';
import { canReadMaterial, publishedMaterial } from '../domain/materialAccess.js';

export function StudentHome({ state, user, recommendations = [], go, openSession, reloadData, openOverview, ...props }) {
  const now = Date.now();
  const appointment = nextStudentAppointment(state, user.id, now);
  const next = state.sessions
    .filter(
      (item) =>
        item.status === 'approved' && !item.authorizationInvalid &&
        !item.archived &&
        new Date(`${item.date}T${item.time}:00-03:00`).getTime() > now,
    )
    .sort(
      (a, b) =>
        new Date(`${a.date}T${a.time}:00-03:00`).getTime() -
        new Date(`${b.date}T${b.time}:00-03:00`).getTime(),
    )
    .slice(0, 2);

  return (
    <Screen {...props} title="Início" subtitle={`Olá, ${user.name.split(' ')[0]}`}>
      <Button label="Atualizar monitorias" variant="outline" onPress={reloadData} />
      <RoleHero
        title="Seu próximo passo começa aqui"
        onPress={()=>openOverview('reservations')}
        description="Encontre apoio nas disciplinas e organize seus encontros."
        metric={`${state.reservations.filter((item) => item.studentId === user.id && item.status === 'confirmed').length} reserva(s) na sua agenda`}
      />
      <SectionTitle action="Ver agenda" onAction={() => go('agenda')}>
        Seu próximo compromisso
      </SectionTitle>
      {appointment ? (
        <View>
          <SessionCard session={appointment} state={state} onDetails={openSession} />
          {appointment.status !== 'approved' || appointment.authorizationInvalid ? (
            <Text style={styles.caption}>
              Sua reserva está preservada, mas a monitoria aguarda regularização.
              Consulte os detalhes antes de comparecer.
            </Text>
          ) : null}
        </View>
      ) : (
        <Card><Text style={styles.cardBody}>Você ainda não tem uma reserva próxima.</Text></Card>
      )}
      <MenuLink title="Meus favoritos" subtitle={favoriteItems(state, user.id).length + ' monitoria(s) salva(s) na sua conta'} onPress={() => go('favorites')} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Buscar monitorias"
        style={styles.search}
        onPress={() => go('catalog')}
      >
        <Icon name="search" color="#004AF7" />
        <Text style={styles.searchText}>Buscar uma disciplina ou assunto</Text>
      </Pressable>
      <SectionTitle action="Ver todas" onAction={() => go('catalog')}>
        Próximas monitorias
      </SectionTitle>
      {!next.length ? (
        <Card>
          <Text style={styles.cardBody}>Nenhuma monitoria próxima por enquanto.</Text>
          <Button label="Explorar monitorias" variant="ghost" onPress={() => go('catalog')} />
        </Card>
      ) : (
        <CardsGrid>
          {next.map((session) => (
            <SessionCard key={session.id} session={session} state={state} onDetails={openSession} />
          ))}
        </CardsGrid>
      )}
      <SectionTitle>Recomendadas para você</SectionTitle>
      {recommendations.length ? (
        <CardsGrid>
          {recommendations.map((session) => (
            <SessionCard
              key={`rec-${session.id}`}
              session={session}
              state={state}
              onDetails={openSession}
            />
          ))}
        </CardsGrid>
      ) : (
        <Card>
          <Text style={styles.cardBody}>
            As recomendações aparecerão quando houver monitorias disponíveis para suas disciplinas.
          </Text>
        </Card>
      )}
    </Screen>
  );
}

export function Catalog({
  state,
  sessions,
  filters,
  setFilters,
  go,
  openSession,
  reloadData,
  ...props
}) {
  const chooseModality = (value) => setFilters((previous) => ({ ...previous, modality: value }));
  return (
    <Screen {...props} title="Buscar monitorias" subtitle={`${sessions.length} resultado(s)`}>
      <Button label="Atualizar monitorias" variant="outline" onPress={reloadData} />
      <Field
        label="Pesquisa"
        value={filters.query}
        onChangeText={(query) => setFilters((previous) => ({ ...previous, query }))}
        placeholder="Disciplina, assunto, professor ou monitor"
      />
      <Button label="Filtros avançados" variant="outline" onPress={() => go('filters')} />
      <View style={styles.choiceRow}>
        <Choice label="Todas" selected={!filters.modality} onPress={() => chooseModality('')} />
        <Choice
          label="Presencial"
          selected={filters.modality === 'Presencial'}
          onPress={() => chooseModality('Presencial')}
        />
        <Choice
          label="Online"
          selected={filters.modality === 'Online'}
          onPress={() => chooseModality('Online')}
        />
      </View>
      <Choice
        label="Somente com vagas"
        selected={filters.availableOnly}
        onPress={() =>
          setFilters((previous) => ({ ...previous, availableOnly: !previous.availableOnly }))
        }
      />
      {sessions.length ? (
        <CardsGrid>
          {sessions.map((session) => (
            <SessionCard key={session.id} session={session} state={state} onDetails={openSession} />
          ))}
        </CardsGrid>
      ) : (
        <Card>
          <Text style={styles.cardTitle}>Nenhuma monitoria encontrada</Text>
          <Text style={styles.cardBody}>Tente outro termo ou remova os filtros.</Text>
        </Card>
      )}
    </Screen>
  );
}

export function Filters({ state, filters, setFilters, apply, ...props }) {
  const set = (key, value) =>
    setFilters((previous) => ({ ...previous, [key]: previous[key] === value ? '' : value }));
  const professors = state.users.filter((item) => item.roles?.includes('professor'));
  const monitors = state.users.filter((item) => item.roles?.includes('monitor'));
  return (
    <Screen {...props} title="Filtros" subtitle="Refine sua busca">
      <SectionTitle>Semestre</SectionTitle>
      <View style={styles.choiceRow}>
        {[1, 2, 3, 4, 5, 6, 7, 8].map((item) => (
          <Choice
            key={item}
            label={`${item}º semestre`}
            selected={filters.semester === item}
            onPress={() => set('semester', item)}
          />
        ))}
      </View>
      <SectionTitle>Disciplina</SectionTitle>
      {state.disciplines.map((item) => (
        <Choice
          key={item.id}
          label={`${item.code} · ${item.name}`}
          selected={filters.disciplineId === item.id}
          onPress={() => set('disciplineId', item.id)}
        />
      ))}
      <SectionTitle>Professor</SectionTitle>
      {professors.map((item) => (
        <Choice
          key={item.id}
          label={item.name}
          selected={filters.professorId === item.id}
          onPress={() => set('professorId', item.id)}
        />
      ))}
      <SectionTitle>Monitor</SectionTitle>
      {monitors.map((item) => (
        <Choice
          key={item.id}
          label={item.name}
          selected={filters.monitorId === item.id}
          onPress={() => set('monitorId', item.id)}
        />
      ))}
      <SectionTitle>Modalidade</SectionTitle>
      <View style={styles.choiceRow}>
        {['Presencial', 'Online'].map((item) => (
          <Choice
            key={item}
            label={item}
            selected={filters.modality === item}
            onPress={() => set('modality', item)}
          />
        ))}
      </View>
      <DateTimeField
        label="Data"
        futureOnly={false}
        value={filters.date}
        onChange={(date) => setFilters((previous) => ({ ...previous, date }))}
      />
      <DateTimeField
        label="Horário"
        mode="time"
        futureOnly={false}
        value={filters.time}
        onChange={(time) => setFilters((previous) => ({ ...previous, time }))}
      />
      <SectionTitle>Turno</SectionTitle>
      <View style={styles.choiceRow}>
        {[
          ['morning', 'Manhã'],
          ['afternoon', 'Tarde'],
          ['evening', 'Noite'],
          ['overnight', 'Madrugada'],
        ].map(([value, label]) => (
          <Choice
            key={value}
            label={label}
            selected={filters.shift === value}
            onPress={() => set('shift', value)}
          />
        ))}
      </View>
      <Choice
        label="Somente com vagas"
        selected={filters.availableOnly}
        onPress={() =>
          setFilters((previous) => ({ ...previous, availableOnly: !previous.availableOnly }))
        }
      />
      <View style={styles.buttonRow}>
        <Button
          label="Limpar filtros"
          variant="outline"
          onPress={() => setFilters(createSessionFilters())}
        />
        <Button label="Aplicar filtros" onPress={apply} />
      </View>
    </Screen>
  );
}

export function Details({ state, session, user, domain, execute, go, openMaterial, ...props }) {
  const discipline = state.disciplines.find((item) => item.id === session.disciplineId);
  const monitor = state.users.find((item) => item.id === session.monitorId);
  const professor = state.users.find((item) => item.id === session.professorId);
  const spots = domain.availableSpots(session.id);
  const materials = state.materials.filter((item) =>
    item.disciplineId === session.disciplineId && publishedMaterial(item) &&
    canReadMaterial(state, user, props.role, item),
  );
  const favorite = state.favorites.some(
    (item) => item.studentId === user?.id && item.sessionId === session.id,
  );
  const waiting = state.waitlist.some(
    (item) =>
      item.studentId === user?.id && item.sessionId === session.id && item.status === 'waiting',
  );
  const openLink = () => {
    try {
      const url = domain.validateMonitoringLink(session.id);
      Linking.openURL(url).catch(() =>
        Alert.alert('Link', 'Não foi possível abrir este endereço.'),
      );
    } catch (error) {
      Alert.alert('Link', userErrorMessage(error));
    }
  };
  return (
    <Screen {...props} title="Detalhes da monitoria" subtitle={discipline?.code}>
      {["pending","adjustments_requested"].includes(session.status) ? <Card><Text style={styles.cardBody}>Esta monitoria está em revisão. Aguarde a nova aprovação do professor; novas reservas e registros de presença estão bloqueados até a liberação.</Text></Card> : null}
      {session.authorizationInvalid?<Card><Text style={styles.cardBody}>Esta monitoria está fora do período autorizado pelo professor. Aguarde o ajuste do monitor. Novas reservas estão bloqueadas.</Text></Card>:null}
      <Card accent>
        <Text style={styles.heroTitle}>{discipline?.name}</Text>
        <Text style={styles.cardBody}>{session.topic}</Text>
      </Card>
      <Card>
        <Info
          label="Data e horário"
          value={`${displayDate(session.date)} às ${session.time} · ${session.durationMinutes} min`}
        />
        <Info label="Modalidade e local" value={`${session.modality} · ${session.location}`} />
        <Info label="Vagas disponíveis" value={`${spots} de ${session.capacity}`} />
        <Info label="Monitor" value={monitor?.name} />
        <Info label="Professor responsável" value={professor?.name} />
      </Card>
      <Card>
        <Info label="Conteúdo" value={session.description || 'Conteúdo não informado.'} />
      </Card>
      <SectionTitle>Materiais da disciplina</SectionTitle>
      {materials.length ? materials.map((material) => (
        <Card key={material.id}>
          <Text style={styles.cardTitle}>{material.title}</Text>
          <Text style={styles.meta}>{material.fileName || material.type}</Text>
          <Button label="Abrir material" variant="outline" onPress={() => openMaterial(material)} />
        </Card>
      )) : <Text style={styles.cardBody}>Nenhum material publicado para esta disciplina.</Text>}
      {session.monitoringUrl ? (
        <Button variant="outline" label="Abrir link da monitoria" onPress={openLink} />
      ) : null}
      {props.role === 'student' && (favorite || session.status === 'approved' && !session.archived && !session.authorizationInvalid && Date.parse(session.date+'T'+session.time+':00-03:00')>Date.now()) ? <Button
        variant="ghost" label={favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
        onPress={() => execute('setFavorite', { sessionId: session.id, favorite: !favorite })} /> : null}
      {props.role === 'student' && session.status === 'approved' && !session.archived && !session.authorizationInvalid && Date.parse(session.date+'T'+session.time+':00-03:00')>Date.now() ? (
        <>
          {spots > 0 ? (
            <Button label="Reservar vaga" onPress={() => go('confirm')} />
          ) : (
            <Button
              label={waiting ? 'Na lista de espera' : 'Entrar na lista de espera'}
              disabled={waiting}
              onPress={() => execute('joinWaitlist', { sessionId: session.id, studentId: user.id })}
            />
          )}
        </>
      ) : null}
    </Screen>
  );
}

export function Confirm({ state, session, reserve, ...props }) {
  const start = (value) => Date.parse(`${value.date}T${value.time}:00-03:00`);
  const sessionStart = start(session);
  const sessionEnd = sessionStart + Number(session.durationMinutes || 60) * 60000;
  const conflict = state.reservations.some(
    (r) =>
      r.status === 'confirmed' &&
      r.sessionId !== session.id &&
      state.sessions.some((other) => {
        if (other.id !== r.sessionId) return false;
        const otherStart = start(other);
        const otherEnd = otherStart + Number(other.durationMinutes || 60) * 60000;
        return (
          Number.isFinite(sessionStart) &&
          Number.isFinite(otherStart) &&
          otherStart < sessionEnd &&
          sessionStart < otherEnd
        );
      }),
  );
  const discipline = state.disciplines.find((item) => item.id === session.disciplineId);
  return (
    <Screen {...props} title="Confirmar reserva" subtitle="Revise os dados">
      <Card accent>
        <Text style={styles.cardTitle}>{discipline?.name}</Text>
        <Text style={styles.cardBody}>{session.topic}</Text>
        <Text style={styles.meta}>
          {displayDate(session.date)} · {session.time} · {session.location}
        </Text>
      </Card>
      <Card>
        <Text style={styles.cardBody}>
          Ao confirmar, a vaga será vinculada a esta sessão e à sua matrícula. Reservas simultâneas
          e duplicadas são bloqueadas.
        </Text>
      </Card>
      {conflict ? (
        <Card>
          <Text style={styles.cardBody}>Existe conflito com outra reserva da sua agenda.</Text>
        </Card>
      ) : null}
      <Button label="Confirmar reserva" disabled={conflict} onPress={reserve} />
    </Screen>
  );
}

export function Agenda({ state, user, openSession, cancel, reloadData, ...props }) {
  const reservations = state.reservations.filter((item) => item.studentId === user.id);
  return (
    <Screen {...props} title="Minha agenda" subtitle={`${reservations.length} reserva(s)`}>
      <Button label="Atualizar agenda" variant="outline" onPress={reloadData} />
      {reservations.length ? (
        reservations.map((reservation) => {
          const session = state.sessions.find((item) => item.id === reservation.sessionId);
          if (!session)
            return (
              <Card key={reservation.id}>
                <Text style={styles.cardTitle}>Monitoria indisponível</Text>
                <Text style={styles.cardBody}>
                  Não foi possível localizar a sessão vinculada a esta reserva. Atualize os dados ou
                  solicite suporte.
                </Text>
                <Badge tone="warning">Registro inconsistente</Badge>
              </Card>
            );
          const attendance = state.attendance.find(
            (item) => item.sessionId === session.id && item.studentId === user.id,
          );
          return (
            <View key={reservation.id}>
              <SessionCard
                session={session}
                state={state}
                onDetails={openSession}
                actionLabel={reservation.status === 'confirmed' ? 'Cancelar' : undefined}
                onAction={() => cancel(reservation)}
              />
              <View style={styles.agendaStatusRow}>
                <Badge tone={reservation.status === 'confirmed' ? 'success' : 'info'}>
                  {reservation.status === 'confirmed' ? 'Confirmada' : 'Cancelada'}
                </Badge>
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
                      : 'Presença pendente'}
                </Badge>
              </View>
            </View>
          );
        })
      ) : (
        <Card>
          <Text style={styles.cardTitle}>Agenda vazia</Text>
          <Text style={styles.cardBody}>Busque uma monitoria e confirme sua primeira reserva.</Text>
        </Card>
      )}
    </Screen>
  );
}

export function Notifications({ state, user, refresh, repository, execute, ...props }) {
  const items = state.notifications.filter((item) => item.userId === user.id);
  const markAll = () => execute('markNotificationsRead');
  return (
    <Screen {...props} title="Notificações" subtitle="Atualizações do MoniMob">
      <Button variant="outline" label="Marcar todas como lidas" onPress={markAll} />
      {items.map((item) => (
        <Card key={item.id}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            {!item.read ? <Badge>Novo</Badge> : null}
          </View>
          <Text style={styles.cardBody}>{item.body}</Text>
        </Card>
      ))}
    </Screen>
  );
}

export function Materials(props) { return <MaterialLibrary {...props} />; }

export function Attendance({ state, user, execute, domain, ...props }) {
  const reservations = state.reservations.filter(
    (item) => item.studentId === user.id && item.status === 'confirmed',
  );
  const validReservations = reservations.filter((item) =>
    state.sessions.some((session) => session.id === item.sessionId),
  );
  const [sessionId, setSessionId] = useState(validReservations[0]?.sessionId || '');
  const activeSessionId = validReservations.some((item) => item.sessionId === sessionId)
    ? sessionId
    : validReservations[0]?.sessionId || '';
  const [code, setCode] = useState('');
  const confirmationOpen = useRef(false);
  const selectedSession = state.sessions.find((session) => session.id === activeSessionId);
  const existingAttendance = state.attendance.find(
    (item) => item.sessionId === activeSessionId && item.studentId === user.id,
  );
  const canRegister = Boolean(activeSessionId && domain.canRegisterAttendance(activeSessionId));
  const register = () => {
    if (existingAttendance) {
      Alert.alert('Presença já registrada', 'Esta monitoria já possui seu registro de presença.');
      return;
    }
    if (!activeSessionId || !/^\d{6}$/.test(code.trim())) {
      Alert.alert('Código de presença', 'Informe o código de seis dígitos.');
      return;
    }
    if (confirmationOpen.current) return;
    confirmationOpen.current = true;
    const release = () => {
      confirmationOpen.current = false;
    };
    Alert.alert(
      'Registrar presença',
      'Confirma sua presença nesta monitoria?',
      [
        { text: 'Voltar', style: 'cancel', onPress: release },
        {
          text: 'Confirmar',
          onPress: async () => {
            try {
              const result = await execute('registerAttendance', {
                sessionId: activeSessionId,
                code: code.trim(),
              });
              if (result) {
                setCode('');
                Alert.alert('Presença confirmada', 'Sua presença foi registrada.');
              }
            } finally {
              release();
            }
          },
        },
      ],
      { cancelable: true, onDismiss: release },
    );
  };
  return (
    <Screen {...props} title="Registrar presença" subtitle="Um registro por monitoria">
      <SectionTitle>Reserva</SectionTitle>
      {validReservations.map((item) => {
        const session = state.sessions.find((s) => s.id === item.sessionId);
        const discipline = state.disciplines.find((d) => d.id === session?.disciplineId);
        return (
          <Choice
            key={item.id}
            label={`${discipline?.name || 'Disciplina'} · ${displayDate(session.date)} ${session.time}`}
            selected={activeSessionId === session.id}
            onPress={() => {
              setSessionId(session.id);
              setCode('');
            }}
          />
        );
      })}
      {!validReservations.length ? (
        <Card>
          <Text style={styles.cardBody}>
            {reservations.length
              ? 'Há reservas sem uma monitoria correspondente. Atualize seus dados ou solicite suporte.'
              : 'Você precisa de uma reserva confirmada antes de registrar presença.'}
          </Text>
        </Card>
      ) : null}
      {existingAttendance ? (
        <Card accent>
          <Badge tone={existingAttendance.status === 'present' ? 'success' : 'warning'}>
            Presença já registrada
          </Badge>
          <Text style={styles.cardBody}>
            {existingAttendance.status === 'present'
              ? 'Sua presença nesta monitoria já está confirmada.'
              : 'O monitor já registrou sua situação de presença. Consulte a agenda.'}
          </Text>
        </Card>
      ) : (
        <>
          <Field
            label="Código de 6 dígitos"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
          />
          <Text style={styles.caption}>
            {selectedSession
              ? canRegister
                ? 'A janela de presença está aberta.'
                : 'O código fica disponível 15 minutos antes do início até 30 minutos após o término da monitoria.'
              : 'Selecione uma monitoria válida.'}
          </Text>
        </>
      )}
      <Button
        label={existingAttendance ? 'Presença já registrada' : 'Confirmar presença'}
        disabled={
          !activeSessionId || !selectedSession || !canRegister || Boolean(existingAttendance)
        }
        onPress={register}
      />
    </Screen>
  );
}
