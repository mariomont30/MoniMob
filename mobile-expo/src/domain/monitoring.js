import { entityRevision, assertReviewVersion } from './review.js';
import { favoriteSnapshot } from './favorites.js';
import {
  academicReport,
  workflowReportCsv,
  activeAcademicLink,
  professorPendingItems,
  notifyMaterialPublished,
} from './workflow.js';
import {
  assertSessionAuthorization,
  authorizationForSession,
  sessionAuthorizationIssue,
} from './sessionAuthorization.js';
export class DomainError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

const required = (value, code, message) => {
  if (value === undefined || value === null || String(value).trim() === '')
    throw new DomainError(code, message);
  return value;
};
const newId = (prefix) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const nowIso = (now) => new Date(now ?? Date.now()).toISOString();
const role = (state, userId, value) =>
  state.users.find((user) => user.id === userId)?.roles?.includes(value) ||
  false;
const professorOwns = (state, userId, disciplineId) =>
  state.professorDisciplines.some(
    (x) => x.professorId === userId && x.disciplineId === disciplineId,
  );
const monitorOwns = (state, userId, disciplineId) =>
  state.monitorDisciplines.some(
    (x) =>
      x.monitorId === userId &&
      x.disciplineId === disciplineId &&
      x.active &&
      (!x.validUntil || Date.parse(x.validUntil) > Date.now()),
  );
const LOCAL_TIME_OFFSET = '-03:00';
const validDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
  const [year, month, day] = String(value).split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
};
const validTime = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value));
const validHttpsUrl = (value) => {
  try {
    const url = new URL(String(value).trim());
    return (
      url.protocol === 'https:' &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
};
const sessionStart = (session) =>
  validDate(session?.date) && validTime(session?.time)
    ? Date.parse(`${session.date}T${session.time}:00${LOCAL_TIME_OFFSET}`)
    : NaN;
const sessionEnd = (session) =>
  sessionStart(session) + Number(session.durationMinutes || 60) * 60_000;
const overlaps = (a, b) => {
  const aStart = sessionStart(a),
    bStart = sessionStart(b);
  if (!Number.isFinite(aStart) || !Number.isFinite(bStart)) return false;
  return aStart < sessionEnd(b) && bStart < sessionEnd(a);
};
const localDateTime = (value) => {
  const text = String(value || '').trim();
  if (!text) return NaN;
  const withOffset = /(?:Z|[+-]\d{2}:?\d{2})$/.test(text)
    ? text
    : `${text}${LOCAL_TIME_OFFSET}`;
  return Date.parse(withOffset);
};
const attendanceCodeWindow = (session, now, settings = {}) => {
  const early = Math.max(
    0,
    Number(settings.attendanceEarlyWindowMinutes ?? 15),
  );
  const late = Math.max(0, Number(settings.attendanceLateWindowMinutes ?? 30));
  return (
    now >= sessionStart(session) - early * 60_000 &&
    now <= sessionEnd(session) + late * 60_000
  );
};
const manualAttendanceWindow = (session, now, settings = {}) => {
  const grace = Math.max(0, Number(settings.manualAttendanceGraceHours ?? 24));
  return (
    now >= sessionStart(session) &&
    now <= sessionEnd(session) + grace * 3_600_000
  );
};

function notify(state, userId, title, body, type = 'info', sessionId = null) {
  state.notifications.push({
    id: newId('notification'),
    userId,
    title,
    body,
    type,
    sessionId,
    read: false,
    createdAt: nowIso(),
  });
}
function audit(state, actorId, action, entityType, entityId, details = {}) {
  state.auditLogs.push({
    id: newId('audit'),
    actorId,
    action,
    entityType,
    entityId,
    details,
    createdAt: nowIso(),
  });
}
function occupied(state, sessionId) {
  const count = state.sessions.find(
    (item) => item.id === sessionId,
  )?.reservedCount;
  if (Number.isInteger(count)) return count;
  return state.reservations.filter(
    (x) => x.sessionId === sessionId && x.status === 'confirmed',
  ).length;
}
function promoteWaitlist(state, session) {
  if (
    sessionAuthorizationIssue(
      session,
      authorizationForSession(session, state.monitorDisciplines),
    )
  )
    return;
  if (occupied(state, session.id) >= session.capacity) return null;
  const candidate = state.waitlist
    .filter(
      (x) =>
        x.sessionId === session.id &&
        x.status === 'waiting' &&
        !state.reservations.some(
          (r) =>
            r.studentId === x.studentId &&
            r.status === 'confirmed' &&
            overlaps(
              state.sessions.find((s) => s.id === r.sessionId) || {},
              session,
            ),
        ),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  if (!candidate) return null;
  candidate.status = 'promoted';
  candidate.promotedAt = nowIso();
  const reservation = {
    id: newId('reservation'),
    sessionId: session.id,
    disciplineId: session.disciplineId,
    studentId: candidate.studentId,
    status: 'confirmed',
    createdAt: nowIso(),
    source: 'waitlist',
  };
  state.reservations.push(reservation);
  notify(
    state,
    candidate.studentId,
    'Vaga liberada',
    `Sua reserva em “${session.topic}” foi confirmada automaticamente.`,
    'success',
  );
  return reservation;
}

export class MonitoringService {
  constructor(repository, { codeGenerator } = {}) {
    this.repository = repository;
    this.codeGenerator =
      codeGenerator ||
      (() => {
        const bytes = new Uint32Array(1);
        globalThis.crypto.getRandomValues(bytes);
        return String(100000 + (bytes[0] % 900000));
      });
  }
  state() {
    return this.repository.read();
  }
  listSessions(filters = {}) {
    const state = this.state();
    return state.sessions.filter((session) => {
      const discipline = state.disciplines.find(
        (x) => x.id === session.disciplineId,
      );
      const monitor = state.users.find((x) => x.id === session.monitorId);
      const professor = state.users.find((x) => x.id === session.professorId);
      const query = String(filters.query || '').toLocaleLowerCase('pt-BR');
      const hour = validTime(session.time)
        ? Number(session.time.slice(0, 2))
        : NaN;
      const shift =
        hour < 6
          ? 'overnight'
          : hour < 12
            ? 'morning'
            : hour < 18
              ? 'afternoon'
              : hour < 24
                ? 'evening'
                : '';
      const text =
        `${discipline?.name} ${session.topic} ${monitor?.name} ${professor?.name}`.toLocaleLowerCase(
          'pt-BR',
        );
      return (
        !session.archived &&
        session.status !== 'cancelled' &&
        (!filters.approvedOnly || sessionStart(session) > Date.now()) &&
        (!filters.approvedOnly ||
          (session.status === 'approved' && !session.authorizationInvalid)) &&
        (!query || text.includes(query)) &&
        (!filters.semester ||
          discipline?.semester === Number(filters.semester)) &&
        (!filters.disciplineId ||
          session.disciplineId === filters.disciplineId) &&
        (!filters.professorId || session.professorId === filters.professorId) &&
        (!filters.modality || session.modality === filters.modality) &&
        (!filters.date || session.date === filters.date) &&
        (!filters.time || session.time === filters.time) &&
        (!filters.shift || shift === filters.shift) &&
        (!filters.monitorId || session.monitorId === filters.monitorId) &&
        (!filters.availableOnly ||
          occupied(state, session.id) < session.capacity)
      );
    }).sort((a, b) => sessionStart(a) - sessionStart(b) || a.id.localeCompare(b.id));
  }
  availableSpots(sessionId) {
    const state = this.state();
    const session = state.sessions.find((x) => x.id === sessionId);
    return session
      ? Math.max(0, session.capacity - occupied(state, sessionId))
      : 0;
  }
  reserve({ sessionId, studentId }) {
    const state = this.state();
    if (!role(state, studentId, 'student'))
      throw new DomainError(
        'FORBIDDEN',
        'Somente alunos podem reservar monitorias.',
      );
    const session = state.sessions.find(
      (x) => x.id === sessionId && !x.archived && x.status === 'approved',
    );
    if (!session)
      throw new DomainError(
        'SESSION_UNAVAILABLE',
        'Sessão indisponível para reserva.',
      );
    assertSessionAuthorization(
      session,
      authorizationForSession(session, state.monitorDisciplines),
    );
    const startsAt = sessionStart(session);
    if (!Number.isFinite(startsAt))
      throw new DomainError(
        'INVALID_SESSION_DATE',
        'A sessão possui data ou horário inválido.',
      );
    if (startsAt <= Date.now())
      throw new DomainError(
        'SESSION_PAST',
        'Não é possível reservar uma sessão encerrada.',
      );
    if (
      state.reservations.some(
        (x) =>
          x.sessionId === sessionId &&
          x.studentId === studentId &&
          x.status === 'confirmed',
      )
    )
      throw new DomainError(
        'DUPLICATE_RESERVATION',
        'O aluno já possui reserva nesta sessão.',
      );
    if (occupied(state, sessionId) >= session.capacity)
      throw new DomainError(
        'FULL_SESSION',
        'A sessão está lotada. Entre na lista de espera.',
      );
    const conflict = state.reservations
      .filter((x) => x.studentId === studentId && x.status === 'confirmed')
      .map((x) => state.sessions.find((s) => s.id === x.sessionId))
      .filter(Boolean)
      .some((x) => overlaps(x, session));
    if (conflict)
      throw new DomainError(
        'SCHEDULE_CONFLICT',
        'Já existe uma reserva no mesmo horário.',
      );
    const reservation = {
      id: newId('reservation'),
      sessionId,
      disciplineId: session.disciplineId,
      studentId,
      status: 'confirmed',
      createdAt: nowIso(),
      source: 'direct',
    };
    state.reservations.push(reservation);
    notify(
      state,
      studentId,
      'Reserva confirmada',
      `${session.topic} em ${session.date}, às ${session.time}.`,
      'success',
    );
    audit(state, studentId, 'RESERVE', 'session', sessionId);
    this.repository.write(state);
    return reservation;
  }
  joinWaitlist({ sessionId, studentId }) {
    const state = this.state();
    const session = state.sessions.find(
      (x) => x.id === sessionId && x.status === 'approved' && !x.archived,
    );
    if (!session || !role(state, studentId, 'student'))
      throw new DomainError('FORBIDDEN', 'Lista de espera indisponível.');
    assertSessionAuthorization(
      session,
      authorizationForSession(session, state.monitorDisciplines),
    );
    if (occupied(state, sessionId) < session.capacity)
      throw new DomainError(
        'SPOTS_AVAILABLE',
        'Há vaga disponível; faça a reserva diretamente.',
      );
    const startsAt = sessionStart(session);
    if (!Number.isFinite(startsAt))
      throw new DomainError(
        'INVALID_SESSION_DATE',
        'A sessão possui data ou horário inválido.',
      );
    if (startsAt <= Date.now())
      throw new DomainError('SESSION_PAST', 'Monitoria encerrada.');
    if (
      state.reservations.some(
        (x) =>
          x.sessionId === sessionId &&
          x.studentId === studentId &&
          x.status === 'confirmed',
      )
    )
      throw new DomainError('DUPLICATE_RESERVATION', 'Você já possui reserva.');
    if (
      state.waitlist.some(
        (x) =>
          x.sessionId === sessionId &&
          x.studentId === studentId &&
          x.status === 'waiting',
      )
    )
      throw new DomainError(
        'ALREADY_WAITING',
        'Você já está na lista de espera.',
      );
    const item = {
      id: newId('wait'),
      sessionId,
      disciplineId: session.disciplineId,
      studentId,
      status: 'waiting',
      createdAt: nowIso(),
    };
    state.waitlist.push(item);
    notify(
      state,
      studentId,
      'Lista de espera',
      `Você entrou na lista de “${session.topic}”.`,
    );
    audit(state, studentId, 'JOIN_WAITLIST', 'session', sessionId);
    this.repository.write(state);
    return item;
  }
  cancelReservation({ reservationId, studentId, now = Date.now() }) {
    const state = this.state();
    const reservation = state.reservations.find(
      (x) =>
        x.id === reservationId &&
        x.studentId === studentId &&
        x.status === 'confirmed',
    );
    if (!reservation)
      throw new DomainError('NOT_FOUND', 'Reserva ativa não encontrada.');
    const session = state.sessions.find((x) => x.id === reservation.sessionId);
    if (session) {
      const startsAt = sessionStart(session);
      if (!Number.isFinite(startsAt))
        throw new DomainError(
          'INVALID_SESSION_DATE',
          'A sessão vinculada possui data ou horário inválido.',
        );
      const deadline =
        startsAt -
        Number(state.settings.cancellationWindowHours || 0) * 3_600_000;
      if (now > deadline)
        throw new DomainError(
          'CANCELLATION_DEADLINE',
          `O cancelamento encerra ${state.settings.cancellationWindowHours} hora(s) antes da sessão.`,
        );
    }
    reservation.status = 'cancelled';
    reservation.cancelledAt = nowIso(now);
    audit(state, studentId, 'CANCEL_RESERVATION', 'reservation', reservationId);
    if (session) promoteWaitlist(state, session);
    this.repository.write(state);
    return reservation;
  }
  setFavorite({ studentId, sessionId, favorite }) {
    const state = this.state();
    if (!role(state, studentId, 'student'))
      throw new DomainError('FORBIDDEN', 'Ação exclusiva de aluno.');
    if (
      typeof sessionId !== 'string' ||
      !sessionId ||
      sessionId.length > 200 ||
      typeof favorite !== 'boolean'
    )
      throw new DomainError(
        'INVALID_FAVORITE',
        'Informe uma monitoria e uma ação válidas.',
      );
    const existing = state.favorites.find(
      (item) => item.studentId === studentId && item.sessionId === sessionId,
    );
    if (favorite) {
      const session = state.sessions.find(
        (item) =>
          item.id === sessionId && !item.archived && item.status === 'approved',
      );
      if (!session || sessionStart(session) <= Date.now())
        throw new DomainError(
          'SESSION_UNAVAILABLE',
          'Monitoria indisponível para favoritar.',
        );
      assertSessionAuthorization(
        session,
        authorizationForSession(session, state.monitorDisciplines),
      );
      if (existing) {
        existing.snapshot ||= favoriteSnapshot(session);
        state.favorites = state.favorites.filter(
          (item) =>
            item.studentId !== studentId ||
            item.sessionId !== sessionId ||
            item === existing,
        );
      }
      if (!existing)
        state.favorites.push({
          id: newId('favorite'),
          studentId,
          sessionId,
          snapshot: favoriteSnapshot(session),
          createdAt: nowIso(),
        });
    } else
      state.favorites = state.favorites.filter(
        (item) => item.studentId !== studentId || item.sessionId !== sessionId,
      );
    if (Boolean(existing) !== favorite)
      audit(
        state,
        studentId,
        favorite ? 'FAVORITE' : 'UNFAVORITE',
        'session',
        sessionId,
      );
    this.repository.write(state);
    return favorite;
  }
  toggleFavorite({ studentId, sessionId }) {
    return this.setFavorite({
      studentId,
      sessionId,
      favorite: !this.state().favorites.some(
        (item) => item.studentId === studentId && item.sessionId === sessionId,
      ),
    });
  }
  recommendations(studentId) {
    const state = this.state();
    const preferred = new Set(
      state.favorites
        .filter((x) => x.studentId === studentId)
        .map(
          (x) =>
            (
              state.sessions.find((s) => s.id === x.sessionId) ||
              x.session ||
              x.snapshot
            )?.disciplineId,
        )
        .filter(Boolean),
    );
    return this.listSessions({ approvedOnly: true })
      .sort(
        (a, b) =>
          Number(preferred.has(b.disciplineId)) -
            Number(preferred.has(a.disciplineId)) ||
          sessionStart(a) - sessionStart(b),
      )
      .slice(0, 3);
  }
  saveSession({ actorId, session }) {
    if (!session || typeof session.topic !== 'string')
      throw new DomainError('TOPIC_REQUIRED', 'Informe um assunto válido.');
    const state = this.state();
    if (
      !role(state, actorId, 'monitor') ||
      !monitorOwns(state, actorId, session.disciplineId)
    )
      throw new DomainError('FORBIDDEN', 'Monitor não vinculado à disciplina.');
    const link =
      state.monitorDisciplines.find(
        (x) =>
          x.monitorId === actorId &&
          x.disciplineId === session.disciplineId &&
          activeAcademicLink(x),
      ) ||
      state.monitorDisciplines.find(
        (x) =>
          x.monitorId === actorId &&
          x.disciplineId === session.disciplineId &&
          x.active &&
          !x.validUntil,
      );
    required(session.topic, 'TOPIC_REQUIRED', 'Informe o assunto da sessão.');
    required(session.date, 'DATE_REQUIRED', 'Informe a data.');
    required(session.time, 'TIME_REQUIRED', 'Informe o horário.');
    if (!validDate(session.date))
      throw new DomainError(
        'INVALID_DATE',
        'Use uma data válida no formato AAAA-MM-DD.',
      );
    if (!validTime(session.time))
      throw new DomainError(
        'INVALID_TIME',
        'Use um horário válido no formato HH:MM.',
      );
    const durationMinutes = Number(session.durationMinutes ?? 60);
    const capacity = Number(session.capacity ?? 1);
    if (
      !Number.isInteger(durationMinutes) ||
      durationMinutes < 15 ||
      durationMinutes > 1440
    )
      throw new DomainError(
        'INVALID_DURATION',
        'A duração deve ser um inteiro entre 15 e 1440 minutos.',
      );
    if (!Number.isInteger(capacity) || capacity < 1)
      throw new DomainError(
        'INVALID_CAPACITY',
        'A quantidade de vagas deve ser um inteiro positivo.',
      );
    const modality = session.modality || 'Presencial';
    if (!['Presencial', 'Online'].includes(modality))
      throw new DomainError('INVALID_MODALITY', 'Modalidade inválida.');
    if (modality === 'Online' && !String(session.monitoringUrl || '').trim())
      throw new DomainError(
        'ONLINE_LINK_REQUIRED',
        'Informe o link HTTPS da monitoria online.',
      );
    if (session.monitoringUrl && !validHttpsUrl(session.monitoringUrl))
      throw new DomainError(
        'INVALID_URL',
        'O link da monitoria deve usar HTTPS válido.',
      );
    if (modality === 'Presencial')
      required(
        session.location,
        'LOCATION_REQUIRED',
        'Informe o local da monitoria.',
      );
    const start = sessionStart(session);
    const end = start + durationMinutes * 60_000;
    if (start <= Date.now())
      throw new DomainError('SESSION_PAST', 'Informe uma data futura.');
    assertSessionAuthorization(
      {
        ...session,
        monitorId: actorId,
        professorId: link.professorId,
        durationMinutes,
      },
      link,
    );
    const linkExpiry = session.linkValidUntil
      ? localDateTime(session.linkValidUntil)
      : NaN;
    if (session.linkValidUntil && !Number.isFinite(linkExpiry))
      throw new DomainError(
        'INVALID_LINK_EXPIRY',
        'Informe uma validade de link válida.',
      );
    if (session.linkValidUntil && modality === 'Online' && linkExpiry < end)
      throw new DomainError(
        'INVALID_LINK_EXPIRY',
        'A validade do link deve cobrir toda a duração da monitoria.',
      );
    const previous = state.sessions.find((x) => x.id === session.id);
    if (previous) assertReviewVersion(previous, session.expectedRevision);
    const approvalRequired = Boolean(
      previous &&
      (previous.approvalRequired ||
        ['adjustments_requested', 'pending', 'rejected'].includes(
          previous.status,
        )),
    );
    if (previous && sessionStart(previous) <= Date.now())
      throw new DomainError(
        'SESSION_STARTED',
        'Uma monitoria iniciada não pode ser reaproveitada. Cadastre uma nova sessão.',
      );
    if (
      previous &&
      previous.disciplineId !== session.disciplineId &&
      state.reservations.some((r) => r.sessionId === previous.id)
    )
      throw new DomainError(
        'HAS_RESERVATIONS',
        'Uma monitoria com histórico de reservas não pode mudar de disciplina.',
      );
    if (
      previous &&
      state.attendance.some((a) => a.sessionId === previous.id) &&
      (previous.date !== session.date ||
        previous.time !== session.time ||
        Number(previous.durationMinutes || 60) !== durationMinutes)
    )
      throw new DomainError(
        'HAS_ATTENDANCE',
        'Uma monitoria com presença registrada não pode ser reagendada. Cadastre uma nova sessão.',
      );
    if (
      state.sessions.some(
        (x) =>
          x.id !== session.id &&
          !x.archived &&
          x.status !== 'cancelled' &&
          x.monitorId === actorId &&
          overlaps(x, { ...session, durationMinutes }),
      )
    )
      throw new DomainError(
        'SCHEDULE_CONFLICT',
        'Você já possui uma monitoria neste horário.',
      );
    if (
      previous &&
      state.reservations.some(
        (r) =>
          r.sessionId === previous.id &&
          r.status === 'confirmed' &&
          state.reservations.some(
            (other) =>
              other.studentId === r.studentId &&
              other.sessionId !== previous.id &&
              other.status === 'confirmed' &&
              overlaps(
                state.sessions.find((s) => s.id === other.sessionId) || {},
                session,
              ),
          ),
      )
    )
      throw new DomainError(
        'SCHEDULE_CONFLICT',
        'A alteração conflita com outra reserva dos participantes.',
      );
    if (previous && capacity < occupied(state, previous.id))
      throw new DomainError(
        'CAPACITY_BELOW_OCCUPIED',
        'As vagas não podem ser menores que as reservas confirmadas.',
      );
    const saved = {
      id: session.id || newId('session'),
      disciplineId: session.disciplineId,
      monitorId: actorId,
      professorId: link.professorId,
      topic: session.topic.trim(),
      description: String(session.description || '').trim(),
      date: session.date,
      time: session.time,
      durationMinutes,
      modality,
      location: String(session.location || '').trim(),
      capacity,
      monitoringUrl: String(session.monitoringUrl || '').trim(),
      linkValidUntil: session.linkValidUntil || '',
      revision: previous ? entityRevision(previous) + 1 : 1,
      reviewSequence: Number(previous?.reviewSequence || 0),
      approvalRequired,
      reviewPending: true,
      status: approvalRequired ? 'pending' : 'approved',
      archived: false,
    };
    if (previous) {
      if (previous.monitorId !== actorId)
        throw new DomainError(
          'FORBIDDEN',
          'A sessão pertence a outro monitor.',
        );
      state.sessions[state.sessions.findIndex((x) => x.id === saved.id)] =
        saved;
      state.reservations
        .filter((x) => x.sessionId === saved.id && x.status === 'confirmed')
        .forEach((x) =>
          notify(
            state,
            x.studentId,
            approvalRequired ? 'Monitoria em revisão' : 'Monitoria alterada',
            approvalRequired
              ? `${saved.topic} aguarda nova aprovação do professor.`
              : `Confira os novos dados de “${saved.topic}”.`,
            'warning',
            saved.id,
          ),
        );
      if (
        previous.date !== saved.date ||
        previous.time !== saved.time ||
        previous.durationMinutes !== saved.durationMinutes
      )
        state.attendanceCodes
          .filter((code) => code.sessionId === saved.id)
          .forEach((code) => (code.active = false));
    } else state.sessions.push(saved);
    notify(
      state,
      saved.professorId,
      approvalRequired
        ? 'Monitoria reenviada para aprovação'
        : previous
          ? 'Sessão alterada'
          : 'Nova monitoria publicada',
      approvalRequired
        ? `${saved.topic} foi corrigida e aguarda sua análise.`
        : `${saved.topic} está disponível para os alunos.`,
      'warning',
    );
    audit(
      state,
      actorId,
      previous ? 'UPDATE_SESSION' : 'CREATE_SESSION',
      'session',
      saved.id,
    );
    this.repository.write(state);
    return saved;
  }
  archiveSession({ actorId, sessionId }) {
    const state = this.state();
    const session = state.sessions.find((x) => x.id === sessionId);
    if (!session || session.monitorId !== actorId)
      throw new DomainError('FORBIDDEN', 'A sessão não pertence ao monitor.');
    session.archived = true;
    session.status = 'cancelled';
    state.attendanceCodes
      .filter((x) => x.sessionId === sessionId)
      .forEach((x) => {
        x.active = false;
      });
    state.reservations
      .filter((x) => x.sessionId === sessionId && x.status === 'confirmed')
      .forEach((x) => {
        x.status = 'cancelled';
        x.cancelledAt = nowIso();
        notify(
          state,
          x.studentId,
          'Monitoria cancelada',
          `${session.topic} foi cancelada.`,
          'error',
          session.id,
        );
      });
    state.waitlist
      .filter(
        (x) =>
          x.sessionId === sessionId &&
          ['waiting', 'promoted'].includes(x.status),
      )
      .forEach((x) => {
        x.status = 'cancelled';
        x.cancelledAt = nowIso();
        notify(
          state,
          x.studentId,
          'Lista de espera encerrada',
          `A monitoria “${session.topic}” foi cancelada.`,
          'warning',
          session.id,
        );
      });
    audit(state, actorId, 'ARCHIVE_SESSION', 'session', sessionId);
    this.repository.write(state);
    return session;
  }
  canGenerateAttendanceCode(sessionId, now = Date.now()) {
    const session = this.state().sessions.find((x) => x.id === sessionId);
    return Boolean(
      session &&
      !session.archived &&
      session.status === 'approved' &&
      attendanceCodeWindow(session, now, this.state().settings),
    );
  }
  canSetAttendance(sessionId, now = Date.now()) {
    const state = this.state();
    const session = state.sessions.find((x) => x.id === sessionId);
    return Boolean(
      session &&
      !session.archived &&
      session.status === 'approved' &&
      manualAttendanceWindow(session, now, state.settings),
    );
  }
  canRegisterAttendance(sessionId, now = Date.now()) {
    const state = this.state();
    const session = state.sessions.find((x) => x.id === sessionId);
    return Boolean(
      session &&
      !session.archived &&
      session.status === 'approved' &&
      attendanceCodeWindow(session, now, state.settings),
    );
  }
  generateAttendanceCode({
    actorId,
    sessionId,
    now = Date.now(),
    lifetimeMinutes = 20,
  }) {
    const state = this.state();
    const session = state.sessions.find(
      (x) => x.id === sessionId && !x.archived && x.status === 'approved',
    );
    if (!session || session.monitorId !== actorId)
      throw new DomainError(
        'FORBIDDEN',
        'Somente o monitor responsável por uma sessão aprovada pode gerar o código.',
      );
    if (!attendanceCodeWindow(session, now, state.settings))
      throw new DomainError(
        'ATTENDANCE_WINDOW_CLOSED',
        'O código só pode ser gerado 15 minutos antes e até 30 minutos depois do término da monitoria.',
      );
    const ttl = Number(lifetimeMinutes);
    if (!Number.isInteger(ttl) || ttl < 1 || ttl > 60)
      throw new DomainError(
        'INVALID_CODE_LIFETIME',
        'A validade do código deve ficar entre 1 e 60 minutos.',
      );
    const record = {
      id: newId('code'),
      sessionId,
      code: this.codeGenerator(),
      createdBy: actorId,
      createdAt: nowIso(now),
      expiresAt: nowIso(now + ttl * 60_000),
      active: true,
    };
    state.attendanceCodes.forEach((x) => {
      if (x.sessionId === sessionId) x.active = false;
    });
    state.attendanceCodes.push(record);
    audit(state, actorId, 'GENERATE_ATTENDANCE_CODE', 'session', sessionId);
    this.repository.write(state);
    return record;
  }
  registerAttendance({ studentId, sessionId, code, now = Date.now() }) {
    const state = this.state();
    const session = state.sessions.find(
      (x) => x.id === sessionId && !x.archived && x.status === 'approved',
    );
    if (!session)
      throw new DomainError(
        'SESSION_UNAVAILABLE',
        'Sessão indisponível para registro de presença.',
      );
    if (!attendanceCodeWindow(session, now, state.settings))
      throw new DomainError(
        'ATTENDANCE_WINDOW_CLOSED',
        'O período de registro de presença por código está encerrado.',
      );
    const reservation = state.reservations.find(
      (x) =>
        x.studentId === studentId &&
        x.sessionId === sessionId &&
        x.status === 'confirmed',
    );
    if (!reservation)
      throw new DomainError(
        'RESERVATION_REQUIRED',
        'É necessário possuir reserva confirmada nesta sessão.',
      );
    if (
      state.attendance.some(
        (x) => x.studentId === studentId && x.sessionId === sessionId,
      )
    )
      throw new DomainError(
        'DUPLICATE_ATTENDANCE',
        'A presença já foi registrada nesta sessão.',
      );
    const valid = state.attendanceCodes.find(
      (x) =>
        x.sessionId === sessionId && x.code === String(code).trim() && x.active,
    );
    if (!valid)
      throw new DomainError(
        'INVALID_CODE',
        'Código de presença inválido para esta sessão.',
      );
    if (new Date(valid.expiresAt).getTime() <= now)
      throw new DomainError('EXPIRED_CODE', 'O código de presença expirou.');
    const item = {
      id: newId('attendance'),
      sessionId,
      disciplineId: reservation.disciplineId,
      studentId,
      reservationId: reservation.id,
      status: 'present',
      source: 'code',
      updatedBy: studentId,
      registeredAt: nowIso(now),
    };
    state.attendance.push(item);
    audit(state, studentId, 'REGISTER_ATTENDANCE', 'session', sessionId);
    this.repository.write(state);
    return item;
  }
  setAttendance({ monitorId, sessionId, studentId, status, now = Date.now() }) {
    const state = this.state();
    const session = state.sessions.find((x) => x.id === sessionId);
    if (
      !session ||
      session.archived ||
      session.status !== 'approved' ||
      session.monitorId !== monitorId ||
      !['present', 'absent'].includes(status)
    )
      throw new DomainError(
        'FORBIDDEN',
        'Atualização de presença não autorizada.',
      );
    if (!manualAttendanceWindow(session, now, state.settings))
      throw new DomainError(
        'ATTENDANCE_WINDOW_CLOSED',
        'A presença manual só pode ser ajustada durante a monitoria ou nas 24 horas seguintes ao término.',
      );
    const reservation = state.reservations.find(
      (x) =>
        x.sessionId === sessionId &&
        x.studentId === studentId &&
        x.status === 'confirmed',
    );
    if (!reservation)
      throw new DomainError(
        'RESERVATION_REQUIRED',
        'Participante sem reserva confirmada.',
      );
    let item = state.attendance.find(
      (x) => x.sessionId === sessionId && x.studentId === studentId,
    );
    if (item)
      Object.assign(item, {
        status,
        source: 'manual',
        updatedBy: monitorId,
        registeredAt: nowIso(now),
      });
    else {
      item = {
        id: newId('attendance'),
        sessionId,
        disciplineId: session.disciplineId,
        studentId,
        reservationId: reservation.id,
        status,
        source: 'manual',
        updatedBy: monitorId,
        registeredAt: nowIso(now),
      };
      state.attendance.push(item);
    }
    audit(state, monitorId, 'SET_ATTENDANCE', 'session', sessionId, {
      studentId,
      status,
    });
    this.repository.write(state);
    return item;
  }
  saveMaterial({ actorId, material }) {
    if (
      !material ||
      typeof material.title !== 'string' ||
      typeof material.url !== 'string'
    )
      throw new DomainError(
        'INVALID_MATERIAL',
        'Informe título e link válidos.',
      );
    const state = this.state();
    if (
      !role(state, actorId, 'monitor') ||
      !monitorOwns(state, actorId, material.disciplineId)
    )
      throw new DomainError('FORBIDDEN', 'Monitor não vinculado à disciplina.');
    const link = state.monitorDisciplines.find(
      (x) =>
        x.monitorId === actorId &&
        x.disciplineId === material.disciplineId &&
        x.active,
    );
    required(material.title, 'TITLE_REQUIRED', 'Informe o título do material.');
    required(material.url, 'URL_REQUIRED', 'Informe o link do material.');
    if (!validHttpsUrl(material.url))
      throw new DomainError(
        'INVALID_URL',
        'O endereço do material deve usar HTTPS.',
      );
    const previous = state.materials.find((x) => x.id === material.id);
    const saved = {
      id: material.id || newId('material'),
      disciplineId: material.disciplineId,
      monitorId: actorId,
      professorId: link.professorId,
      title: material.title.trim(),
      type: material.type || 'Link',
      url: material.url.trim(),
      status: 'pending',
      archived: false,
    };
    if (previous) {
      if (previous.monitorId !== actorId)
        throw new DomainError(
          'FORBIDDEN',
          'O material pertence a outro monitor.',
        );
      state.materials[state.materials.findIndex((x) => x.id === saved.id)] =
        saved;
    } else state.materials.push(saved);
    notify(
      state,
      saved.professorId,
      'Material para validar',
      `${saved.title} aguarda validação.`,
      'warning',
    );
    audit(
      state,
      actorId,
      previous ? 'UPDATE_MATERIAL' : 'CREATE_MATERIAL',
      'material',
      saved.id,
    );
    this.repository.write(state);
    return saved;
  }
  archiveMaterial({ actorId, materialId }) {
    const state = this.state();
    const material = state.materials.find((x) => x.id === materialId);
    if (!material || material.monitorId !== actorId)
      throw new DomainError(
        'FORBIDDEN',
        'O material pertence a outro monitor.',
      );
    material.archived = true;
    audit(state, actorId, 'ARCHIVE_MATERIAL', 'material', materialId);
    this.repository.write(state);
    return material;
  }
  decideApproval({
    professorId,
    entityType,
    entityId,
    decision,
    comment = '',
    expectedRevision,
  }) {
    const state = this.state();
    if (
      !['session', 'material'].includes(entityType) ||
      !['approved', 'rejected', 'adjustments_requested'].includes(decision)
    )
      throw new DomainError(
        'INVALID_DECISION',
        'Decisão de aprovação inválida.',
      );
    const collection =
      entityType === 'session' ? state.sessions : state.materials;
    const entity = collection.find((x) => x.id === entityId && !x.archived);
    if (!entity) throw new DomainError('NOT_FOUND', 'Item não encontrado.');
    if (
      !role(state, professorId, 'professor') ||
      entity.professorId !== professorId ||
      !professorOwns(state, professorId, entity.disciplineId)
    )
      throw new DomainError(
        'FORBIDDEN',
        'Professor não vinculado à disciplina deste item.',
      );
    assertReviewVersion(entity, expectedRevision, entityRevision(entity) > 1);
    if (typeof comment !== 'string' || comment.length > 1000)
      throw new DomainError(
        'INVALID_COMMENT',
        'Use uma observação de até 1000 caracteres.',
      );
    if (entityType === 'session' && decision === 'approved')
      assertSessionAuthorization(
        entity,
        authorizationForSession(entity, state.monitorDisciplines),
      );
    if (
      entity.status !== 'pending' &&
      !(
        entityType === 'session' &&
        entity.status === 'approved' &&
        (entity.reviewPending ||
          sessionAuthorizationIssue(
            entity,
            authorizationForSession(entity, state.monitorDisciplines),
          ))
      )
    )
      throw new DomainError(
        'NOT_PENDING',
        'O item já possui uma decisão acadêmica.',
      );
    if (decision === 'adjustments_requested' && !String(comment).trim())
      throw new DomainError(
        'COMMENT_REQUIRED',
        'Descreva o ajuste solicitado.',
      );
    if (entityType === 'session' && decision !== 'approved') {
      state.reservations
        .filter((r) => r.sessionId === entity.id && r.status === 'confirmed')
        .forEach((r) => {
          if (decision === 'rejected') {
            r.status = 'cancelled';
            r.cancelledAt = nowIso();
          }
          notify(
            state,
            r.studentId,
            decision === 'rejected'
              ? 'Monitoria cancelada pela supervisão'
              : 'Monitoria em revisão',
            decision === 'rejected'
              ? entity.topic
              : `${entity.topic} aguarda correção e nova aprovação.`,
            'warning',
            entity.id,
          );
        });
      if (decision === 'rejected')
        state.waitlist
          .filter((r) => r.sessionId === entity.id && r.status === 'waiting')
          .forEach((r) => {
            r.status = 'cancelled';
            notify(
              state,
              r.studentId,
              'Lista de espera encerrada',
              entity.topic,
              'warning',
              entity.id,
            );
          });
    }
    if (decision !== 'approved' && entityType === 'session') {
      entity.approvalRequired = true;
      state.attendanceCodes
        .filter((code) => code.sessionId === entity.id)
        .forEach((code) => (code.active = false));
    }
    entity.reviewSequence = Number(entity.reviewSequence || 0) + 1;
    entity.updatedAt = nowIso();
    entity.reviewPending = false;
    entity.status = decision;
    const approval = {
      id: newId('approval'),
      entityType,
      entityId,
      disciplineId: entity.disciplineId,
      professorId,
      decision,
      revision: entityRevision(entity),
      sequence: entity.reviewSequence,
      comment: String(comment).trim(),
      decidedAt: nowIso(),
    };
    state.approvals.push(approval);
    notify(
      state,
      entity.monitorId,
      decision === 'approved'
        ? 'Item aprovado'
        : decision === 'rejected'
          ? 'Item rejeitado'
          : 'Ajustes solicitados',
      `${entity.topic || entity.title}${comment ? ` — ${comment}` : ''}`,
      decision === 'approved' ? 'success' : 'warning',
    );
    if (decision === 'approved' && entityType === 'session')
      state.reservations
        .filter((r) => r.sessionId === entity.id && r.status === 'confirmed')
        .forEach((r) =>
          notify(
            state,
            r.studentId,
            'Monitoria aprovada',
            `${entity.topic}: confira a data e o horário atualizados.`,
            'success',
            entity.id,
          ),
        );
    if (decision === 'approved' && entityType === 'material')
      notifyMaterialPublished(state, entity);
    audit(state, professorId, decision.toUpperCase(), entityType, entityId, {
      comment,
    });
    this.repository.write(state);
    return approval;
  }
  reportForProfessor(professorId, filters = {}, now = Date.now()) {
    if (
      (filters.startDate && !validDate(filters.startDate)) ||
      (filters.endDate && !validDate(filters.endDate)) ||
      (filters.startDate &&
        filters.endDate &&
        filters.startDate > filters.endDate)
    )
      throw new DomainError(
        'INVALID_DATE_RANGE',
        'Selecione um intervalo de datas válido.',
      );
    const state = this.state();
    const allowed = new Set(
      state.professorDisciplines
        .filter((x) => x.professorId === professorId && activeAcademicLink(x))
        .map((x) => x.disciplineId),
    );
    const disciplineIds = filters.disciplineId
      ? new Set([filters.disciplineId].filter((x) => allowed.has(x)))
      : allowed;
    const periodSessions = state.sessions.filter(
      (x) =>
        disciplineIds.has(x.disciplineId) &&
        x.status === 'approved' &&
        (!filters.startDate || x.date >= filters.startDate) &&
        (!filters.endDate || x.date <= filters.endDate),
    );
    const sessions = periodSessions.filter((x) => sessionEnd(x) <= now);
    const demandFor = (items) => {
      const ids = new Set(items.map((item) => item.id));
      const booked = state.reservations.filter((item) => ids.has(item.sessionId) && item.status === 'confirmed');
      const waiting = state.waitlist.filter((item) => ids.has(item.sessionId) && item.status === 'waiting');
      const capacity = items.reduce((total, item) => total + Number(item.capacity || 0), 0);
      return {
        scheduledSessions: items.length,
        bookedPlaces: booked.length,
        waiting: waiting.length,
        // Queue promotions must not count the same interested student twice.
        demand: new Set([...booked, ...waiting].map((item) => item.sessionId + ':' + item.studentId)).size,
        capacity,
        occupancyRate: capacity ? Math.round(booked.length / capacity * 100) : 0,
      };
    };
    const ids = new Set(sessions.map((x) => x.id));
    const reservations = state.reservations.filter(
      (x) => ids.has(x.sessionId) && x.status === 'confirmed',
    );
    const attendance = state.attendance.filter(
      (x) => ids.has(x.sessionId) && ['present', 'absent'].includes(x.status),
    );
    const rows = [...disciplineIds].map((id) => {
      const discipline = state.disciplines.find((x) => x.id === id);
      const own = sessions.filter((x) => x.disciplineId === id);
      const ownIds = new Set(own.map((x) => x.id));
      const reserved = reservations.filter((x) =>
        ownIds.has(x.sessionId),
      ).length;
      const present = attendance.filter(
        (x) => ownIds.has(x.sessionId) && x.status === 'present',
      ).length;
      return {
        disciplineId: id,
        code: discipline?.code,
        name: discipline?.name,
        sessions: own.length,
        reservations: reserved,
        attendanceRate: reserved ? Math.round((present / reserved) * 100) : 0,
        ...demandFor(periodSessions.filter((item) => item.disciplineId === id)),
      };
    });
    return {
      ...academicReport(state, professorId, filters),
      ...demandFor(periodSessions),
      disciplines: disciplineIds.size,
      sessions: sessions.length,
      reservations: reservations.length,
      attendanceRate: reservations.length
        ? Math.round(
            (attendance.filter((x) => x.status === 'present').length /
              reservations.length) *
              100,
          )
        : 0,
      pending: professorPendingItems(state, professorId).filter(
        (x) => !filters.disciplineId || x.disciplineId === filters.disciplineId,
      ).length,
      rows,
    };
  }
  exportReportCsv(professorId, filters = {}) {
    return workflowReportCsv(
      this.state(),
      professorId,
      filters,
      this.reportForProfessor(professorId, filters),
    );
  }
  validateMonitoringLink(sessionId, now = Date.now()) {
    const session = this.state().sessions.find((x) => x.id === sessionId);
    if (
      !session ||
      session.archived ||
      session.status !== 'approved' ||
      session.modality !== 'Online' ||
      !validHttpsUrl(session.monitoringUrl)
    )
      throw new DomainError(
        'LINK_UNAVAILABLE',
        'Link da monitoria indisponível.',
      );
    if (session.linkValidUntil) {
      const expiresAt = localDateTime(session.linkValidUntil);
      if (!Number.isFinite(expiresAt) || expiresAt <= now)
        throw new DomainError(
          'LINK_EXPIRED',
          'O link da monitoria está expirado ou possui validade inválida.',
        );
    }
    return session.monitoringUrl;
  }
}
