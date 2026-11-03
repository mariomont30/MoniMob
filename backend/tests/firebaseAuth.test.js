
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMoniBotServer } from '../src/app.js';


async function withServer(options, run) {
  const server = createMoniBotServer({
    geminiClient: {
      generate: async () => 'Resposta segura do MoniBot.'
    },
    ...options
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

async function ask(baseUrl, token, role = 'student') {
  const response = await fetch(`${baseUrl}/api/monibot`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      role,
      message: 'Como encontrar monitorias?',
      context: { screen: 'catalog' }
    })
  });

  return {
    status: response.status,
    body: await response.json()
  };
}

test('Firebase aceita usuário com token e perfil autorizados', async () => {
  await withServer({
    verifyFirebaseToken: async () => ({
      userId: 'firebase-student-1'
    }),
    getFirebaseRoles: async () => ['student']
  }, async baseUrl => {
    const result = await ask(baseUrl, 'parte1.parte2.parte3');

    assert.equal(result.status, 200);
    assert.equal(result.body.answer, 'Resposta segura do MoniBot.');
  });
});

test('Firebase rejeita token inválido', async () => {
  await withServer({
    verifyFirebaseToken: async () => {
      throw Object.assign(new Error('Token inválido'), { status: 401 });
    },
    getFirebaseRoles: async () => ['student']
  }, async baseUrl => {
    const result = await ask(baseUrl, 'parte1.parte2.parte3');

    assert.equal(result.status, 401);
  });
});

test('Firebase bloqueia usuário sem perfil autorizado', async () => {
  await withServer({
    verifyFirebaseToken: async () => ({
      userId: 'firebase-student-1'
    }),
    getFirebaseRoles: async () => []
  }, async baseUrl => {
    const result = await ask(baseUrl, 'parte1.parte2.parte3');

    assert.equal(result.status, 403);
  });
});

test('Firebase impede aluno de assumir perfil de professor', async () => {
  await withServer({
    verifyFirebaseToken: async () => ({
      userId: 'firebase-student-1'
    }),
    getFirebaseRoles: async () => ['student']
  }, async baseUrl => {
    const result = await ask(
      baseUrl,
      'parte1.parte2.parte3',
      'professor'
    );

    assert.equal(result.status, 403);
  });
});
