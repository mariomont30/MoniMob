import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMoniBotHistory } from '../src/services/monibotHistory.js';

test('histórico inclui somente pares completos user/model', () => {
  const history = buildMoniBotHistory([
    { from: 'user', text: 'Quero Java.' },
    { from: 'bot', text: 'Há monitorias de Java.' },
    { from: 'user', text: 'E amanhã?' },
    { from: 'error', text: 'Falha na conexão.' },
  ]);
  assert.deepEqual(history, [
    { role: 'user', text: 'Quero Java.' },
    { role: 'model', text: 'Há monitorias de Java.' },
  ]);
});

test('histórico longo começa com user, termina com model e mantém no máximo cinco pares', () => {
  const messages = [];
  for (let index = 0; index < 8; index += 1) {
    messages.push({ from: 'user', text: `Pergunta ${index}` });
    messages.push({ from: 'bot', text: `Resposta ${index}` });
  }
  const history = buildMoniBotHistory(messages);
  assert.equal(history.length, 10);
  assert.equal(history[0].role, 'user');
  assert.equal(history.at(-1).role, 'model');
  assert.equal(history[0].text, 'Pergunta 3');
});

test('histórico limita o tamanho de cada mensagem e ignora pergunta sem resposta', () => {
  const history = buildMoniBotHistory([
    { from: 'user', text: 'x'.repeat(900) },
    { from: 'bot', text: 'y'.repeat(900) },
    { from: 'user', text: 'pergunta ainda pendente' },
  ]);
  assert.equal(history.length, 2);
  assert.equal(history[0].text.length, 600);
  assert.equal(history[1].text.length, 600);
});
