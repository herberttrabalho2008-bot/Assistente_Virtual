const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStore } = require('../src/store');
const { createSettings } = require('../src/settings');
const { createAssistant } = require('../src/assistant');
const { createServer } = require('../src/http');

const sse = evs => new Response(evs.map(e => 'data: ' + (typeof e === 'string' ? e : JSON.stringify(e)) + '\n\n').join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } });
const delta = (content, extra = {}) => ({ choices: [{ delta: { content, ...extra } }] });

function setup(fetchImpl, profile = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'camoes-'));
  const store = createStore(path.join(dir, 'r.json'));
  const settings = createSettings(path.join(dir, 's.json'), {});
  settings.update({ provider: 'openai', baseUrl: 'http://modelo.local/v1', model: 'm', apiKey: 'k', ...profile });
  return { store, settings, assistant: createAssistant({ settings, store, fetchImpl }) };
}

test('streaming (OpenAI-compatível): o texto sai aos poucos e o retorno é o texto final', async () => {
  const bodies = [];
  const { assistant } = setup(async (_u, o) => { bodies.push(JSON.parse(o.body)); return sse([delta('Olá'), delta(' mundo'), '[DONE]']); });
  const parts = [];
  const text = await assistant.chat({ messages: [{ role: 'user', content: 'oi' }], role: 'geral', now: 'agora', tzOffset: 0, onText: t => parts.push(t) });
  assert.deepStrictEqual(parts, ['Olá', ' mundo']);
  assert.strictEqual(text, 'Olá mundo');
  assert.strictEqual(bodies[0].stream, true);
});

test('streaming (OpenAI-compatível): reconstrói chamadas de ferramentas partidas em bocados', async () => {
  let n = 0;
  const { assistant, store } = setup(async () => {
    if (n++) return sse([delta('Feito.'), '[DONE]']);
    return sse([
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'add_reminder', arguments: '{"text":"ler",' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"when":"2030-01-01T10:00"}' } }] } }] },
      '[DONE]',
    ]);
  });
  const parts = [];
  const text = await assistant.chat({ messages: [{ role: 'user', content: 'lembra-me' }], role: 'geral', now: 'agora', tzOffset: 0, onText: t => parts.push(t) });
  assert.strictEqual(text, 'Feito.');
  assert.strictEqual(store.list().length, 1);
  assert.strictEqual(store.list()[0].text, 'ler');
});

test('streaming (Anthropic): texto em deltas e ferramenta com JSON em bocados', async () => {
  let n = 0;
  const { settings, store } = setup(async () => sse([]));
  settings.update({ provider: 'anthropic', apiKey: 'k', model: 'claude-x' });
  const assistant = createAssistant({ settings, store, fetchImpl: async () => {
    if (n++) return sse([{ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Pronto' } }, { type: 'message_delta', delta: { stop_reason: 'end_turn' } }]);
    return sse([
      { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't1', name: 'add_reminder', input: {} } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"text":"x",' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '"when":"2030-01-01T10:00"}' } },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
    ]);
  } });
  const parts = [];
  const text = await assistant.chat({ messages: [{ role: 'user', content: 'oi' }], role: 'geral', now: 'agora', tzOffset: 0, onText: t => parts.push(t) });
  assert.strictEqual(text, 'Pronto');
  assert.deepStrictEqual(parts, ['Pronto']);
  assert.strictEqual(store.list().length, 1);
});

test('ferramentas recusadas (400): só repete uma vez e depois nem as envia', async () => {
  const bodies = [];
  const { assistant } = setup(async (_u, o) => {
    const b = JSON.parse(o.body); bodies.push(b);
    if (b.tools) return new Response('{"detail":"tools not supported"}', { status: 400 });
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 });
  });
  const ask = () => assistant.chat({ messages: [{ role: 'user', content: 'oi' }], role: 'geral', now: 'agora', tzOffset: 0 });
  assert.strictEqual(await ask(), 'ok');
  assert.strictEqual(await ask(), 'ok');
  assert.deepStrictEqual(bodies.map(b => !!b.tools), [true, false, false]);
});

test('API: /api/chat com stream:true devolve linhas JSON e erros com o estado certo', async () => {
  const { store, settings, assistant } = setup(async () => sse([delta('Olá'), delta('!'), '[DONE]']));
  const server = createServer({ config: { token: '', publicDir: path.join(__dirname, '..', 'public') }, store, settings, assistant });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const r = await fetch(base + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'oi' }], stream: true }) });
    assert.strictEqual(r.status, 200);
    const lines = (await r.text()).trim().split('\n').map(JSON.parse);
    assert.deepStrictEqual(lines, [{ t: 'Olá' }, { t: '!' }, { done: true }]);
  } finally { await new Promise(r => server.close(r)); }
});
