const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStore } = require('../src/store');
const { localToDate } = require('../src/assistant');

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'camoes-')), 'r.json');

test('store: criar, marcar como feito e apagar', () => {
  const s = createStore(tmpFile());
  assert.deepStrictEqual(s.list(), []);
  const r = s.add('ligar à mãe', '2030-01-01T10:00:00Z');
  assert.strictEqual(s.list().length, 1);
  assert.strictEqual(s.patch(r.id, { done: true }).done, true);
  assert.strictEqual(s.patch('nao-existe', { done: true }), null);
  assert.strictEqual(s.remove(r.id), true);
  assert.strictEqual(s.remove(r.id), false);
});

test('store: rejeita lembretes inválidos', () => {
  const s = createStore(tmpFile());
  assert.throws(() => s.add('', '2030-01-01T10:00:00Z'));
  assert.throws(() => s.add('x', 'não é data'));
});

test('localToDate: converte hora local com o desfasamento do browser', () => {
  // Lisboa no verão: getTimezoneOffset() = -60 → 19:00 locais são 18:00 UTC
  assert.strictEqual(localToDate('2030-07-01T19:00', -60).toISOString(), '2030-07-01T18:00:00.000Z');
  assert.throws(() => localToDate('amanhã', 0));
});
