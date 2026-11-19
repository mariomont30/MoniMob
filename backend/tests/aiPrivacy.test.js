import test from 'node:test';
import assert from 'node:assert/strict';
import { GeminiClient } from '../src/geminiClient.js';
import { sanitizeAiText } from '../src/aiPrivacy.js';

test('provider receives redacted questions, history and free-text academic context', async () => {
  let body;
  const client = new GeminiClient({ apiKey: 'test-provider-key', model: 'gemini-test', fetchImpl: async (_url, options) => {
    body = JSON.parse(options.body);
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Orientação segura.' }] } }] }) };
  } });
  await client.generate({ role: 'student',
    message: 'Minha senha: "SecretOnly123!"; meu e-mail é pessoa@unifor.br; matrícula: 987654321',
    history: [{ role: 'user', text: 'token=private-token-value, CPF 123.456.789-10' }],
    context: { email: 'secret@unifor.br', registration: 'private-registration', sessions: [{ topic: 'Contato professor@unifor.br', date: '2099-06-10', time: '18:30' }], source: 'MoniMob Cloud Firestore' },
  });
  const sent = JSON.stringify(body);
  assert.doesNotMatch(sent, /SecretOnly123|pessoa@|987654321|private-token-value|123\.456|secret@|professor@|private-registration/);
  assert.match(sent, /2099-06-10/);
  assert.match(sent, /18:30/);
  assert.match(sent, /MoniMob Cloud Firestore/);
  assert.match(body.systemInstruction.parts[0].text, /Do not provide exam answer keys/);
  assert.match(body.systemInstruction.parts[0].text, /Admit\s+uncertainty/);
});

test('redaction preserves academic questions and removes complete private key blocks', () => {
  assert.equal(sanitizeAiText('Como funciona uma árvore AVL com 8 nós?'), 'Como funciona uma árvore AVL com 8 nós?');
  assert.doesNotMatch(sanitizeAiText('-----BEGIN PRIVATE KEY-----\nprivate-key-body\n-----END PRIVATE KEY-----'), /private-key-body/);
  assert.doesNotMatch(sanitizeAiText('Bearer secret-authorization-value'), /secret-authorization-value/);
});
