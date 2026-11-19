import { entityRevision, assertReviewVersion } from './review.js';
const id = (prefix) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const stamp = () => new Date().toISOString();
export const activeAcademicLink = (link) =>
  link.active !== false &&
  (!link.validFrom || Date.parse(link.validFrom) <= Date.now()) &&
  (!link.monitorId || Boolean(link.validUntil)) &&
  (!link.validUntil || Date.parse(link.validUntil) > Date.now());
export function professorPendingItems(s, uid) {
  return [
    ...(s.linkRequests || [])
      .filter((x) => x.professorId === uid && x.status === 'pending')
      .map((x) => ({ ...x, kind: 'link' })),
    ...s.sessions
      .filter(
        (x) =>
          x.professorId === uid &&
          !x.archived &&
          (x.status === 'pending' || x.status === 'approved' && (x.reviewPending || x.authorizationInvalid)),
      )
      .map((x) => ({ ...x, kind: 'session' })),
    ...s.materials
      .filter(
        (x) => x.professorId === uid && !x.archived && x.status === 'pending',
      )
      .map((x) => ({ ...x, kind: 'material' })),
  ];
}
const fail = (message, code = 'FORBIDDEN') => {
  throw Object.assign(new Error(message), {
    code,
    status: code === 'FORBIDDEN' ? 403 : 409,
  });
};
const member = (s, uid) => s.users.find((u) => u.id === uid && !u.disabled);
export const ownsCourse = (s, uid, course) =>
  s.professorDisciplines.some(
    (x) =>
      x.professorId === uid &&
      x.disciplineId === course &&
      activeAcademicLink(x),
  );
export const tutorsCourse = (s, uid, course) =>
  s.monitorDisciplines.some(
    (x) =>
      x.monitorId === uid && x.disciplineId === course && activeAcademicLink(x),
  );
const requireCourse = (s, course) => {
  const d = s.disciplines.find((x) => x.id === course && x.active !== false);
  if (!d) fail('Disciplina indisponível.', 'INVALID_DISCIPLINE');
  return d;
};
const notify = (s, uid, title, body) => {
  if (uid && member(s, uid))
    s.notifications.push({
      id: id('notice'),
      userId: uid,
      title,
      body,
      read: false,
      type: 'info',
      createdAt: stamp(),
    });
};
export function notifyMaterialPublished(s, material) {
  const recipients = new Set(
    s.users
      .filter(
        (user) =>
          !user.disabled &&
          user.roles?.includes('student') &&
          (!user.disciplineIds ||
            user.disciplineIds.includes(material.disciplineId)),
      )
      .map((user) => user.id),
  );
  s.monitorDisciplines
    .filter(
      (link) =>
        link.disciplineId === material.disciplineId && activeAcademicLink(link),
    )
    .forEach((link) => recipients.add(link.monitorId));
  recipients.delete(
    material.ownerId || material.monitorId || material.professorId,
  );
  for (const userId of recipients)
    notify(s, userId, 'Novo material', material.title);
}
export function academicEvent(s, actorId, action, entity, label, details = '') {
  s.academicEvents ||= [];
  s.academicEvents.push({
    id: id('activity'),
    actorId,
    disciplineId: entity.disciplineId,
    entityId: entity.id,
    action,
    label: String(label || ''),
    status: entity.status || '',
    fileName: entity.fileName || '',
    details: String(details || ''),
    createdAt: stamp(),
  });
}
function cancelSession(s, actorId, session, reason) {
  if (session.archived) return session;
  session.archived = true;
  session.status = 'cancelled';
  session.cancelledAt = stamp();
  for (const r of s.reservations.filter(
    (x) => x.sessionId === session.id && x.status === 'confirmed',
  )) {
    r.status = 'cancelled';
    r.cancelledAt = stamp();
    notify(
      s,
      r.studentId,
      'Monitoria cancelada',
      session.topic + ' — ' + reason,
    );
    academicEvent(s, actorId, 'RESERVATION_CANCELLED', session, session.topic);
  }
  for (const w of s.waitlist.filter(
    (x) =>
      x.sessionId === session.id && ['waiting', 'promoted'].includes(x.status),
  )) {
    w.status = 'cancelled';
    notify(s, w.studentId, 'Lista de espera encerrada', session.topic);
  }
  s.attendanceCodes
    .filter((x) => x.sessionId === session.id)
    .forEach((x) => (x.active = false));
  notify(
    s,
    session.monitorId,
    'Monitoria suspensa',
    session.topic + ' — ' + reason,
  );
  academicEvent(
    s,
    actorId,
    'SESSION_CANCELLED',
    session,
    session.topic,
    reason,
  );
  return session;
}
export const WORKFLOW_ACTIONS = new Set([
  'registerProfessorDiscipline',
  'requestMonitorLink',
  'decideMonitorLink',
  'revokeMonitorLink',
  'suspendSession',
  'saveMaterial',
  'deleteMaterial',
]);
export function applyWorkflow(s, identity, role, action, input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    fail('Dados inválidos.', 'INVALID_INPUT');
  s.linkRequests ||= [];
  s.academicEvents ||= [];
  const user = member(s, identity.sub);
  if (!user || !identity.roles.includes(role) || !user.roles?.includes(role))
    fail('Perfil não autorizado.');
  const uid = user.id;
  if (action === 'registerProfessorDiscipline') {
    if (role !== 'professor') fail('Ação exclusiva do professor.');
    requireCourse(s, input.disciplineId);
    const existing = s.professorDisciplines.find(
      (x) => x.professorId === uid && x.disciplineId === input.disciplineId,
    );
    if (existing && activeAcademicLink(existing)) return existing;
    const link = existing || {
      id: id('professor-link'),
      professorId: uid,
      disciplineId: input.disciplineId,
    };
    Object.assign(link, {
      active: true,
      createdAt: link.createdAt || stamp(),
      updatedAt: stamp(),
    });
    if (!existing) s.professorDisciplines.push(link);
    academicEvent(
      s,
      uid,
      'PROFESSOR_LINKED',
      link,
      'Professor vinculado à disciplina',
    );
    return link;
  }
  if (action === 'requestMonitorLink') {
    if (role !== 'monitor') fail('Ação exclusiva do monitor.');
    requireCourse(s, input.disciplineId);
    if (!member(s, input.professorId)?.roles?.includes('professor'))
      fail('Escolha um professor cadastrado e ativo.', 'INVALID_PROFESSOR');
    if (tutorsCourse(s, uid, input.disciplineId))
      fail(
        'Você já possui vínculo ativo nesta disciplina.',
        'LINK_ALREADY_ACTIVE',
      );
    const pending = s.linkRequests.find(
      (x) =>
        x.monitorId === uid &&
        x.disciplineId === input.disciplineId &&
        x.status === 'pending',
    );
    if (pending) return pending;
    const request = {
      id: id('request'),
      monitorId: uid,
      professorId: input.professorId,
      disciplineId: input.disciplineId,
      status: 'pending',
      message: String(input.message || '')
        .trim()
        .slice(0, 1000),
      requestedAt: stamp(),
    };
    s.linkRequests.push(request);
    notify(
      s,
      request.professorId,
      'Solicitação de monitor',
      user.name + ' solicitou vínculo com a disciplina.',
    );
    academicEvent(
      s,
      uid,
      'LINK_REQUESTED',
      request,
      'Solicitação de vínculo',
      request.message,
    );
    return request;
  }
  if (action === 'decideMonitorLink') {
    if (role !== 'professor') fail('Ação exclusiva do professor.');
    const request = s.linkRequests.find((x) => x.id === input.requestId);
    if (!request || request.professorId !== uid)
      fail('Solicitação destinada a outro professor.');
    requireCourse(s, request.disciplineId);
    if (!['approved', 'rejected'].includes(input.decision))
      fail('Decisão inválida.', 'INVALID_DECISION');
    if (request.status !== 'pending')
      fail('Esta solicitação já foi analisada.', 'NOT_PENDING');
    if (!member(s, request.monitorId)?.roles?.includes('monitor'))
      fail('A conta do monitor está indisponível.', 'MONITOR_UNAVAILABLE');
    if (input.decision === 'approved') {
      if (tutorsCourse(s, request.monitorId, request.disciplineId))
        fail(
          'O monitor já possui vínculo ativo nesta disciplina.',
          'LINK_ALREADY_ACTIVE',
        );
      const date = String(input.validUntil || '');
      const time = input.validUntilTime || '';
      if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
        fail('Selecione um horário limite válido.', 'INVALID_LINK_EXPIRY');
      const expiry = date + 'T' + (time ? time + ':00' : '23:59:59') + '-03:00';
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date ||
        Date.parse(expiry) <= Date.now()
      )
        fail(
          'Selecione uma validade futura para o vínculo.',
          'INVALID_LINK_EXPIRY',
        );
      // The addressed professor explicitly accepts supervision by approving.
      // No course assignment is granted merely by a tutor sending a request.
      if (!ownsCourse(s, uid, request.disciplineId))
        applyWorkflow(s, identity, role, 'registerProfessorDiscipline', {
          disciplineId: request.disciplineId,
        });
      const previous = s.monitorDisciplines.find(
        (x) =>
          x.monitorId === request.monitorId &&
          x.disciplineId === request.disciplineId,
      );
      const link = {
        id: previous?.id || id('monitor-link'),
        monitorId: request.monitorId,
        professorId: uid,
        disciplineId: request.disciplineId,
        active: true,
        validFrom: stamp(),
        validUntil: expiry,
        requestId: request.id,
      };
      if (previous) Object.assign(previous, link);
      else s.monitorDisciplines.push(link);
      request.validUntil = link.validUntil;
    }
    Object.assign(request, {
      status: input.decision,
      decidedAt: stamp(),
      comment: String(input.comment || '')
        .trim()
        .slice(0, 1000),
    });
    notify(
      s,
      request.monitorId,
      input.decision === 'approved' ? 'Vínculo aprovado' : 'Vínculo recusado',
      request.comment || 'Consulte a área de vínculos.',
    );
    academicEvent(
      s,
      uid,
      input.decision === 'approved' ? 'LINK_APPROVED' : 'LINK_REJECTED',
      request,
      'Análise de vínculo',
      [
        request.comment,
        request.validUntil
          ? 'Validade: ' +
            request.validUntil.slice(0, 10).split('-').reverse().join('/')
          : '',
      ]
        .filter(Boolean)
        .join(' · '),
    );
    return request;
  }
  if (action === 'revokeMonitorLink') {
    if (role !== 'professor') fail('Ação exclusiva do professor.');
    const link = s.monitorDisciplines.find((x) => x.id === input.linkId);
    if (
      !link ||
      link.professorId !== uid ||
      !ownsCourse(s, uid, link.disciplineId)
    )
      fail('Vínculo fora da sua supervisão.');
    if (link.active === false) return link;
    Object.assign(link, {
      active: false,
      revokedAt: stamp(),
      revokedBy: uid,
    });
    for (const session of s.sessions.filter(
      (x) =>
        x.monitorId === link.monitorId &&
        x.disciplineId === link.disciplineId &&
        !x.archived &&
        Date.parse(x.date + 'T' + x.time + ':00-03:00') > Date.now(),
    ))
      cancelSession(s, uid, session, 'Vínculo do monitor revogado.');
    notify(
      s,
      link.monitorId,
      'Vínculo revogado',
      'Novas publicações nesta disciplina foram desabilitadas.',
    );
    academicEvent(s, uid, 'LINK_REVOKED', link, 'Vínculo de monitor revogado');
    return link;
  }
  if (action === 'suspendSession') {
    if (role !== 'professor') fail('Ação exclusiva do professor.');
    const session = s.sessions.find((x) => x.id === input.sessionId);
    if (!session || !ownsCourse(s, uid, session.disciplineId))
      fail('Monitoria fora das suas disciplinas.');
    if (
      Date.parse(session.date + 'T' + session.time + ':00-03:00') <= Date.now()
    )
      fail(
        'O histórico de uma monitoria iniciada deve ser preservado.',
        'SESSION_STARTED',
      );
    return cancelSession(
      s,
      uid,
      session,
      String(input.comment || 'Suspensa pela supervisão.')
        .trim()
        .slice(0, 1000),
    );
  }
  if (action === 'saveMaterial')
    return saveAcademicMaterial(s, identity, role, input.material);
  if (action === 'deleteMaterial') {
    if (!['monitor', 'professor'].includes(role))
      fail('Perfil sem permissão para excluir materiais.');
    const material = s.materials.find((x) => x.id === input.materialId);
    if (
      !material ||
      !(role === 'monitor'
        ? (material.ownerId || material.monitorId) === uid
        : ownsCourse(s, uid, material.disciplineId))
    )
      fail('Você não pode excluir este material.');
    if (material.status === 'deleted') return material;
    Object.assign(material, {
      archived: true,
      status: 'deleted',
      deletedAt: stamp(),
      deletedBy: uid,
      storageDeletionPending: Boolean(material.fileId),
    });
    delete material.url;
    academicEvent(s, uid, 'MATERIAL_DELETED', material, material.title);
    notify(
      s,
      material.ownerId || material.monitorId,
      'Material excluído',
      material.title + ' foi removido do acesso.',
    );
    return material;
  }
  fail('Operação indisponível.', 'UNKNOWN_ACTION');
}
export function saveAcademicMaterial(s, identity, role, material, file = null) {
  const uid = identity.sub,
    user = member(s, uid);
  if (
    !user ||
    !identity.roles.includes(role) ||
    !user.roles?.includes(role) ||
    !['professor', 'monitor'].includes(role)
  )
    fail('Perfil não autorizado.');
  if (
    !material ||
    typeof material.title !== 'string' ||
    !material.title.trim() ||
    material.title.trim().length > 200
  )
    fail('Informe um título de até 200 caracteres.', 'TITLE_REQUIRED');
  requireCourse(s, material.disciplineId);
  if (
    role === 'professor'
      ? !ownsCourse(s, uid, material.disciplineId)
      : !tutorsCourse(s, uid, material.disciplineId)
  )
    fail('Vincule-se à disciplina antes de publicar materiais.');
  const prior = s.materials.find((x) => x.id === material.id);
  if (material.id && !prior) fail('Material não encontrado.', 'NOT_FOUND');
  if (
    prior &&
    ((prior.ownerId || prior.monitorId || prior.professorId) !== uid ||
      prior.status === 'deleted')
  )
    fail('Somente o autor pode editar um material disponível.');
  if (prior) assertReviewVersion(prior, material.expectedRevision);
  if (prior && prior.disciplineId !== material.disciplineId)
    fail(
      'A disciplina do material não pode ser alterada.',
      'INVALID_DISCIPLINE',
    );
  const keepFile = Boolean(
    prior?.fileId && !file && material.keepExistingFile === true,
  );
  if (!file && !keepFile) {
    let valid = false;
    try {
      const url = new URL(String(material.url || ''));
      valid = url.protocol === 'https:' && !url.username && !url.password;
    } catch {}
    if (!valid)
      fail(
        'Informe um link HTTPS válido ou selecione um arquivo.',
        'INVALID_URL',
      );
  }
  if (prior?.fileId && !file && !keepFile)
    fail(
      'Selecione o arquivo corrigido ou mantenha o arquivo atual.',
      'FILE_REPLACEMENT_REQUIRED',
    );
  const currentFile =
    file ||
    (keepFile
      ? {
          id: prior.fileId,
          name: prior.fileName,
          size: prior.fileSize,
          mimeType: prior.mimeType,
        }
      : null);
  const obsoleteFileIds = [
    ...new Set([
      ...(prior?.obsoleteFileIds || []),
      ...(prior?.fileId && file && prior.fileId !== file.id
        ? [prior.fileId]
        : []),
    ]),
  ].filter((id) => id !== currentFile?.id);
  const link = s.monitorDisciplines.find(
    (x) =>
      x.monitorId === uid &&
      x.disciplineId === material.disciplineId &&
      activeAcademicLink(x),
  );
  const saved = {
    id: prior?.id || id('material'),
    disciplineId: material.disciplineId,
    ownerId: uid,
    ownerRole: role,
    monitorId: role === 'monitor' ? uid : null,
    professorId: role === 'professor' ? uid : link.professorId,
    title: material.title.trim(),
    revision: prior ? entityRevision(prior) + 1 : 1,
    reviewSequence: Number(prior?.reviewSequence || 0),
    obsoleteFileIds,
    fileCleanupPending: obsoleteFileIds.length > 0,
    type: currentFile
      ? 'Arquivo'
      : String(material.type || 'Link').slice(0, 40),
    status: role === 'professor' ? 'approved' : 'pending',
    archived: false,
    createdAt: prior?.createdAt || stamp(),
    updatedAt: stamp(),
  };
  if (currentFile)
    Object.assign(saved, {
      fileId: currentFile.id,
      fileName: currentFile.name,
      fileSize: currentFile.size,
      mimeType: currentFile.mimeType,
    });
  else saved.url = String(material.url).trim();
  if (prior) {
    Object.assign(prior, saved);
    if (currentFile) delete prior.url;
  } else s.materials.push(saved);
  if (role === 'monitor')
    notify(
      s,
      saved.professorId,
      'Material para validar',
      saved.title + ' aguarda sua análise.',
    );
  else notifyMaterialPublished(s, saved);
  academicEvent(
    s,
    uid,
    prior ? 'MATERIAL_UPDATED' : 'MATERIAL_CREATED',
    saved,
    saved.title,
    'Revisão ' + saved.revision,
  );
  return saved;
}
const actionNames = {
  PROFESSOR_LINKED: 'Professor vinculado',
  LINK_REQUESTED: 'Vínculo solicitado',
  LINK_APPROVED: 'Vínculo aprovado',
  LINK_REJECTED: 'Vínculo recusado',
  LINK_REVOKED: 'Vínculo revogado',
  LINK_CANCELLED: 'Solicitação encerrada',
  SESSION_PUBLISHED: 'Monitoria publicada',
  SESSION_UPDATED: 'Monitoria alterada',
  SESSION_CANCELLED: 'Monitoria cancelada',
  MATERIAL_CREATED: 'Material cadastrado',
  MATERIAL_UPDATED: 'Material alterado',
  MATERIAL_DELETED: 'Material excluído',
  APPROVED: 'Aprovado',
  REJECTED: 'Recusado',
  ADJUSTMENTS_REQUESTED: 'Ajustes solicitados',
  RESERVATION_CREATED: 'Reserva criada',
  RESERVATION_CANCELLED: 'Reserva cancelada',
  ATTENDANCE_RECORDED: 'Presença registrada',
};
const reportStatus = (status) =>
  ({
    pending: 'Pendente',
    approved: 'Aprovado',
    rejected: 'Recusado',
    cancelled: 'Cancelado',
    deleted: 'Excluído',
    adjustments_requested: 'Ajustes solicitados',
    present: 'Presente',
    absent: 'Ausente',
    confirmed: 'Confirmado',
  })[status] ||
  status ||
  '';
const localDay = (value) => {
  const date = Date.parse(value);
  return Number.isFinite(date)
    ? new Date(date - 10800000).toISOString().slice(0, 10)
    : '';
};
export function academicReport(s, professorId, filters = {}) {
  if (!member(s, professorId)?.roles?.includes('professor'))
    fail('Relatório exclusivo do professor.');
  const courses = new Set(
    s.professorDisciplines
      .filter((x) => x.professorId === professorId && activeAcademicLink(x))
      .map((x) => x.disciplineId),
  );
  const permitted = (course) =>
    courses.has(course) &&
    (!filters.disciplineId || course === filters.disciplineId);
  const addressedRequests = new Set(
    (s.linkRequests || [])
      .filter(
        (x) =>
          x.professorId === professorId &&
          (!filters.disciplineId || x.disciplineId === filters.disciplineId),
      )
      .map((x) => x.id),
  );
  const inPeriod = (date) => {
    const day = localDay(date);
    return (
      (!filters.startDate && !filters.endDate) ||
      (day &&
        (!filters.startDate || day >= filters.startDate) &&
        (!filters.endDate || day <= filters.endDate))
    );
  };
  const activityRows = (s.academicEvents || [])
    .filter(
      (x) =>
        (permitted(x.disciplineId) || addressedRequests.has(x.entityId)) &&
        inPeriod(x.createdAt),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((x) => ({
      ...x,
      actionLabel: actionNames[x.action] || x.action,
      responsible:
        s.users.find((u) => u.id === x.actorId)?.name || 'Conta excluída',
    }));
  const materials = s.materials.filter(
    (x) =>
      permitted(x.disciplineId) &&
      inPeriod(x.deletedAt || x.updatedAt || x.createdAt),
  );
  const requests = (s.linkRequests || []).filter(
    (x) =>
      (permitted(x.disciplineId) || addressedRequests.has(x.id)) &&
      inPeriod(x.decidedAt || x.requestedAt),
  );
  return {
    activityRows,
    materialsCount: materials.length,
    deletedMaterials: materials.filter((x) => x.status === 'deleted').length,
    linkRequests: requests.length,
  };
}
export function workflowReportCsv(s, professorId, filters, summary) {
  const extra = academicReport(s, professorId, filters);
  const cell = (value) =>
    '"' +
    String(
      /^[=+@\-\t\r]/.test(String(value ?? '')) ? "'" + value : (value ?? ''),
    ).replaceAll('"', '""') +
    '"';
  const header =
    'Disciplina,Código,Sessões,Reservas,Presença (%),Registro,Situação,Item,Responsável,Data,Arquivo,Detalhes,Sessões publicadas no período,Vagas ofertadas,Reservas no período,Em espera,Demanda,Ocupação (%)';
  const rows = summary.rows.map((x) => [
    x.name,
    x.code,
    x.sessions,
    x.reservations,
    x.attendanceRate,
    'Resumo',
    '',
    '',
    '',
    '',
    '',
    '',
    x.scheduledSessions,
    x.capacity,
    x.bookedPlaces,
    x.waiting,
    x.demand,
    x.occupancyRate,
  ]);
  for (const e of extra.activityRows) {
    const d = s.disciplines.find((x) => x.id === e.disciplineId);
    rows.push([
      d?.name,
      d?.code,
      '',
      '',
      '',
      e.actionLabel,
      reportStatus(e.status),
      e.label,
      e.responsible,
      new Date(e.createdAt).toLocaleString('pt-BR', {
        timeZone: 'America/Fortaleza',
      }),
      e.fileName,
      e.details,
    ]);
  }
  // Include legacy and current records as snapshots as well as action history.
  const allowed = new Set(
    s.professorDisciplines
      .filter((x) => x.professorId === professorId && activeAcademicLink(x))
      .map((x) => x.disciplineId),
  );
  for (const m of s.materials.filter(
    (x) =>
      allowed.has(x.disciplineId) &&
      (!filters.disciplineId || x.disciplineId === filters.disciplineId),
  )) {
    const day = localDay(m.deletedAt || m.updatedAt || m.createdAt);
    if (
      (filters.startDate || filters.endDate) &&
      (!day ||
        (filters.startDate && day < filters.startDate) ||
        (filters.endDate && day > filters.endDate))
    )
      continue;
    const d = s.disciplines.find((x) => x.id === m.disciplineId);
    rows.push([
      d?.name,
      d?.code,
      '',
      '',
      '',
      'Estado do material',
      reportStatus(m.status),
      m.title,
      s.users.find((x) => x.id === (m.ownerId || m.monitorId || m.professorId))
        ?.name || 'Conta excluída',
      day,
      m.fileName || 'Link',
      m.status === 'deleted'
        ? 'Arquivo indisponível; registro histórico preservado.'
        : m.type,
    ]);
  }
  return [header, ...rows.map((row) => Array.from({ length: 18 }, (_, index) => cell(row[index])).join(','))].join('\n');
}
