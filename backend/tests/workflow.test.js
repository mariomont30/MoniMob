import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, applyAction, visibleState } from '../src/academicService.js';
import { saveAcademicMaterial, academicReport, workflowReportCsv } from '../src/domain/workflow.js';
import { prepareAccountDeletion } from '../src/accountDeletion.js';
const professor = {
    sub: 'p',
    roles: ['professor']
  },
  monitor = {
    sub: 'm',
    roles: ['monitor']
  },
  student = {
    sub: 's',
    roles: ['student']
  };
const actor = role => ({
  professor,
  monitor,
  student
})[role];
function fresh() {
  const s = emptyState();
  s.users = [{
    id: 'p',
    name: 'Professor',
    roles: ['professor'],
    email: 'private@unifor.br'
  }, {
    id: 'm',
    name: 'Monitor',
    roles: ['monitor']
  }, {
    id: 's',
    name: 'Aluno',
    roles: ['student']
  }, {
    id: 'other',
    name: 'Outro',
    roles: ['monitor', 'professor']
  }];
  s.disciplines = [{
    id: 'course',
    code: 'C',
    name: 'Disciplina',
    active: true
  }, {
    id: 'foreign',
    code: 'F',
    name: 'Outra'
  }];
  return s;
}
function run(s, role, action, input) {
  return applyAction(s, actor(role), role, action, input);
}
function link(s) {
  run(s, 'professor', 'registerProfessorDiscipline', {
    disciplineId: 'course'
  });
  const request = run(s, 'monitor', 'requestMonitorLink', {
    disciplineId: 'course',
    professorId: 'p'
  });
  run(s, 'professor', 'decideMonitorLink', {
    requestId: request.id,
    decision: 'approved',
    validUntil: '2099-12-31'
  });
  return request;
}
const material = {
  disciplineId: 'course',
  title: 'Material',
  url: 'https://firebase.google.com/docs'
};
test('professor bootstraps course and monitor requests before having a session or link', () => {
  const s = fresh();
  const first = run(s, 'professor', 'registerProfessorDiscipline', {
    disciplineId: 'course'
  });
  assert.equal(run(s, 'professor', 'registerProfessorDiscipline', {
    disciplineId: 'course'
  }).id, first.id);
  assert.equal(s.professorDisciplines.length, 1);
  const view = visibleState(s, monitor, 'monitor');
  assert.equal(view.professorDisciplines.length, 1);
  assert.equal(view.users.find(x => x.id === 'p').email, undefined);
  const request = run(s, 'monitor', 'requestMonitorLink', {
    disciplineId: 'course',
    professorId: 'p',
    message: 'Solicitação'
  });
  assert.equal(s.monitorDisciplines.length, 0);
  assert.equal(request.status, 'pending');
  assert.equal(run(s, 'monitor', 'requestMonitorLink', {
    disciplineId: 'course',
    professorId: 'p'
  }).id, request.id);
  assert.equal(s.notifications.filter(x => x.userId === 'p').length, 1);
});
test('students, forged professors, disabled accounts and invalid input cannot assign a monitor', () => {
  const s = fresh();
  assert.throws(() => run(s, 'student', 'registerProfessorDiscipline', {
    disciplineId: 'course'
  }));
  assert.throws(() => run(s, 'monitor', 'requestMonitorLink', {
    disciplineId: 'course',
    professorId: 'm'
  }));
  assert.throws(() => run(s, 'professor', 'registerProfessorDiscipline', null));
  s.users[0].disabled = true;
  assert.throws(() => run(s, 'professor', 'registerProfessorDiscipline', {
    disciplineId: 'course'
  }));
});
test('only responsible professor approves; invalid, expired and rolled-over calendar dates fail', () => {
  const s = fresh();
  run(s, 'professor', 'registerProfessorDiscipline', {
    disciplineId: 'course'
  });
  const r = run(s, 'monitor', 'requestMonitorLink', {
    disciplineId: 'course',
    professorId: 'p'
  });
  assert.throws(() => applyAction(s, {
    sub: 'other',
    roles: ['professor']
  }, 'professor', 'decideMonitorLink', {
    requestId: r.id,
    decision: 'approved',
    validUntil: '2099-12-31'
  }));
  for (const validUntil of ['2099-02-31', '2000-01-01', 'nonsense']) assert.throws(() => run(s, 'professor', 'decideMonitorLink', {
    requestId: r.id,
    decision: 'approved',
    validUntil
  }), e => e.code === 'INVALID_LINK_EXPIRY');
  run(s, 'professor', 'decideMonitorLink', {
    requestId: r.id,
    decision: 'rejected',
    comment: 'Sem vaga'
  });
  assert.equal(s.monitorDisciplines.length, 0);
  assert.throws(() => run(s, 'professor', 'decideMonitorLink', {
    requestId: r.id,
    decision: 'approved',
    validUntil: '2099-12-31'
  }));
});
test('approved monitor publishes immediately and student can reserve; professor suspension notifies and cancels', () => {
  const s = fresh();
  link(s);
  const saved = run(s, 'monitor', 'saveSession', {
    session: {
      disciplineId: 'course',
      topic: 'Encontro',
      date: '2090-01-01',
      time: '12:00',
      capacity: 2,
      modality: 'Presencial',
      location: 'Sala',
      durationMinutes: 60
    }
  });
  assert.equal(saved.status, 'approved');
  assert.ok(visibleState(s, student, 'student').sessions.some(x => x.id === saved.id));
  run(s, 'student', 'reserve', {
    sessionId: saved.id
  });
  run(s, 'professor', 'suspendSession', {
    sessionId: saved.id
  });
  assert.equal(s.reservations[0].status, 'cancelled');
  assert.equal(s.sessions[0].status, 'cancelled');
  assert.ok(s.notifications.some(x => x.userId === 's' && x.title === 'Monitoria cancelada'));
});
test('revocation cancels future sessions and denies new publications', () => {
  const s = fresh();
  link(s);
  run(s, 'monitor', 'saveSession', {
    session: {
      disciplineId: 'course',
      topic: 'Encontro',
      date: '2090-01-01',
      time: '12:00',
      capacity: 2,
      location: 'Sala'
    }
  });
  run(s, 'professor', 'revokeMonitorLink', {
    linkId: s.monitorDisciplines[0].id
  });
  assert.equal(s.sessions[0].archived, true);
  assert.throws(() => run(s, 'monitor', 'saveMaterial', {
    material
  }));
  assert.ok(s.academicEvents.some(x => x.action === 'LINK_REVOKED'));
});
test('professor material publishes directly; tutor material requires review and cannot forge a file reference', () => {
  const s = fresh();
  link(s);
  const direct = run(s, 'professor', 'saveMaterial', {
    material
  });
  assert.equal(direct.status, 'approved');
  const pending = run(s, 'monitor', 'saveMaterial', {
    material: {
      ...material,
      title: 'Monitor',
      fileId: 'forged',
      ownerId: 'p'
    }
  });
  assert.equal(pending.status, 'pending');
  assert.equal(pending.fileId, undefined);
  assert.equal(pending.ownerId, 'm');
  assert.equal(visibleState(s, student, 'student').materials.length, 1);
  run(s, 'professor', 'decideApproval', {
    entityType: 'material',
    entityId: pending.id,
    decision: 'approved'
  });
  assert.equal(visibleState(s, student, 'student').materials.length, 2);
});
test('monitor only deletes own, professor only supervised and deletion preserves report metadata', () => {
  const s = fresh();
  link(s);
  const own = run(s, 'professor', 'saveMaterial', {
    material
  });
  assert.throws(() => run(s, 'monitor', 'deleteMaterial', {
    materialId: own.id
  }));
  const pending = run(s, 'monitor', 'saveMaterial', {
    material
  });
  assert.throws(() => applyAction(s, {
    sub: 'other',
    roles: ['professor']
  }, 'professor', 'deleteMaterial', {
    materialId: pending.id
  }));
  s.monitorDisciplines[0].active = false;
  run(s, 'monitor', 'deleteMaterial', {
    materialId: pending.id
  });
  assert.equal(pending.status, 'deleted');
  assert.equal(pending.url, undefined);
  assert.equal(visibleState(s, student, 'student').materials.some(x => x.id === pending.id), false);
  assert.equal(academicReport(s, 'p').deletedMaterials, 1);
  assert.equal(visibleState(s, monitor, 'monitor').materials[0].status, 'deleted');
});
test('file replacement cleans old URL, references cannot be edited and history respects course and local date', () => {
  const s = fresh();
  link(s);
  const prior = run(s, 'professor', 'saveMaterial', {
    material
  });
  saveAcademicMaterial(s, professor, 'professor', {
    ...material,
    id: prior.id
  }, {
    id: 'file',
    name: 'a.pdf',
    size: 123,
    mimeType: 'application/pdf'
  });
  assert.equal(prior.url, undefined);
  assert.throws(() => run(s, 'professor', 'saveMaterial', {
    material: {
      ...material,
      id: prior.id
    }
  }));
  s.academicEvents.push({
    id: 'boundary',
    actorId: 'm',
    disciplineId: 'course',
    action: 'LINK_REQUESTED',
    label: 'Boundary',
    createdAt: '2026-11-02T01:00:00Z'
  }, {
    id: 'foreign',
    actorId: 'm',
    disciplineId: 'foreign',
    action: 'LINK_REQUESTED',
    label: 'Private',
    createdAt: '2026-11-02T12:00:00Z'
  });
  const report = academicReport(s, 'p', {
    startDate: '2026-11-01',
    endDate: '2026-11-01'
  });
  assert.ok(report.activityRows.some(x => x.id === 'boundary'));
  assert.ok(!report.activityRows.some(x => x.id === 'foreign'));
});
test('CSV links decisions, files and deletions, keeps uniform columns and escapes formula injection', () => {
  const s = fresh();
  link(s);
  const saved = run(s, 'professor', 'saveMaterial', {
    material: {
      ...material,
      title: '=SUM(1,2)'
    }
  });
  run(s, 'professor', 'deleteMaterial', {
    materialId: saved.id
  });
  const csv = workflowReportCsv(s, 'p', {}, {
    rows: []
  });
  assert.match(csv, /Vínculo aprovado/);
  assert.match(csv, /Material excluído/);
  assert.match(csv, /'=SUM\(1,2\)/);
  assert.match(csv, /Estado do material/);
  assert.doesNotMatch(csv, /private@/);
  assert.equal(academicReport(s, 'p', {
    disciplineId: 'foreign'
  }).activityRows.length, 0);
});
test('account deletion cancels pending link request and informs counterpart', () => {
  const s = fresh();
  run(s, 'professor', 'registerProfessorDiscipline', {
    disciplineId: 'course'
  });
  run(s, 'monitor', 'requestMonitorLink', {
    disciplineId: 'course',
    professorId: 'p'
  });
  prepareAccountDeletion(s, 'm');
  assert.equal(s.linkRequests[0].status, 'cancelled');
  assert.ok(s.notifications.some(x => x.userId === 'p' && x.title === 'Solicitação encerrada'));
});
