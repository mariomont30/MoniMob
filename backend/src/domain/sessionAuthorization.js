export function authorizationForSession(session, links = []) {
  return links.filter(link => link.monitorId === session.monitorId && link.disciplineId === session.disciplineId && (!session.professorId || link.professorId === session.professorId)).sort((a,b)=>Number(b.active!==false)-Number(a.active!==false)||String(b.validFrom||'').localeCompare(String(a.validFrom||'')))[0];
}

export function sessionAuthorizationIssue(session, link, now = Date.now()) {
  const start = Date.parse(`${session.date}T${session.time}:00-03:00`);
  const end = start + Number(session.durationMinutes || 60) * 60000;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'Informe uma data, um horário e uma duração válidos.';
  if (end <= now) return null; // Renewals must not invalidate completed history.
  if (!link) return 'O monitor não possui autorização para esta disciplina.';
  if (link.active === false && end > now) return 'O vínculo desta monitoria foi encerrado.';
  if (link.validFrom && (!Number.isFinite(Date.parse(link.validFrom)) || start < Date.parse(link.validFrom))) return 'A monitoria começa antes do período autorizado pelo professor.';
  // Older imported links can lack a deadline. Current API publication still
  // requires an active, dated authorization; explicit deadlines always apply.
  if (link.validUntil && (!Number.isFinite(Date.parse(link.validUntil)) || end > Date.parse(link.validUntil))) return 'O início e o término da monitoria devem estar dentro do prazo autorizado pelo professor.';
  return null;
}

export function assertSessionAuthorization(session, link, now) {
  const message = sessionAuthorizationIssue(session, link, now);
  if (message) throw Object.assign(new Error(message), { code: 'SESSION_OUTSIDE_AUTHORIZATION', name: 'DomainError' });
}
