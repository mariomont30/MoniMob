import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createRuntime } from '../src/runtime.js';
import { MonitoringService } from '../src/domain/monitoring.js';
const enabled = Boolean(
  process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST,
);
test(
  'HTTP with real local Firestore/Auth: persisted favorites and shared material approval, download, re-review and removal',
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
      { id: 'lib-outsider', roles: ['monitor'], name: 'Unassigned tutor' },
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
        await db
          .doc('users/' + user.id)
          .set({
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
          headers: { authorization: 'Bearer ' + tokens[uid], 'content-type': 'application/json' },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
      let serial = 0;
      const command = async (uid, role, action, input = {}, expected = 200) => {
        if (action === 'decideApproval' && input.expectedRevision === undefined) { const ref=await db.doc((input.entityType==='session'?'sessions/':'materials/')+input.entityId).get();input={...input,expectedRevision:ref.data()?.revision || 1}; }
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
      const request = await command('lib-tutor', 'monitor', 'requestMonitorLink', {
        disciplineId: 'T390',
        professorId: 'lib-prof',
      });
      await command('lib-prof', 'professor', 'decideMonitorLink', {
        requestId: request.id,
        decision: 'approved',
        validUntil: '2099-12-31',
      });
      const pdf = Buffer.from('%PDF-1.7\nProfessor lesson\n%%EOF'),
        upload = async (uid, role, id, title, bytes, name) => {
          const r = await http(uid, '/api/materials/upload?role=' + role, {
            operationId: id,
            title,
            disciplineId: 'T390',
            name,
            data: bytes.toString('base64'),
          });
          const body = await r.json();
          assert.equal(r.status, 200, JSON.stringify(body));
          return body.result;
        };
      const teacherMaterial = await upload(
        'lib-prof',
        'professor',
        'library_prof_file_001',
        'Professor publication',
        pdf,
        'aula.pdf',
      );
      assert.equal(teacherMaterial.status, 'approved');
      for (const [id, role] of [
        ['lib-tutor', 'monitor'],
        ['lib-student', 'student'],
      ]) {
        assert.ok((await state(id, role)).materials.some((m) => m.id === teacherMaterial.id));
        const r = await http(id, '/api/materials/' + teacherMaterial.id + '/file?role=' + role);
        assert.equal(r.status, 200);
        assert.deepEqual(Buffer.from(await r.arrayBuffer()), pdf);
      }
      assert.equal(
        (await http('lib-outsider', '/api/materials/' + teacherMaterial.id + '/file?role=monitor'))
          .status,
        403,
      );
      await command(
        'lib-tutor',
        'monitor',
        'deleteMaterial',
        { materialId: teacherMaterial.id },
        403,
      );
      const jpg = Buffer.alloc(132 * 1024, 41);
      jpg.set([255, 216, 255], 0);
      const tutorFile = await upload(
        'lib-tutor',
        'monitor',
        'library_tutor_file_001',
        'Tutor image for approval',
        jpg,
        'aula.jpg',
      );
      assert.equal(tutorFile.status, 'pending');
      assert.ok(
        (await state('lib-prof', 'professor')).materials.some((m) => m.id === tutorFile.id),
      );
      assert.ok(
        !(await state('lib-student', 'student')).materials.some((m) => m.id === tutorFile.id),
      );
      assert.equal(
        (await http('lib-student', '/api/materials/' + tutorFile.id + '/file?role=student')).status,
        403,
      );
      assert.equal(
        (await http('lib-outsider', '/api/materials/' + tutorFile.id + '/file?role=monitor'))
          .status,
        403,
      );
      await command('lib-prof', 'professor', 'decideApproval', {
        entityType: 'material',
        entityId: tutorFile.id,
        decision: 'approved',
      });
      let downloaded = await http(
        'lib-student',
        '/api/materials/' + tutorFile.id + '/file?role=student',
      );
      assert.equal(downloaded.status, 200);
      assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), jpg);
      const link = await command('lib-tutor', 'monitor', 'saveMaterial', {
        material: { disciplineId: 'T390', title: 'Tutor link', url: 'https://unifor.br/aula' },
      });
      await command('lib-prof', 'professor', 'decideApproval', {
        entityType: 'material',
        entityId: link.id,
        decision: 'approved',
      });
      await command('lib-tutor', 'monitor', 'saveMaterial', {
        material: {
          id: link.id,
          disciplineId: 'T390',
          title: 'Revised tutor link',
          url: 'https://unifor.br/revisado',
        },
      });
      assert.ok(!(await state('lib-student', 'student')).materials.some((m) => m.id === link.id));
      assert.equal(
        (await state('lib-tutor', 'monitor')).materials.find((m) => m.id === link.id).status,
        'pending',
      );
      await command('lib-prof', 'professor', 'decideApproval', {
        entityType: 'material',
        entityId: link.id,
        decision: 'adjustments_requested',
        comment: 'Revise a referência',
      });
      assert.equal(
        (await state('lib-tutor', 'monitor')).approvals.filter((a) => a.entityId === link.id).at(-1)
          .comment,
        'Revise a referência',
      );
      await command('lib-tutor', 'monitor', 'saveMaterial', {
        material: {
          id: link.id,
          disciplineId: 'T390',
          title: 'Revised tutor link',
          url: 'https://unifor.br/revisado',
        },
      });
      await command('lib-prof', 'professor', 'decideApproval', {
        entityType: 'material',
        entityId: link.id,
        decision: 'approved',
      });
      assert.equal(
        (await state('lib-student', 'student')).materials.find((m) => m.id === link.id).url,
        'https://unifor.br/revisado',
      );
      const session = await command('lib-tutor', 'monitor', 'saveSession', {
        session: {
          disciplineId: 'T390',
          topic: 'Saved lesson',
          date: '2099-11-24',
          time: '15:00',
          durationMinutes: 60,
          capacity: 2,
          location: 'Room',
        },
      });
      await command('lib-student', 'student', 'setFavorite', {
        sessionId: session.id,
        favorite: true,
      });
      await command('lib-student', 'student', 'setFavorite', {
        sessionId: session.id,
        favorite: true,
      });
      await signIn(users.find((u) => u.id === 'lib-student'));
      let saved = await state('lib-student', 'student');
      assert.equal(saved.favorites.length, 1);
      assert.equal(saved.favorites[0].session.topic, 'Saved lesson');
      assert.equal(saved.reservations.length, 0);
      assert.equal((await state('lib-tutor', 'student')).favorites.length, 0);
      await command('lib-prof', 'professor', 'suspendSession', { sessionId: session.id });
      saved = await state('lib-student', 'student');
      assert.equal(saved.favorites[0].availability, 'cancelled');
      assert.equal(saved.sessions.length, 0);
      await db.doc('sessions/' + session.id).delete();
      saved = await state('lib-student', 'student');
      assert.equal(saved.favorites[0].session.topic, 'Saved lesson');
      assert.equal(saved.favorites[0].availability, 'unavailable');
      assert.equal(
        await command('lib-student', 'student', 'setFavorite', {
          sessionId: session.id,
          favorite: false,
        }),
        false,
      );
      assert.equal((await state('lib-student', 'student')).favorites.length, 0);
      await command('lib-prof', 'professor', 'deleteMaterial', { materialId: tutorFile.id });
      assert.equal(
        (await http('lib-student', '/api/materials/' + tutorFile.id + '/file?role=student')).status,
        403,
      );
      assert.ok(
        !(await state('lib-tutor', 'monitor')).materials.some(
          (m) => m.id === tutorFile.id && m.status !== 'deleted',
        ),
      );
      assert.equal(
        (await http('lib-tutor', '/api/materials/' + tutorFile.id + '/file?role=monitor')).status,
        403,
      );
      const teacher = await state('lib-prof', 'professor'),
        csv = new MonitoringService({ read: () => teacher }).exportReportCsv('lib-prof');
      for (const text of [
        'Material cadastrado',
        'Material excluído',
        'aula.jpg',
        'Revised tutor link',
      ])
        assert.ok(csv.includes(text), 'CSV must include ' + text);
      const tutorNotices = (await state('lib-tutor', 'monitor')).notifications;
      assert.ok(
        tutorNotices.some((n) => n.title === 'Novo material' && n.body === 'Professor publication'),
      );
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
