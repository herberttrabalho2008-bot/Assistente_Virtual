const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStore } = require('../src/store');
const { createSettings } = require('../src/settings');
const { createAssistant } = require('../src/assistant');
const { createServer } = require('../src/http');

async function start(over = {}, env = {}, fetchImpl) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'camoes-'));
  const config = { token: '', publicDir: path.join(__dirname, '..', 'public'), ...over };
  const store = createStore(path.join(dir, 'r.json'));
  const settings = createSettings(path.join(dir, 's.json'), env);
  const server = createServer({ config, store, settings, assistant: createAssistant({ settings, store, fetchImpl }) });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  return { base, close: () => new Promise(r => server.close(r)) };
}
const json = (method, body, headers = {}) => ({ method, headers: { 'content-type': 'application/json', ...headers }, body: body && JSON.stringify(body) });

test('lembretes: criar, listar, marcar e apagar via API', async () => {
  const s = await start();
  try {
    const r = await (await fetch(s.base + '/api/reminders', json('POST', { text: 'teste', when: '2030-01-01T10:00:00Z' }))).json();
    assert.strictEqual((await (await fetch(s.base + '/api/reminders')).json()).length, 1);
    const p = await fetch(s.base + '/api/reminders/' + r.id, json('PATCH', { done: true }));
    assert.strictEqual((await p.json()).done, true);
    assert.strictEqual((await fetch(s.base + '/api/reminders/' + r.id, { method: 'DELETE' })).status, 200);
    assert.strictEqual((await fetch(s.base + '/api/reminders', json('POST', { text: '', when: 'x' }))).status, 400);
  } finally { await s.close(); }
});

test('auth: exige o token quando definido', async () => {
  const s = await start({ token: 'segredo' });
  try {
    assert.strictEqual((await fetch(s.base + '/api/reminders')).status, 401);
    assert.strictEqual((await fetch(s.base + '/api/reminders', { headers: { 'x-camoes-token': 'errado' } })).status, 401);
    assert.strictEqual((await fetch(s.base + '/api/reminders', { headers: { 'x-camoes-token': 'segredo' } })).status, 200);
  } finally { await s.close(); }
});

test('chat: 503 sem chave da API', async () => {
  const s = await start();
  try {
    const r = await fetch(s.base + '/api/chat', json('POST', { messages: [{ role: 'user', content: 'oi' }] }));
    assert.strictEqual(r.status, 503);
  } finally { await s.close(); }
});

test('estáticos: serve a app e bloqueia saídas de public/', async () => {
  const s = await start();
  try {
    assert.strictEqual((await fetch(s.base + '/')).status, 200);
    assert.strictEqual((await fetch(s.base + '/js/main.js')).status, 200);
    // fetch normaliza "..", por isso usa-se um pedido TCP cru
    const net = require('net');
    const status = await new Promise(res => {
      const c = net.connect(new URL(s.base).port, '127.0.0.1', () => c.write('GET /../server.js HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n'));
      let d = ''; c.on('data', x => d += x); c.on('end', () => res(d.split(' ')[1]));
    });
    assert.notStrictEqual(status, '200');
  } finally { await s.close(); }
});
