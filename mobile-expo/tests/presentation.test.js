import test from 'node:test';
import assert from 'node:assert/strict';
import { displayDate, availabilityLabel, assistantBlocks } from '../src/services/presentation.js';
test('academic dates are displayed in Brazilian order without timezone conversion', () => {
  assert.equal(displayDate('2026-11-15'), '15/11/2026');
  assert.equal(displayDate(''), '');
  assert.equal(displayDate('A definir'), 'A definir');
});
test('availability is explicit and never displays negative or ambiguous occupied seats', () => {
  assert.equal(availabilityLabel(2, 1), '1 vaga disponível de 2');
  assert.equal(availabilityLabel(4, 1), '3 vagas disponíveis de 4');
  assert.equal(availabilityLabel(2, 3), 'Sem vagas disponíveis');
});
test('assistant formatting preserves headings, lists and emphasis without executing HTML', () => {
  const blocks = assistantBlocks(
    '## Sua agenda\n- **Data:** 15/11/2026\n`18:30`\n<script>alert(1)</script>',
  );
  assert.equal(blocks[0].heading, true);
  assert.equal(blocks[0].parts[0].text, 'Sua agenda');
  assert.ok(blocks[1].parts.some((p) => p.strong && p.text === 'Data:'));
  assert.ok(blocks[2].parts[0].code);
  assert.equal(blocks[3].parts[0].text, '<script>alert(1)</script>');
});
