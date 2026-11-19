import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyState,
  applyAction,
  visibleState,
} from '../src/academicService.js';
import { saveAcademicMaterial } from '../src/domain/workflow.js';
import { latestReview, monitorAdjustments } from '../src/domain/review.js';
const actors = {
  p: { sub: 'p', roles: ['professor'] },
  m: { sub: 'm', roles: ['monitor'] },
  s: { sub: 's', roles: ['student'] },
};
function setup() {
  const s = emptyState();
  s.users = Object.values(actors).map((a) => ({
    id: a.sub,
    name: a.sub,
    roles: a.roles,
  }));
  s.disciplines = [{ id: 'c', code: 'C', name: 'Course', active: true }];
  s.professorDisciplines = [
    { id: 'p-c', professorId: 'p', disciplineId: 'c', active: true },
  ];
  s.monitorDisciplines = [
    {
      id: 'm-c',
      monitorId: 'm',
      professorId: 'p',
      disciplineId: 'c',
      active: true,
      validUntil: '2099-12-31T23:59:59-03:00',
    },
  ];
  return s;
}
const run = (s, id, role, action, input) =>
  applyAction(s, actors[id], role, action, input);
const session = {
  disciplineId: 'c',
  topic: 'Session',
  date: '2099-11-24',
  time: '15:00',
  durationMinutes: 60,
  location: 'Room',
  capacity: 2,
};
const decision = (s, type, id, value, revision, comment = '') =>
  run(s, 'p', 'professor', 'decideApproval', {
    entityType: type,
    entityId: id,
    decision: value,
    comment,
    expectedRevision: revision,
  });
test('session adjustment requires a comment, blocks publication until reapproval, preserves bookings and private feedback', () => {
  const s = setup(),
    original = run(s, 'm', 'monitor', 'saveSession', { session });
  run(s, 's', 'student', 'reserve', { sessionId: original.id });
  s.attendanceCodes.push({ id: 'code', sessionId: original.id, active: true });
  assert.throws(
    () => decision(s, 'session', original.id, 'adjustments_requested', 1),
    (e) => e.code === 'COMMENT_REQUIRED',
  );
  decision(
    s,
    'session',
    original.id,
    'adjustments_requested',
    1,
    'Corrija a descrição',
  );
  assert.equal(s.attendanceCodes[0].active, false);
  assert.equal(
    monitorAdjustments(s, 'm')[0].feedback.comment,
    'Corrija a descrição',
  );
  assert.ok(
    !s.notifications.some(
      (n) => n.userId === 's' && n.body.includes('Corrija a descrição'),
    ),
  );
  const fixed = run(s, 'm', 'monitor', 'saveSession', {
    session: {
      ...session,
      id: original.id,
      description: 'Corrected',
      expectedRevision: 1,
    },
  });
  assert.equal(fixed.id, original.id);
  assert.equal(fixed.status, 'pending');
  assert.equal(fixed.revision, 2);
  assert.equal(s.reservations[0].status, 'confirmed');
  assert.equal(
    visibleState(s, actors.s, 'student').sessions[0].status,
    'pending',
  );
  assert.throws(() =>
    run(s, 's', 'student', 'reserve', { sessionId: fixed.id }),
  );
  assert.throws(
    () => decision(s, 'session', fixed.id, 'approved', 1),
    (e) => e.code === 'REVIEW_CHANGED',
  );
  assert.throws(
    () =>
      run(s, 'p', 'professor', 'decideApproval', {
        entityType: 'session',
        entityId: fixed.id,
        decision: 'approved',
      }),
    (e) => e.code === 'REVIEW_CHANGED',
  );
  decision(s, 'session', fixed.id, 'approved', 2);
  assert.equal(s.sessions[0].status, 'approved');
  assert.equal(monitorAdjustments(s, 'm').length, 0);
  assert.equal(s.reservations[0].status, 'confirmed');
  const changedAgain = run(s, 'm', 'monitor', 'saveSession', {
    session: {
      ...session,
      id: fixed.id,
      description: 'Another change',
      expectedRevision: 2,
    },
  });
  assert.equal(changedAgain.status, 'pending');
});
test('materials replace binary content under the same ID and revision; metadata-only corrections keep the actual file', () => {
  const s = setup(),
    input = { disciplineId: 'c', title: 'PDF' },
    file = {
      id: 'blob-1',
      name: 'old.pdf',
      size: 20,
      mimeType: 'application/pdf',
    };
  const first = saveAcademicMaterial(s, actors.m, 'monitor', input, file);
  decision(
    s,
    'material',
    first.id,
    'adjustments_requested',
    1,
    'Corrija o arquivo',
  );
  const second = saveAcademicMaterial(
    s,
    actors.m,
    'monitor',
    { ...input, id: first.id, expectedRevision: 1 },
    { ...file, id: 'blob-2', name: 'fixed.pdf' },
  );
  assert.equal(second.id, first.id);
  assert.equal(second.status, 'pending');
  assert.equal(second.revision, 2);
  assert.deepEqual(second.obsoleteFileIds, ['blob-1']);
  assert.equal(s.materials.length, 1);
  assert.throws(
    () => decision(s, 'material', first.id, 'approved', 1),
    (e) => e.code === 'REVIEW_CHANGED',
  );
  decision(
    s,
    'material',
    first.id,
    'adjustments_requested',
    2,
    'Corrija o título',
  );
  const third = saveAcademicMaterial(s, actors.m, 'monitor', {
    ...input,
    id: first.id,
    title: 'Corrected title',
    expectedRevision: 2,
    keepExistingFile: true,
  });
  assert.equal(third.fileId, 'blob-2');
  assert.equal(third.fileName, 'fixed.pdf');
  assert.equal(third.status, 'pending');
  assert.equal(third.revision, 3);
  assert.equal(
    latestReview(s, 'material', first.id).comment,
    'Corrija o título',
  );
  assert.throws(
    () =>
      saveAcademicMaterial(s, actors.m, 'monitor', {
        ...input,
        id: first.id,
        expectedRevision: 1,
        keepExistingFile: true,
      }),
    (e) => e.code === 'REVIEW_CHANGED',
  );
  assert.equal(visibleState(s, actors.s, 'student').materials.length, 0);
  decision(s, 'material', first.id, 'approved', 3);
  assert.equal(visibleState(s, actors.s, 'student').materials.length, 1);
});
test('feedback uses the sequence of the latest decision and adjustments include both item types', () => {
  const s = setup(),
    a = run(s, 'm', 'monitor', 'saveSession', { session }),
    b = run(s, 'm', 'monitor', 'saveMaterial', {
      material: {
        disciplineId: 'c',
        title: 'Link',
        url: 'https://unifor.br/a',
      },
    });
  decision(s, 'session', a.id, 'adjustments_requested', 1, 'Session feedback');
  decision(s, 'material', b.id, 'adjustments_requested', 1, 'File feedback');
  assert.equal(monitorAdjustments(s, 'm').length, 2);
  assert.equal(monitorAdjustments(s, 'other').length, 0);
  s.approvals = [
    {
      entityType: 'material',
      entityId: 'x',
      sequence: 2,
      decidedAt: '2020',
      comment: 'new',
    },
    {
      entityType: 'material',
      entityId: 'x',
      sequence: 1,
      decidedAt: '2030',
      comment: 'old',
    },
  ];
  assert.equal(latestReview(s, 'material', 'x').comment, 'new');
});
