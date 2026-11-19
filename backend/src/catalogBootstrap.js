import { COURSE_CATALOG } from './data/courseCatalog.js';

// The catalogue is reference data. Initializing it must never provision users,
// grant a role, assign a professor/tutor, or create demonstration sessions.
export async function ensureCourseCatalog(db) {
  const refs = COURSE_CATALOG.map(course => db.doc('disciplines/' + course.id));
  return db.runTransaction(async tx => {
    const revisionRef = db.doc('system/academicRevision');
    const [revision, records] = await Promise.all([
      tx.get(revisionRef), tx.getAll(...refs),
    ]);
    const missing = records.map((record, index) => ({ record, course: COURSE_CATALOG[index] }))
      .filter(({ record }) => !record.exists);
    // Existing edits and explicit inactive flags are intentional and preserved.
    for (const { course } of missing) tx.create(db.doc('disciplines/' + course.id), { ...course });
    if (missing.length) tx.set(revisionRef, {
      revision: (revision.data()?.revision || 0) + 1,
      updatedAt: new Date().toISOString(),
    });
    return { created: missing.length, referenceCourses: COURSE_CATALOG.length };
  });
}
