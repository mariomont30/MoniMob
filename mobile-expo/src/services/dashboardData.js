import { activeAcademicLink, professorPendingItems } from '../domain/workflow.js';
export function dashboardItems(state, userId, role, kind, now=Date.now()) {
  const sessions=state.sessions || [];
  if(role==='professor') {
    const courses=new Set(state.professorDisciplines.filter(x=>x.professorId===userId&&activeAcademicLink(x)).map(x=>x.disciplineId));
    if(kind==='disciplines')return state.disciplines.filter(x=>courses.has(x.id)).map(x=>({id:x.id,label:x.name,detail:x.code,route:'academicLinks'}));
    if(kind==='pending')return professorPendingItems(state,userId).map(x=>({id:x.kind+'-'+x.id,label:x.topic||x.title||'Solicitação de vínculo',detail:state.disciplines.find(d=>d.id===x.disciplineId)?.name||'',route:x.kind==='link'?'academicLinks':'approvals',action:x.kind==='link'?'Analisar solicitação de vínculo':x.kind==='material'?'Analisar material':'Analisar monitoria'}));
    if(kind==='completed')return sessions.filter(x=>courses.has(x.disciplineId)&&!x.archived&&x.status==='approved'&&Date.parse(x.date+'T'+x.time+':00-03:00')+Number(x.durationMinutes||60)*60000<=now).map(x=>({id:x.id,label:x.topic,session:x}));
  }
  if(role==='monitor') {
    const own=sessions.filter(x=>x.monitorId===userId&&!x.archived);
    if(kind==='adjustments')return own.filter(x=>x.status==='adjustments_requested'||x.authorizationInvalid).map(x=>({id:x.id,label:x.topic,detail:x.authorizationInvalid?'Fora do período autorizado. Edite a monitoria ou solicite um novo vínculo.':'O professor solicitou ajustes.',route:'manageSessions',session:x}));
    if(kind==='participants')return state.reservations.filter(x=>x.status==='confirmed'&&own.some(s=>s.id===x.sessionId)).map(x=>({id:x.id,label:state.users.find(u=>u.id===x.studentId)?.name||'Participante',detail:own.find(s=>s.id===x.sessionId)?.topic,participantSessionId:x.sessionId}));
  }
  if(role==='student'&&kind==='reservations')return state.reservations.filter(x=>x.studentId===userId&&x.status==='confirmed').map(x=>({id:x.id,label:sessions.find(s=>s.id===x.sessionId)?.topic||'Monitoria indisponível',session:sessions.find(s=>s.id===x.sessionId),route:'agenda',detail:'Reserva confirmada'}));
  return [];
}
