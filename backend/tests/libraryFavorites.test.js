import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, applyAction, visibleState } from '../src/academicService.js';
import { favoriteItems } from '../../mobile-expo/src/domain/favorites.js';
import { MonitoringService } from '../src/domain/monitoring.js';
import { canDeleteMaterial, canEditMaterial } from '../src/domain/materialAccess.js';
const people = {
  p: ['professor'],
  q: ['professor'],
  m: ['monitor', 'student'],
  n: ['monitor', 'student'],
  s: ['student'],
  foreign: ['monitor', 'student'],
  disabled: ['monitor'],
};
const who = (id) => ({ sub: id, roles: people[id] });
const run = (state, id, role, action, input) => {
 if(action === 'decideApproval' && input.expectedRevision === undefined) input = {...input,expectedRevision:(input.entityType==='session'?state.sessions:state.materials).find(x=>x.id===input.entityId)?.revision || 1};
 return applyAction(state,who(id),role,action,input);
};
function fresh() {
  const s = emptyState();
  s.users = Object.entries(people).map(([id, roles]) => ({
    id,
    name: id,
    roles,
    disciplineIds: id === 'foreign' ? ['x'] : ['c'],
    disabled: id === 'disabled',
  }));
  s.disciplines = [
    { id: 'c', code: 'C', name: 'Course', active: true },
    { id: 'x', code: 'X', name: 'Other', active: true },
  ];
  s.professorDisciplines = ['p', 'q'].map((professorId) => ({
    id: professorId,
    professorId,
    disciplineId: 'c',
    active: true,
  }));
  s.monitorDisciplines = ['m', 'n', 'disabled'].map((monitorId) => ({
    id: monitorId,
    monitorId,
    disciplineId: 'c',
    professorId: monitorId === 'n' ? 'q' : 'p',
    active: true,
    validUntil: '2099-12-31T23:59:59-03:00',
  }));
  return s;
}
const body = { disciplineId: 'c', title: 'Study material', url: 'https://unifor.br/aula.pdf' };
const read = (s, id, role) => visibleState(s, who(id), role);
test('tutor pending material stays private; only responsible professor approves; publication reaches the course', () => {
  const s = fresh(),
    material = run(s, 'm', 'monitor', 'saveMaterial', { material: body });
  assert.equal(material.status, 'pending');
  for (const [id, role, visible] of [
    ['m', 'monitor', true],
    ['p', 'professor', true],
    ['q', 'professor', false],
    ['n', 'monitor', false],
    ['s', 'student', false],
    ['foreign', 'monitor', false],
  ])
    assert.equal(
      read(s, id, role).materials.some((x) => x.id === material.id),
      visible,
      id,
    );
  assert.throws(
    () =>
      run(s, 'q', 'professor', 'decideApproval', {
        entityType: 'material',
        entityId: material.id,
        decision: 'approved',
      }),
    /Professor/,
  );
  run(s, 'p', 'professor', 'decideApproval', {
    entityType: 'material',
    entityId: material.id,
    decision: 'approved',
  });
  for (const [id, role] of [
    ['s', 'student'],
    ['m', 'monitor'],
    ['n', 'monitor'],
    ['q', 'professor'],
  ])
    assert.ok(read(s, id, role).materials.some((x) => x.id === material.id));
  assert.equal(read(s, 'foreign', 'student').materials.length, 0);
  assert.equal(read(s, 'n', 'monitor').approvals.filter(a => a.entityId === material.id).length, 0, 'Shared publication does not expose private review history');
  assert.equal(read(s, 'm', 'monitor').approvals.filter(a => a.entityId === material.id).length, 1);

  for (const id of ['s', 'n'])
    assert.equal(
      s.notifications.filter((x) => x.userId === id && x.title === 'Novo material').length,
      1,
      'One publication notification for ' + id,
    );
  assert.equal(s.notifications.filter((x) => x.userId === 'disabled').length, 0);
  const saved = run(s, 'm', 'monitor', 'saveMaterial', {
    material: { ...body, id: material.id, url: 'https://unifor.br/revisado.pdf' },
  });
  assert.equal(saved.status, 'pending');
  assert.equal(read(s, 's', 'student').materials.length, 0);
  assert.equal(read(s, 'n', 'monitor').materials.length, 0);
  run(s, 'p', 'professor', 'decideApproval', {
    entityType: 'material',
    entityId: material.id,
    decision: 'adjustments_requested',
    comment: 'Revise o conteúdo',
  });
  assert.equal(read(s, 'm', 'monitor').approvals.at(-1).comment, 'Revise o conteúdo');
  run(s, 'm', 'monitor', 'saveMaterial', { material: { ...body, id: material.id } });
  run(s, 'p', 'professor', 'decideApproval', {
    entityType: 'material',
    entityId: material.id,
    decision: 'approved',
  });
  assert.equal(read(s, 's', 'student').materials.length, 1);
});
test('professor publication is shared with assigned tutors and remains protected against tutor edits/deletion', () => {
  const s = fresh(),
    m = run(s, 'p', 'professor', 'saveMaterial', { material: body });
  assert.equal(m.status, 'approved');
  assert.ok(read(s, 'm', 'monitor').materials.some((x) => x.id === m.id));
  assert.ok(read(s, 'n', 'monitor').materials.some((x) => x.id === m.id));
  assert.equal(read(s, 'foreign', 'monitor').materials.length, 0);
  assert.equal(
    canDeleteMaterial(
      s,
      s.users.find((x) => x.id === 'm'),
      'monitor',
      m,
    ),
    false,
  );
  assert.equal(
    canEditMaterial(
      s,
      s.users.find((x) => x.id === 'm'),
      'monitor',
      m,
    ),
    false,
  );
  assert.throws(() => run(s, 'm', 'monitor', 'deleteMaterial', { materialId: m.id }), /excluir/);
  assert.throws(
    () => run(s, 'm', 'monitor', 'saveMaterial', { material: { ...body, id: m.id } }),
    /autor/,
  );
  run(s, 'p', 'professor', 'deleteMaterial', { materialId: m.id });
  assert.equal(read(s, 's', 'student').materials.length, 0);
  assert.ok(!read(s, 'm', 'monitor').materials.some((x) => x.id === m.id));
  const csv = new MonitoringService({ read: () => read(s, 'p', 'professor') }).exportReportCsv('p');
  assert.match(csv, /Material excluído/);
  assert.match(csv, /Study material/);
});
test('favorites persist, are private and idempotent, never reserve places, and can be removed after cancellation/deletion', () => {
  const s = fresh(),
    session = run(s, 'm', 'monitor', 'saveSession', {
      session: {
        disciplineId: 'c',
        topic: 'Favorite lesson',
        date: '2099-11-24',
        time: '15:00',
        durationMinutes: 60,
        location: 'Room',
        capacity: 2,
      },
    });
  run(s, 's', 'student', 'setFavorite', { sessionId: session.id, favorite: true });
  run(s, 's', 'student', 'setFavorite', { sessionId: session.id, favorite: true });
  assert.equal(s.favorites.length, 1);
  assert.equal(s.reservations.length, 0);
  assert.equal(s.favorites[0].snapshot.topic, 'Favorite lesson');
  assert.equal(read(s, 'm', 'student').favorites.length, 0);
  assert.equal(favoriteItems(read(s, 's', 'student'), 's').length, 1);
  s.favorites.push({ ...s.favorites[0], id: 'legacy-duplicate' });
  run(s, 's', 'student', 'setFavorite', { sessionId: session.id, favorite: true });
  assert.equal(s.favorites.length, 1);
  run(s, 'p', 'professor', 'suspendSession', { sessionId: session.id });
  let v = read(s, 's', 'student'),
    f = favoriteItems(v, 's')[0];
  assert.equal(f.availability, 'cancelled');
  assert.equal(f.canOpen, false);
  assert.equal(f.session.topic, 'Favorite lesson');
  s.sessions = [];
  v = read(s, 's', 'student');
  assert.equal(favoriteItems(v, 's')[0].session.topic, 'Favorite lesson');
  assert.equal(v.favorites[0].availability, 'unavailable');
  run(s, 's', 'student', 'setFavorite', { sessionId: session.id, favorite: false });
  assert.equal(s.favorites.length, 0);
  run(s, 's', 'student', 'setFavorite', { sessionId: session.id, favorite: false });
  assert.equal(s.favorites.length, 0);
  assert.throws(
    () => run(s, 's', 'student', 'setFavorite', { sessionId: session.id, favorite: true }),
    /indisponível/,
  );
  assert.throws(
    () => run(s, 'm', 'monitor', 'setFavorite', { sessionId: session.id, favorite: true }),
    /autorizada/,
  );
});
test('favorite history updates when a saved upcoming session starts while the list stays open', () => {
  const s = fresh(),
    session = {
      id: 'time',
      disciplineId: 'c',
      status: 'approved',
      date: '2099-11-24',
      time: '15:00',
      durationMinutes: 60,
    };
  s.sessions = [session];
  s.favorites = [{ id: 'f', studentId: 's', sessionId: 'time', availability: 'upcoming' }];
  assert.equal(
    favoriteItems(s, 's', Date.parse('2099-11-24T14:59:00-03:00'))[0].availability,
    'upcoming',
  );
  assert.equal(
    favoriteItems(s, 's', Date.parse('2099-11-24T15:00:00-03:00'))[0].availability,
    'ended',
  );
});
