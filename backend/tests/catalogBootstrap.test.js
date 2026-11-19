import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureCourseCatalog } from '../src/catalogBootstrap.js';
import { COURSE_CATALOG } from '../src/data/courseCatalog.js';

function fakeDb() {
  const records = new Map(), writes = [];
  const snapshot = ref => ({ exists: records.has(ref.path), data: () => records.get(ref.path) });
  const db = { doc: path => ({ path }), runTransaction: fn => fn({
    get: async ref => snapshot(ref), getAll: async (...refs) => refs.map(snapshot),
    create: (ref, data) => { assert.equal(records.has(ref.path), false); records.set(ref.path, structuredClone(data)); writes.push(ref.path); },
    set: (ref, data) => { records.set(ref.path, structuredClone(data)); writes.push(ref.path); },
  }) };
  return { db, records, writes };
}
test('empty database gets only real reference courses and initialization is idempotent', async () => {
  const {db, records, writes} = fakeDb();
  assert.equal(COURSE_CATALOG.length, 49);
  assert.equal(new Set(COURSE_CATALOG.map(x => x.id)).size, 49);
  assert.equal((await ensureCourseCatalog(db)).created, 49);
  assert.ok(writes.every(x => x.startsWith('disciplines/') || x === 'system/academicRevision'));
  assert.equal((await ensureCourseCatalog(db)).created, 0);
  assert.equal(records.size, 50);
  for (const course of COURSE_CATALOG) { assert.equal(course.code, course.id); assert.ok(course.name); assert.ok(course.semester >= 1 && course.semester <= 8); }
});
test('existing course edits and inactive flags survive; only missing courses are restored', async () => {
  const {db, records} = fakeDb();
  await ensureCourseCatalog(db);
  records.set('disciplines/T105', { id:'T105', name:'Nome administrado', code:'T105', active:false, semester:1 });
  records.delete('disciplines/T390');
  assert.equal((await ensureCourseCatalog(db)).created, 1);
  assert.equal(records.get('disciplines/T105').active, false);
  assert.equal(records.get('disciplines/T105').name, 'Nome administrado');
  assert.equal(records.get('disciplines/T390').name, 'Estrutura de dados');
});
