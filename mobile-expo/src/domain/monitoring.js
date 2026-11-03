export class DomainError extends Error {
  constructor(code, message) { super(message); this.name = 'DomainError'; this.code = code; }
}

const required = (value, code, message) => {
  if (value === undefined || value === null || String(value).trim() === '') throw new DomainError(code, message);
  return value;
};
const newId = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const minutes = time => { const [h, m] = String(time).split(':').map(Number); return h * 60 + m; };
const nowIso = now => new Date(now ?? Date.now()).toISOString();
const role = (state, userId, value) => state.users.find(user => user.id === userId)?.roles?.includes(value) || false;
const professorOwns = (state, userId, disciplineId) => state.professorDisciplines.some(x => x.professorId === userId && x.disciplineId === disciplineId);
const monitorOwns = (state, userId, disciplineId) => state.monitorDisciplines.some(x => x.monitorId === userId && x.disciplineId === disciplineId && x.active && (!x.validUntil || Date.parse(x.validUntil) > Date.now()));
const overlaps = (a, b) => a.date === b.date && minutes(a.time) < minutes(b.time) + Number(b.durationMinutes || 60) && minutes(b.time) < minutes(a.time) + Number(a.durationMinutes || 60);
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value)) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());
const validTime = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value));
const validHttpsUrl = value => { try { return new URL(String(value)).protocol === 'https:'; } catch { return false; } };

function notify(state, userId, title, body, type = 'info', sessionId = null) {
  state.notifications.push({ id: newId('notification'), userId, title, body, type, sessionId, read: false, createdAt: nowIso() });
}
function audit(state, actorId, action, entityType, entityId, details = {}) {
  state.auditLogs.push({ id: newId('audit'), actorId, action, entityType, entityId, details, createdAt: nowIso() });
}
function occupied(state, sessionId) { const count = state.sessions.find(item => item.id === sessionId)?.reservedCount; if (Number.isInteger(count)) return count; return state.reservations.filter(x => x.sessionId === sessionId && x.status === 'confirmed').length; }
function sessionStart(session) { return new Date(`${session.date}T${session.time}:00-03:00`).getTime(); }
function promoteWaitlist(state, session) {
  if (occupied(state, session.id) >= session.capacity) return null;
  const candidate = state.waitlist.filter(x => x.sessionId === session.id && x.status === 'waiting' && !state.reservations.some(r => r.studentId === x.studentId && r.status === 'confirmed' && overlaps(state.sessions.find(s => s.id === r.sessionId) || {}, session))).sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  if (!candidate) return null;
  candidate.status = 'promoted'; candidate.promotedAt = nowIso();
  const reservation = { id: newId('reservation'), sessionId: session.id, disciplineId: session.disciplineId, studentId: candidate.studentId, status: 'confirmed', createdAt: nowIso(), source: 'waitlist' };
  state.reservations.push(reservation);
  notify(state, candidate.studentId, 'Vaga liberada', `Sua reserva em “${session.topic}” foi confirmada automaticamente.`, 'success');
  return reservation;
}

export class MonitoringService {
  constructor(repository, { codeGenerator } = {}) { this.repository = repository; this.codeGenerator = codeGenerator || (() => { const bytes = new Uint32Array(1); globalThis.crypto.getRandomValues(bytes); return String(100000 + bytes[0] % 900000); }); }
  state() { return this.repository.read(); }
  listSessions(filters = {}) {
    const state = this.state();
    return state.sessions.filter(session => {
      const discipline = state.disciplines.find(x => x.id === session.disciplineId);
      const monitor = state.users.find(x => x.id === session.monitorId);
      const professor = state.users.find(x => x.id === session.professorId);
      const query = String(filters.query || '').toLocaleLowerCase('pt-BR');
      const text = `${discipline?.name} ${session.topic} ${monitor?.name} ${professor?.name}`.toLocaleLowerCase('pt-BR');
      return !session.archived && session.status !== 'cancelled' && (!filters.approvedOnly || sessionStart(session) > Date.now())
        && (!filters.approvedOnly || session.status === 'approved') && (!query || text.includes(query))
        && (!filters.semester || discipline?.semester === Number(filters.semester))
        && (!filters.disciplineId || session.disciplineId === filters.disciplineId)
        && (!filters.professorId || session.professorId === filters.professorId)
        && (!filters.modality || session.modality === filters.modality)
        && (!filters.date || session.date === filters.date) && (!filters.time || session.time === filters.time)
        && (!filters.monitorId || session.monitorId === filters.monitorId)
        && (!filters.availableOnly || occupied(state, session.id) < session.capacity);
    });
  }
  availableSpots(sessionId) { const state = this.state(); const session = state.sessions.find(x => x.id === sessionId); return session ? Math.max(0, session.capacity - occupied(state, sessionId)) : 0; }
  reserve({ sessionId, studentId }) {
    const state = this.state();
    if (!role(state, studentId, 'student')) throw new DomainError('FORBIDDEN', 'Somente alunos podem reservar monitorias.');
    const session = state.sessions.find(x => x.id === sessionId && !x.archived && x.status === 'approved');
    if (!session) throw new DomainError('SESSION_UNAVAILABLE', 'Sessão indisponível para reserva.');
    if (sessionStart(session) <= Date.now()) throw new DomainError('SESSION_PAST', 'Não é possível reservar uma sessão encerrada.');
    if (state.reservations.some(x => x.sessionId === sessionId && x.studentId === studentId && x.status === 'confirmed')) throw new DomainError('DUPLICATE_RESERVATION', 'O aluno já possui reserva nesta sessão.');
    if (occupied(state, sessionId) >= session.capacity) throw new DomainError('FULL_SESSION', 'A sessão está lotada. Entre na lista de espera.');
    const conflict = state.reservations.filter(x => x.studentId === studentId && x.status === 'confirmed').map(x => state.sessions.find(s => s.id === x.sessionId)).filter(Boolean).some(x => overlaps(x, session));
    if (conflict) throw new DomainError('SCHEDULE_CONFLICT', 'Já existe uma reserva no mesmo horário.');
    const reservation = { id: newId('reservation'), sessionId, disciplineId: session.disciplineId, studentId, status: 'confirmed', createdAt: nowIso(), source: 'direct' };
    state.reservations.push(reservation); notify(state, studentId, 'Reserva confirmada', `${session.topic} em ${session.date}, às ${session.time}.`, 'success'); audit(state, studentId, 'RESERVE', 'session', sessionId);
    this.repository.write(state); return reservation;
  }
  joinWaitlist({ sessionId, studentId }) {
    const state = this.state(); const session = state.sessions.find(x => x.id === sessionId && x.status === 'approved' && !x.archived);
    if (!session || !role(state, studentId, 'student')) throw new DomainError('FORBIDDEN', 'Lista de espera indisponível.');
    if (occupied(state, sessionId) < session.capacity) throw new DomainError('SPOTS_AVAILABLE', 'Há vaga disponível; faça a reserva diretamente.');
    if (sessionStart(session) <= Date.now()) throw new DomainError('SESSION_PAST', 'Monitoria encerrada.');
    if (state.reservations.some(x => x.sessionId === sessionId && x.studentId === studentId && x.status === 'confirmed')) throw new DomainError('DUPLICATE_RESERVATION', 'Você já possui reserva.');
    if (state.waitlist.some(x => x.sessionId === sessionId && x.studentId === studentId && x.status === 'waiting')) throw new DomainError('ALREADY_WAITING', 'Você já está na lista de espera.');
    const item = { id: newId('wait'), sessionId, disciplineId: session.disciplineId, studentId, status: 'waiting', createdAt: nowIso() };
    state.waitlist.push(item); notify(state, studentId, 'Lista de espera', `Você entrou na lista de “${session.topic}”.`); audit(state, studentId, 'JOIN_WAITLIST', 'session', sessionId); this.repository.write(state); return item;
  }
  cancelReservation({ reservationId, studentId, now = Date.now() }) {
    const state = this.state(); const reservation = state.reservations.find(x => x.id === reservationId && x.studentId === studentId && x.status === 'confirmed');
    if (!reservation) throw new DomainError('NOT_FOUND', 'Reserva ativa não encontrada.');
    const session = state.sessions.find(x => x.id === reservation.sessionId); const deadline = sessionStart(session) - Number(state.settings.cancellationWindowHours || 0) * 3_600_000;
    if (now > deadline) throw new DomainError('CANCELLATION_DEADLINE', `O cancelamento encerra ${state.settings.cancellationWindowHours} hora(s) antes da sessão.`);
    reservation.status = 'cancelled'; reservation.cancelledAt = nowIso(now); audit(state, studentId, 'CANCEL_RESERVATION', 'reservation', reservationId); promoteWaitlist(state, session); this.repository.write(state); return reservation;
  }
  toggleFavorite({ studentId, sessionId }) {
    const state = this.state(); if (!role(state, studentId, 'student')) throw new DomainError('FORBIDDEN', 'Ação exclusiva de aluno.');
    const index = state.favorites.findIndex(x => x.studentId === studentId && x.sessionId === sessionId);
    if (index >= 0) state.favorites.splice(index, 1); else state.favorites.push({ id: newId('favorite'), studentId, sessionId, createdAt: nowIso() });
    audit(state, studentId, index >= 0 ? 'UNFAVORITE' : 'FAVORITE', 'session', sessionId); this.repository.write(state); return index < 0;
  }
  recommendations(studentId) {
    const state = this.state(); const preferred = new Set(state.favorites.filter(x => x.studentId === studentId).map(x => state.sessions.find(s => s.id === x.sessionId)?.disciplineId).filter(Boolean));
    return this.listSessions({ approvedOnly: true }).sort((a, b) => Number(preferred.has(b.disciplineId)) - Number(preferred.has(a.disciplineId))).slice(0, 3);
  }
  saveSession({ actorId, session }) {
    const state = this.state(); if (!role(state, actorId, 'monitor') || !monitorOwns(state, actorId, session.disciplineId)) throw new DomainError('FORBIDDEN', 'Monitor não vinculado à disciplina.');
    const link = state.monitorDisciplines.find(x => x.monitorId === actorId && x.disciplineId === session.disciplineId && x.active);
    required(session.topic, 'TOPIC_REQUIRED', 'Informe o assunto da sessão.'); required(session.date, 'DATE_REQUIRED', 'Informe a data.'); required(session.time, 'TIME_REQUIRED', 'Informe o horário.');
    if (!validDate(session.date)) throw new DomainError('INVALID_DATE', 'Use uma data válida no formato AAAA-MM-DD.');
    if (!validTime(session.time)) throw new DomainError('INVALID_TIME', 'Use um horário válido no formato HH:MM.');
    const durationMinutes = Number(session.durationMinutes ?? 60); const capacity = Number(session.capacity ?? 1);
    if (!Number.isFinite(durationMinutes) || durationMinutes < 15) throw new DomainError('INVALID_DURATION', 'A duração deve ser de pelo menos 15 minutos.');
    if (!Number.isInteger(capacity) || capacity < 1) throw new DomainError('INVALID_CAPACITY', 'A quantidade de vagas deve ser um inteiro positivo.');
    if (session.monitoringUrl && !validHttpsUrl(session.monitoringUrl)) throw new DomainError('INVALID_URL', 'O link da monitoria deve usar HTTPS.');
    if (!['Presencial', 'Online'].includes(session.modality || 'Presencial')) throw new DomainError('INVALID_MODALITY', 'Modalidade inválida.');
    if (new Date(session.date + 'T' + session.time + ':00-03:00').getTime() <= Date.now()) throw new DomainError('SESSION_PAST', 'Informe uma data futura.');
    if (session.linkValidUntil && Number.isNaN(new Date(session.linkValidUntil).getTime())) throw new DomainError('INVALID_LINK_EXPIRY', 'Informe uma validade de link válida.');
    const previous = state.sessions.find(x => x.id === session.id);
    if (previous && state.reservations.some(r => r.sessionId === previous.id && r.status === 'confirmed' && state.reservations.some(other => other.studentId === r.studentId && other.sessionId !== previous.id && other.status === 'confirmed' && overlaps(state.sessions.find(s => s.id === other.sessionId) || {}, session)))) throw new DomainError('SCHEDULE_CONFLICT', 'A alteração conflita com outra reserva dos participantes.');
    if (previous && capacity < occupied(state, previous.id)) throw new DomainError('CAPACITY_BELOW_OCCUPIED', 'As vagas não podem ser menores que as reservas confirmadas.');
    const saved = { id: session.id || newId('session'), disciplineId: session.disciplineId, monitorId: actorId, professorId: link.professorId, topic: session.topic.trim(), description: String(session.description || '').trim(), date: session.date, time: session.time, durationMinutes, modality: session.modality || 'Presencial', location: session.location || '', capacity, monitoringUrl: session.monitoringUrl || '', linkValidUntil: session.linkValidUntil || '', status: 'pending', archived: false };
    if (previous) {
      if (previous.monitorId !== actorId) throw new DomainError('FORBIDDEN', 'A sessão pertence a outro monitor.'); state.sessions[state.sessions.findIndex(x => x.id === saved.id)] = saved;
      state.reservations.filter(x => x.sessionId === saved.id && x.status === 'confirmed').forEach(x => notify(state, x.studentId, 'Monitoria alterada', `Confira os novos dados de “${saved.topic}”.`, 'warning', saved.id));
    } else state.sessions.push(saved);
    notify(state, saved.professorId, previous ? 'Sessão alterada' : 'Nova sessão para validar', `${saved.topic} aguarda validação.`, 'warning'); audit(state, actorId, previous ? 'UPDATE_SESSION' : 'CREATE_SESSION', 'session', saved.id); this.repository.write(state); return saved;
  }
  archiveSession({ actorId, sessionId }) {
    const state = this.state(); const session = state.sessions.find(x => x.id === sessionId); if (!session || session.monitorId !== actorId) throw new DomainError('FORBIDDEN', 'A sessão não pertence ao monitor.');
    session.archived = true; session.status = 'cancelled'; state.reservations.filter(x => x.sessionId === sessionId && x.status === 'confirmed').forEach(x => { x.status = 'cancelled'; notify(state, x.studentId, 'Monitoria cancelada', `${session.topic} foi cancelada.`, 'error', session.id); });
    audit(state, actorId, 'ARCHIVE_SESSION', 'session', sessionId); this.repository.write(state); return session;
  }
  generateAttendanceCode({ actorId, sessionId, now = Date.now(), lifetimeMinutes = 20 }) {
    const state = this.state(); const session = state.sessions.find(x => x.id === sessionId && !x.archived && x.status === 'approved'); if (!session || session.monitorId !== actorId) throw new DomainError('FORBIDDEN', 'Somente o monitor responsável por uma sessão aprovada pode gerar o código.');
    const record = { id: newId('code'), sessionId, code: this.codeGenerator(), createdBy: actorId, createdAt: nowIso(now), expiresAt: nowIso(now + lifetimeMinutes * 60_000), active: true };
    state.attendanceCodes.forEach(x => { if (x.sessionId === sessionId) x.active = false; }); state.attendanceCodes.push(record); audit(state, actorId, 'GENERATE_ATTENDANCE_CODE', 'session', sessionId); this.repository.write(state); return record;
  }
  registerAttendance({ studentId, sessionId, code, now = Date.now() }) {
    const state = this.state(); const reservation = state.reservations.find(x => x.studentId === studentId && x.sessionId === sessionId && x.status === 'confirmed');
    if (!reservation) throw new DomainError('RESERVATION_REQUIRED', 'É necessário possuir reserva confirmada nesta sessão.'); if (state.attendance.some(x => x.studentId === studentId && x.sessionId === sessionId)) throw new DomainError('DUPLICATE_ATTENDANCE', 'A presença já foi registrada nesta sessão.');
    const valid = state.attendanceCodes.find(x => x.sessionId === sessionId && x.code === String(code).trim() && x.active); if (!valid) throw new DomainError('INVALID_CODE', 'Código de presença inválido para esta sessão.'); if (new Date(valid.expiresAt).getTime() <= now) throw new DomainError('EXPIRED_CODE', 'O código de presença expirou.');
    const item = { id: newId('attendance'), sessionId, disciplineId: reservation.disciplineId, studentId, reservationId: reservation.id, status: 'present', source: 'code', updatedBy: studentId, registeredAt: nowIso(now) };
    state.attendance.push(item); audit(state, studentId, 'REGISTER_ATTENDANCE', 'session', sessionId); this.repository.write(state); return item;
  }
  setAttendance({ monitorId, sessionId, studentId, status }) {
    const state = this.state(); const session = state.sessions.find(x => x.id === sessionId); if (!session || session.monitorId !== monitorId || !['present', 'absent'].includes(status)) throw new DomainError('FORBIDDEN', 'Atualização de presença não autorizada.');
    const reservation = state.reservations.find(x => x.sessionId === sessionId && x.studentId === studentId && x.status === 'confirmed'); if (!reservation) throw new DomainError('RESERVATION_REQUIRED', 'Participante sem reserva confirmada.');
    let item = state.attendance.find(x => x.sessionId === sessionId && x.studentId === studentId);
    if (item) Object.assign(item, { status, source: 'manual', updatedBy: monitorId, registeredAt: nowIso() }); else { item = { id: newId('attendance'), sessionId, disciplineId: session.disciplineId, studentId, reservationId: reservation.id, status, source: 'manual', updatedBy: monitorId, registeredAt: nowIso() }; state.attendance.push(item); }
    audit(state, monitorId, 'SET_ATTENDANCE', 'session', sessionId, { studentId, status }); this.repository.write(state); return item;
  }
  saveMaterial({ actorId, material }) {
    const state = this.state(); if (!role(state, actorId, 'monitor') || !monitorOwns(state, actorId, material.disciplineId)) throw new DomainError('FORBIDDEN', 'Monitor não vinculado à disciplina.');
    const link = state.monitorDisciplines.find(x => x.monitorId === actorId && x.disciplineId === material.disciplineId && x.active); required(material.title, 'TITLE_REQUIRED', 'Informe o título do material.'); required(material.url, 'URL_REQUIRED', 'Informe o link do material.');
    if (!validHttpsUrl(material.url)) throw new DomainError('INVALID_URL', 'O endereço do material deve usar HTTPS.');
    const previous = state.materials.find(x => x.id === material.id); const saved = { id: material.id || newId('material'), disciplineId: material.disciplineId, monitorId: actorId, professorId: link.professorId, title: material.title.trim(), type: material.type || 'Link', url: material.url.trim(), status: 'pending', archived: false };
    if (previous) { if (previous.monitorId !== actorId) throw new DomainError('FORBIDDEN', 'O material pertence a outro monitor.'); state.materials[state.materials.findIndex(x => x.id === saved.id)] = saved; } else state.materials.push(saved);
    notify(state, saved.professorId, 'Material para validar', `${saved.title} aguarda validação.`, 'warning'); audit(state, actorId, previous ? 'UPDATE_MATERIAL' : 'CREATE_MATERIAL', 'material', saved.id); this.repository.write(state); return saved;
  }
  archiveMaterial({ actorId, materialId }) {
    const state = this.state(); const material = state.materials.find(x => x.id === materialId); if (!material || material.monitorId !== actorId) throw new DomainError('FORBIDDEN', 'O material pertence a outro monitor.'); material.archived = true; audit(state, actorId, 'ARCHIVE_MATERIAL', 'material', materialId); this.repository.write(state); return material;
  }
  decideApproval({ professorId, entityType, entityId, decision, comment = '' }) {
    const state = this.state(); if (!['session', 'material'].includes(entityType) || !['approved', 'rejected', 'adjustments_requested'].includes(decision)) throw new DomainError('INVALID_DECISION', 'Decisão de aprovação inválida.');
    const collection = entityType === 'session' ? state.sessions : state.materials; const entity = collection.find(x => x.id === entityId && !x.archived);
    if (!entity) throw new DomainError('NOT_FOUND', 'Item não encontrado.'); if (!role(state, professorId, 'professor') || entity.professorId !== professorId || !professorOwns(state, professorId, entity.disciplineId)) throw new DomainError('FORBIDDEN', 'Professor não vinculado à disciplina deste item.');
    if (entity.status !== 'pending') throw new DomainError('NOT_PENDING', 'O item já possui uma decisão acadêmica.'); if (decision === 'adjustments_requested' && !String(comment).trim()) throw new DomainError('COMMENT_REQUIRED', 'Descreva o ajuste solicitado.');
    entity.status = decision; const approval = { id: newId('approval'), entityType, entityId, disciplineId: entity.disciplineId, professorId, decision, comment: String(comment).trim(), decidedAt: nowIso() };
    state.approvals.push(approval); notify(state, entity.monitorId, decision === 'approved' ? 'Item aprovado' : decision === 'rejected' ? 'Item rejeitado' : 'Ajustes solicitados', `${entity.topic || entity.title}${comment ? ` — ${comment}` : ''}`, decision === 'approved' ? 'success' : 'warning');
    if (decision === 'approved' && entityType === 'material') state.users.filter(x => x.roles?.includes('student') && (!x.disciplineIds || x.disciplineIds.includes(entity.disciplineId))).forEach(x => notify(state, x.id, 'Novo material', entity.title, 'success'));
    audit(state, professorId, decision.toUpperCase(), entityType, entityId, { comment }); this.repository.write(state); return approval;
  }
  reportForProfessor(professorId, filters = {}) {
    const state = this.state(); const allowed = new Set(state.professorDisciplines.filter(x => x.professorId === professorId).map(x => x.disciplineId)); const disciplineIds = filters.disciplineId ? new Set([filters.disciplineId].filter(x => allowed.has(x))) : allowed;
    const sessions = state.sessions.filter(x => disciplineIds.has(x.disciplineId) && !x.archived && (!filters.startDate || x.date >= filters.startDate) && (!filters.endDate || x.date <= filters.endDate)); const ids = new Set(sessions.map(x => x.id)); const reservations = state.reservations.filter(x => ids.has(x.sessionId) && x.status === 'confirmed'); const attendance = state.attendance.filter(x => ids.has(x.sessionId) && x.status === 'present');
    const rows = [...disciplineIds].map(id => { const discipline = state.disciplines.find(x => x.id === id); const own = sessions.filter(x => x.disciplineId === id); const ownIds = new Set(own.map(x => x.id)); const reserved = reservations.filter(x => ownIds.has(x.sessionId)).length; const present = attendance.filter(x => ownIds.has(x.sessionId)).length; return { disciplineId: id, code: discipline?.code, name: discipline?.name, sessions: own.length, reservations: reserved, attendanceRate: reserved ? Math.round(present / reserved * 100) : 0 }; });
    return { disciplines: disciplineIds.size, sessions: sessions.length, reservations: reservations.length, attendanceRate: reservations.length ? Math.round(attendance.length / reservations.length * 100) : 0, pending: state.sessions.filter(x => disciplineIds.has(x.disciplineId) && x.status === 'pending' && !x.archived).length + state.materials.filter(x => disciplineIds.has(x.disciplineId) && x.status === 'pending' && !x.archived).length, rows };
  }
  exportReportCsv(professorId, filters = {}) { const report = this.reportForProfessor(professorId, filters); const escape = value => `"${String(/^[=+@\-\t\r]/.test(String(value ?? '')) ? "'" + value : value ?? '').replaceAll('"', '""')}"`; return ['Disciplina,Código,Sessões,Reservas,Presença (%)', ...report.rows.map(x => [x.name, x.code, x.sessions, x.reservations, x.attendanceRate].map(escape).join(','))].join('\n'); }
  validateMonitoringLink(sessionId, now = Date.now()) { const session = this.state().sessions.find(x => x.id === sessionId); if (!session?.monitoringUrl) throw new DomainError('LINK_UNAVAILABLE', 'Link não informado.'); if (session.linkValidUntil && new Date(session.linkValidUntil).getTime() <= now) throw new DomainError('LINK_EXPIRED', 'O link da monitoria expirou.'); return session.monitoringUrl; }
}
