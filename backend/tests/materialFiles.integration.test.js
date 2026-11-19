import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { emptyState, AcademicService, visibleState } from '../src/academicService.js';
import { FirestoreStore } from '../src/firestoreStore.js';
import { MaterialFileService, FirestoreFileStore } from '../src/materialFiles.js';
import { createMoniBotServer } from '../src/app.js';
import { MonitoringService } from '../src/domain/monitoring.js';
const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);
test('actual Firestore/Auth: assignments, HTTP uploads, chunk integrity, role access, deletion, recovery and CSV', {
  skip: !enabled
}, async () => {
  const app = initializeApp({
      projectId: 'demo-monimob'
    }, 'files-integration'),
    db = getFirestore(app),
    auth = getAuth(app);
  const clear = async () => {
    for (const ref of await db.listCollections()) await db.recursiveDelete(ref);
  };
  let server;
  try {
    await clear();
    const s = emptyState();
    s.users = [{
      id: 'files-prof',
      name: 'Professor',
      roles: ['professor']
    }, {
      id: 'files-tutor',
      name: 'Monitor',
      roles: ['monitor']
    }, {
      id: 'files-student',
      name: 'Aluno',
      roles: ['student']
    }, {
      id: 'files-other',
      name: 'Outro',
      roles: ['professor']
    }];
    s.disciplines = [{
      id: 'course',
      code: 'C',
      name: 'Disciplina real de teste',
      active: true
    }];
    const tokens = {};
    for (const u of s.users) {
      await db.doc('users/' + u.id).set(u);
      try {
        await auth.deleteUser(u.id);
      } catch {}
      await auth.createUser({
        uid: u.id,
        email: u.id + '@edu.unifor.br',
        emailVerified: true,
        password: 'ValidPassword-2026'
      });
      await auth.setCustomUserClaims(u.id, {
        roles: u.roles
      });
      const response = await fetch('http://' + process.env.FIREBASE_AUTH_EMULATOR_HOST + '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          email: u.id + '@edu.unifor.br',
          password: 'ValidPassword-2026',
          returnSecureToken: true
        })
      });
      tokens[u.id] = (await response.json()).idToken;
      assert.ok(tokens[u.id]);
    }
    await db.doc('disciplines/course').set(s.disciplines[0]);
    const academic = new AcademicService(new FirestoreStore(db)),
      files = new MaterialFileService({
        db,
        academicService: academic
      });
    server = createMoniBotServer({
      academicService: academic,
      materialFileService: files,
      verifyFirebaseToken: async token => {
        const d = await auth.verifyIdToken(token, true);
        return {
          userId: d.uid,
          emailVerified: d.email_verified
        };
      },
      getFirebaseRoles: async uid => (await auth.getUser(uid)).customClaims.roles
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const origin = 'http://127.0.0.1:' + server.address().port;
    async function http(uid, path, body) {
      return fetch(origin + path, {
        method: body ? 'POST' : 'GET',
        headers: {
          authorization: 'Bearer ' + tokens[uid],
          'content-type': 'application/json'
        },
        ...(body ? {
          body: JSON.stringify(body)
        } : {})
      });
    }
    let index = 0;
    async function command(uid, role, action, input) {
      const res = await http(uid, '/api/actions', {
        role,
        command: {
          id: 'workflow_command_' + ++index,
          action,
          input
        }
      });
      const body = await res.json();
      assert.equal(res.status, 200, JSON.stringify(body));
      return body.result;
    }
    await command('files-prof', 'professor', 'registerProfessorDiscipline', {
      disciplineId: 'course'
    });
    const directory = await academic.read({
      sub: 'files-tutor',
      roles: ['monitor']
    }, 'monitor');
    assert.equal(directory.professorDisciplines.length, 1);
    assert.equal(directory.users.find(x => x.id === 'files-prof').email, undefined);
    const request = await command('files-tutor', 'monitor', 'requestMonitorLink', {
      disciplineId: 'course',
      professorId: 'files-prof'
    });
    await command('files-prof', 'professor', 'decideMonitorLink', {
      requestId: request.id,
      decision: 'approved',
      validUntil: '2099-12-31'
    });
    const tutor = {
        sub: 'files-tutor',
        roles: ['monitor']
      },
      prof = {
        sub: 'files-prof',
        roles: ['professor']
      },
      student = {
        sub: 'files-student',
        roles: ['student']
      };
    const doc = Buffer.from('%PDF-1.7\nMoniMob academic file\n%%EOF'),
      payload = {
        operationId: 'file_upload_000001',
        disciplineId: 'course',
        title: 'Arquivo do professor',
        name: 'aula.pdf',
        data: doc.toString('base64')
      };
    const upload = await http('files-prof', '/api/materials/upload?role=professor', payload),
      uploaded = await upload.json();
    assert.equal(upload.status, 200, JSON.stringify(uploaded));
    const direct = uploaded.result;
    assert.equal(direct.status, 'approved');
    assert.ok(direct.fileId);
    const duplicate = await http('files-prof', '/api/materials/upload?role=professor', payload);
    assert.equal((await duplicate.json()).result.id, direct.id);
    assert.equal((await db.collection('materials').get()).size, 1);
    const conflict = await http('files-prof', '/api/materials/upload?role=professor', {
      ...payload,
      title: 'Another operation'
    });
    assert.equal(conflict.status, 409);
    const download = await http('files-student', '/api/materials/' + direct.id + '/file?role=student');
    assert.equal(download.status, 200);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), doc);
    assert.equal((await http('files-other', '/api/materials/' + direct.id + '/file?role=professor')).status, 403);
    assert.equal((await http('files-student', '/api/materials/upload?role=professor', payload)).status, 403);
    const pendingResult = await files.upload(tutor, 'monitor', {
        ...payload,
        operationId: 'file_upload_000002',
        title: 'Arquivo do monitor'
      }),
      pending = pendingResult.result;
    assert.equal(pending.status, 'pending');
    await assert.rejects(files.download(student, 'student', pending.id));
    assert.deepEqual((await files.download(prof, 'professor', pending.id)).bytes, doc);
    await command('files-prof', 'professor', 'decideApproval', {
      entityType: 'material',
      entityId: pending.id,
      decision: 'approved'
    });
    assert.deepEqual((await files.download(student, 'student', pending.id)).bytes, doc);
    // The maximum permitted attachment spans twenty real Firestore documents.
    const big = Buffer.alloc(5 * 1024 * 1024, 97);
    const bigResult = await http('files-prof', '/api/materials/upload?role=professor', {
      ...payload,
      operationId: 'file_upload_000003',
      title: 'Arquivo grande',
      name: 'grande.txt',
      data: big.toString('base64')
    });
    const bigBody = await bigResult.json();
    assert.equal(bigResult.status, 200, JSON.stringify(bigBody));
    const large = bigBody.result;
    assert.equal((await db.collection('materialFiles/' + large.fileId + '/parts').get()).size, 20);
    assert.deepEqual((await files.download(student, 'student', large.id)).bytes, big);
    // Simulate storage failure after academic deletion has committed.
    let fail = true;
    const backing = new FirestoreFileStore(db),
      flaky = new Proxy(backing, {
        get(target, key) {
          if (key === 'remove') return async id => {
            if (fail) throw Error('Temporary storage outage');
            return target.remove(id);
          };
          return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
        }
      });
    const recovery = new MaterialFileService({
      db,
      academicService: academic,
      fileStore: flaky
    });
    const deleted = await recovery.deleteMaterial(tutor, 'monitor', {
      id: 'delete_pending_file_001',
      action: 'deleteMaterial',
      input: {
        materialId: pending.id
      }
    });
    assert.equal(deleted.storageDeletionPending, true);
    await assert.rejects(files.download(prof, 'professor', pending.id));
    assert.equal((await db.doc('materialFiles/' + pending.fileId).get()).exists, true);
    fail = false;
    await new MaterialFileService({
      db,
      academicService: academic
    }).recover();
    assert.equal((await db.doc('materialFiles/' + pending.fileId).get()).exists, false);
    assert.equal((await db.collection('materialFiles/' + pending.fileId + '/parts').get()).empty, true);
    const historical = (await db.doc('materials/' + pending.id).get()).data();
    assert.equal(historical.title, 'Arquivo do monitor');
    assert.equal(historical.fileId, undefined);
    assert.equal(historical.storageDeletionPending, false);
    const removed = await command('files-prof', 'professor', 'deleteMaterial', {
      materialId: large.id
    });
    assert.equal(removed.storageDeletionPending, false);
    assert.equal((await db.doc('materialFiles/' + large.fileId).get()).exists, false);
    const reportState = await academic.read(prof, 'professor');
    const domain = new MonitoringService({
      read: () => reportState
    });
    const csv = domain.exportReportCsv('files-prof');
    assert.match(csv, /Vínculo aprovado/);
    assert.match(csv, /Material excluído/);
    assert.match(csv, /grande.txt/);
    assert.match(csv, /aula.pdf/);
    assert.equal(domain.reportForProfessor('files-prof').deletedMaterials, 2);
    // Read optimizations must preserve exactly the authorized role views.
    const full = await academic.store.read();
    const canonical = value => Array.isArray(value) ? value.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
    for (const identity of [prof, tutor, student]) {
      const role = identity.roles[0];
      assert.deepEqual(canonical(await academic.read(identity, role)), canonical(visibleState(full, identity, role)));
    }
    await command('files-prof', 'professor', 'revokeMonitorLink', {
      linkId: reportState.monitorDisciplines[0].id
    });
    await assert.rejects(files.upload(tutor, 'monitor', {
      ...payload,
      operationId: 'file_upload_000004'
    }));
  } finally {
    if (server) await new Promise(r => server.close(r));
    await clear();
    for (const uid of ['files-prof', 'files-tutor', 'files-student', 'files-other']) try {
      await auth.deleteUser(uid);
    } catch {}
    await deleteApp(app);
  }
});
