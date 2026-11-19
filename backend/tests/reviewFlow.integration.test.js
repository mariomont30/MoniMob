import { AcademicService } from '../src/academicService.js';
import { FirestoreStore } from '../src/firestoreStore.js';
import {
  MaterialFileService,
  FirestoreFileStore,
} from '../src/materialFiles.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createRuntime } from '../src/runtime.js';
import { MonitoringService } from '../src/domain/monitoring.js';
const enabled = Boolean(
  process.env.FIRESTORE_EMULATOR_HOST &&
  process.env.FIREBASE_AUTH_EMULATOR_HOST,
);
test(
  'HTTP with real local Firestore/Auth: correction cycles, file replacement/retry/cleanup, stale decisions, session reapproval and reservation history',
  { skip: !enabled },
  async () => {
    const app = initializeApp({ projectId: 'demo-monimob' }),
      db = getFirestore(app),
      auth = getAuth(app);
    let server;
    const users = [
      { id: 'lib-prof', roles: ['professor'], name: 'Professor' },
      { id: 'lib-tutor', roles: ['monitor', 'student'], name: 'Tutor' },
      { id: 'lib-student', roles: ['student'], name: 'Student' },
      {
        id: 'lib-outsider',
        roles: ['monitor', 'student'],
        name: 'Unassigned tutor',
      },
    ];
    const clear = async () => {
      for (const c of await db.listCollections()) await db.recursiveDelete(c);
    };
    try {
      await clear();
      const handler = createRuntime();
      await handler.ready;
      server = createServer(handler);
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      const origin = 'http://127.0.0.1:' + server.address().port,
        tokens = {};
      const signIn = async (user) => {
        const r = await fetch(
          'http://' +
            process.env.FIREBASE_AUTH_EMULATOR_HOST +
            '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key',
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              email: user.id + '@edu.unifor.br',
              password: 'QaPassword-2026',
              returnSecureToken: true,
            }),
          },
        );
        tokens[user.id] = (await r.json()).idToken;
        assert.ok(tokens[user.id]);
      };
      for (const user of users) {
        try {
          await auth.deleteUser(user.id);
        } catch {}
        await auth.createUser({
          uid: user.id,
          email: user.id + '@edu.unifor.br',
          emailVerified: true,
          password: 'QaPassword-2026',
        });
        await auth.setCustomUserClaims(user.id, { roles: user.roles });
        await db.doc('users/' + user.id).set({
          ...user,
          disciplineIds: ['T390'],
          email: user.id + '@edu.unifor.br',
          registration: user.id,
          registrationStatus: 'active',
        });
        await signIn(user);
      }
      const http = (uid, path, body) =>
        fetch(origin + path, {
          method: body ? 'POST' : 'GET',
          headers: {
            authorization: 'Bearer ' + tokens[uid],
            'content-type': 'application/json',
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
      let serial = 0;
      const command = async (uid, role, action, input = {}, expected = 200) => {
        if (
          action === 'decideApproval' &&
          input.expectedRevision === undefined
        ) {
          const ref = await db
            .doc(
              (input.entityType === 'session' ? 'sessions/' : 'materials/') +
                input.entityId,
            )
            .get();
          input = { ...input, expectedRevision: ref.data()?.revision || 1 };
        }
        const r = await http(uid, '/api/actions', {
            role,
            command: { id: 'library_flow_command_' + ++serial, action, input },
          }),
          body = await r.json();
        assert.equal(r.status, expected, JSON.stringify(body));
        return body.result;
      };
      const state = async (uid, role) => {
        const r = await http(uid, '/api/state?role=' + role);
        assert.equal(r.status, 200);
        return (await r.json()).state;
      };

      const request = await command(
        'lib-tutor',
        'monitor',
        'requestMonitorLink',
        { disciplineId: 'T390', professorId: 'lib-prof' },
      );
      await command('lib-prof', 'professor', 'decideMonitorLink', {
        requestId: request.id,
        decision: 'approved',
        validUntil: '2099-12-31',
      });
      const upload = async (id, body) => {
        const r = await http(id, '/api/materials/upload?role=monitor', body);
        const b = await r.json();
        assert.equal(r.status, 200, JSON.stringify(b));
        return b.result;
      };
      const firstBytes = Buffer.from('%PDF-1.7 original lesson'),
        secondBytes = Buffer.from('%PDF-1.7 corrected lesson'),
        fourthBytes = Buffer.from('%PDF-1.7 another corrected lesson');
      const original = await upload('lib-tutor', {
        operationId: 'review_initial_file_001',
        title: 'Original file',
        disciplineId: 'T390',
        name: 'original.pdf',
        data: firstBytes.toString('base64'),
      });
      await command(
        'lib-prof',
        'professor',
        'decideApproval',
        {
          entityType: 'material',
          entityId: original.id,
          decision: 'adjustments_requested',
          comment: '',
        },
        409,
      );
      await command('lib-prof', 'professor', 'decideApproval', {
        entityType: 'material',
        entityId: original.id,
        decision: 'adjustments_requested',
        comment: 'Corrija o conteúdo do PDF',
        expectedRevision: 1,
      });
      assert.equal(
        (await state('lib-tutor', 'monitor')).approvals.find(
          (a) => a.entityId === original.id,
        ).comment,
        'Corrija o conteúdo do PDF',
      );
      const replacementBody = {
        operationId: 'review_replace_file_002',
        materialId: original.id,
        expectedRevision: 1,
        title: 'Corrected file',
        disciplineId: 'T390',
        name: 'corrected.pdf',
        data: secondBytes.toString('base64'),
      };
      const second = await upload('lib-tutor', replacementBody);
      assert.equal(second.id, original.id);
      assert.equal(second.revision, 2);
      assert.equal(second.status, 'pending');
      assert.equal((await db.collection('materials').get()).size, 1);
      assert.equal(
        (await db.doc('materialFiles/' + original.fileId).get()).exists,
        false,
      );
      assert.equal(
        (
          await db
            .collection('materialFiles/' + original.fileId + '/parts')
            .get()
        ).size,
        0,
      );
      const retry = await upload('lib-tutor', replacementBody);
      assert.equal(retry.id, second.id);
      assert.equal(
        retry.revision,
        2,
        'A response retry must not create another revision',
      );
      assert.equal(
        (
          await http(
            'lib-student',
            '/api/materials/' + second.id + '/file?role=student',
          )
        ).status,
        403,
      );
      await command(
        'lib-prof',
        'professor',
        'decideApproval',
        {
          entityType: 'material',
          entityId: second.id,
          decision: 'approved',
          expectedRevision: 1,
        },
        409,
      );
      let download = await http(
        'lib-prof',
        '/api/materials/' + second.id + '/file?role=professor',
      );
      assert.equal(download.status, 200);
      assert.deepEqual(Buffer.from(await download.arrayBuffer()), secondBytes);
      await command('lib-prof', 'professor', 'decideApproval', {
        entityType: 'material',
        entityId: second.id,
        decision: 'adjustments_requested',
        comment: 'Corrija apenas o título',
        expectedRevision: 2,
      });
      const third = await command('lib-tutor', 'monitor', 'saveMaterial', {
        material: {
          id: second.id,
          disciplineId: 'T390',
          title: 'Corrected title',
          keepExistingFile: true,
          expectedRevision: 2,
        },
      });
      assert.equal(third.fileId, second.fileId);
      assert.equal(third.revision, 3);
      assert.equal(third.status, 'pending');
      await command('lib-prof', 'professor', 'decideApproval', {
        entityType: 'material',
        entityId: third.id,
        decision: 'approved',
        expectedRevision: 3,
      });
      download = await http(
        'lib-student',
        '/api/materials/' + third.id + '/file?role=student',
      );
      assert.equal(download.status, 200);
      assert.deepEqual(Buffer.from(await download.arrayBuffer()), secondBytes);
      await command(
        'lib-prof',
        'professor',
        'decideApproval',
        {
          entityType: 'material',
          entityId: third.id,
          decision: 'approved',
          expectedRevision: 3,
        },
        409,
      );
      // A failed storage cleanup must keep the replacement committed and recover safely.
      let failCleanup = true;
      const backing = new FirestoreFileStore(db),
        flaky = new Proxy(backing, {
          get(t, k) {
            if (k === 'remove')
              return async (id) => {
                if (failCleanup) throw Error('Temporary storage outage');
                return t.remove(id);
              };
            return typeof t[k] === 'function' ? t[k].bind(t) : t[k];
          },
        });
      const files = new MaterialFileService({
        db,
        academicService: new AcademicService(new FirestoreStore(db)),
        fileStore: flaky,
      });
      const fourth = (
        await files.upload(
          { sub: 'lib-tutor', roles: ['monitor', 'student'] },
          'monitor',
          {
            operationId: 'review_replace_file_004',
            materialId: third.id,
            expectedRevision: 3,
            title: 'Final replacement',
            disciplineId: 'T390',
            name: 'final.pdf',
            data: fourthBytes.toString('base64'),
          },
        )
      ).result;
      assert.equal(fourth.revision, 4);
      assert.equal(
        (await db.doc('materials/' + fourth.id).get()).data()
          .fileCleanupPending,
        true,
      );
      assert.equal(
        (await db.doc('materialFiles/' + second.fileId).get()).exists,
        true,
      );
      await files.recover();
      failCleanup = false;
      await files.recover();
      assert.equal(
        (await db.doc('materialFiles/' + second.fileId).get()).exists,
        false,
      );
      assert.equal(
        (await db.doc('materialFiles/' + fourth.fileId).get()).exists,
        true,
      );
      assert.equal(
        (await db.doc('materials/' + fourth.id).get()).data()
          .fileCleanupPending,
        false,
      );
      await command('lib-prof', 'professor', 'decideApproval', {
        entityType: 'material',
        entityId: fourth.id,
        decision: 'approved',
        expectedRevision: 4,
      });
      download = await http(
        'lib-student',
        '/api/materials/' + fourth.id + '/file?role=student',
      );
      assert.deepEqual(Buffer.from(await download.arrayBuffer()), fourthBytes);
      const session = await command('lib-tutor', 'monitor', 'saveSession', {
        session: {
          disciplineId: 'T390',
          topic: 'Session for corrections',
          date: '2099-11-24',
          time: '15:00',
          durationMinutes: 60,
          capacity: 2,
          location: 'Room',
        },
      });
      const booking = await command('lib-student', 'student', 'reserve', {
        sessionId: session.id,
      });
      await command('lib-prof', 'professor', 'decideApproval', {
        entityType: 'session',
        entityId: session.id,
        decision: 'adjustments_requested',
        comment: 'Corrija a descrição',
        expectedRevision: 1,
      });
      const changed = await command('lib-tutor', 'monitor', 'saveSession', {
        session: {
          id: session.id,
          expectedRevision: 1,
          disciplineId: 'T390',
          topic: 'Corrected session',
          description: 'Reviewed explanation',
          date: '2099-11-24',
          time: '15:00',
          durationMinutes: 60,
          capacity: 2,
          location: 'Room',
        },
      });
      assert.equal(changed.status, 'pending');
      assert.equal(changed.revision, 2);
      assert.equal((await state('lib-outsider', 'student')).sessions.length, 0);
      const agenda = await state('lib-student', 'student');
      assert.equal(
        agenda.reservations.find((r) => r.id === booking.id).status,
        'confirmed',
      );
      assert.equal(
        agenda.sessions.find((s) => s.id === changed.id).status,
        'pending',
      );
      await command(
        'lib-prof',
        'professor',
        'decideApproval',
        {
          entityType: 'session',
          entityId: changed.id,
          decision: 'approved',
          expectedRevision: 1,
        },
        409,
      );
      await command('lib-prof', 'professor', 'decideApproval', {
        entityType: 'session',
        entityId: changed.id,
        decision: 'approved',
        expectedRevision: 2,
      });
      assert.equal(
        (await state('lib-student', 'student')).sessions.find(
          (s) => s.id === changed.id,
        ).status,
        'approved',
      );
      const teacher = await state('lib-prof', 'professor'),
        csv = new MonitoringService({ read: () => teacher }).exportReportCsv(
          'lib-prof',
        );
      for (const value of [
        'Ajustes solicitados',
        'Corrija o conteúdo do PDF',
        'corrected.pdf',
        'Revisão 4',
      ])
        assert.ok(csv.includes(value), 'CSV missing ' + value);
    } finally {
      if (server) await new Promise((r) => server.close(r));
      await clear();
      for (const user of users)
        try {
          await auth.deleteUser(user.id);
        } catch {}
      await deleteApp(app);
    }
  },
);
