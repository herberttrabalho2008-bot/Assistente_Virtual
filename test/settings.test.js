const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { createStore } = require('../src/store');
const { createSettings } = require('../src/settings');
const { createAssistant } = require('../src/assistant');
const { createServer } = require('../src/http');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vasco-'));
const NOW = { role: 'geral', now: 'agora', tzOffset: 0 };

test('settings: por omissão Anthropic, sem chave = não configurado', () => {
  const s = createSettings(path.join(tmp(), 's.json'), {});
  assert.strictEqual(s.get().provider, 'anthropic');
  assert.strictEqual(s.isConfigured(), false);
});

test('settings: chave do ambiente conta; guardada nas definições tem prioridade', () => {
  const s = createSettings(path.join(tmp(), 's.json'), { ANTHROPIC_API_KEY: 'sk-env-1234' });
  assert.strictEqual(s.isConfigured(), true);
  assert.strictEqual(s.publicView().profiles.anthropic.keySource, 'ambiente');
  s.update({ provider: 'anthropic', apiKey: 'sk-ui-9999' });
  assert.strictEqual(s.get().apiKey, 'sk-ui-9999');
  assert.strictEqual(s.publicView().profiles.anthropic.keySource, 'definições');
});

test('settings: a vista pública nunca inclui a chave', () => {
  const s = createSettings(path.join(tmp(), 's.json'), {});
  s.update({ provider: 'openai', apiKey: 'sk-segredo-ABCD', model: 'x', baseUrl: 'https://api.openai.com/v1' });
  const txt = JSON.stringify(s.publicView());
  assert.ok(!txt.includes('segredo'));
  assert.ok(txt.includes('ABCD'));
});

test('settings: validação e perfis separados por fornecedor', () => {
  const s = createSettings(path.join(tmp(), 's.json'), {});
  assert.throws(() => s.update({ provider: 'outro' }), e => e.validation);
  assert.throws(() => s.update({ provider: 'openai', baseUrl: 'ftp://x' }), e => e.validation);
  assert.throws(() => s.update({ provider: 'openai', baseUrl: 'não é url' }), e => e.validation);
  assert.throws(() => s.update({ provider: 'anthropic', apiKey: 'tem espaços' }), e => e.validation);
  s.update({ provider: 'anthropic', apiKey: 'sk-ant-AAAA' });
  s.update({ provider: 'openai', apiKey: 'sk-oai-BBBB', model: 'm' });
  const v = s.publicView();
  assert.strictEqual(v.provider, 'openai');
  assert.strictEqual(v.profiles.anthropic.keyHint, '…AAAA');
  assert.strictEqual(v.profiles.openai.keyHint, '…BBBB');
  s.update({ provider: 'openai', clearKey: true });
  assert.strictEqual(s.publicView().profiles.openai.hasKey, false);
});

test('settings: modelo local (localhost) não precisa de chave', () => {
  const s = createSettings(path.join(tmp(), 's.json'), {});
  s.update({ provider: 'openai', model: 'llama3', baseUrl: 'http://localhost:11434/v1' });
  assert.strictEqual(s.isConfigured(), true);
  s.update({ provider: 'openai', baseUrl: 'https://api.openai.com/v1' });
  assert.strictEqual(s.isConfigured(), false);
});

function setup(env, fetchImpl) {
  const dir = tmp();
  const store = createStore(path.join(dir, 'r.json'));
  const settings = createSettings(path.join(dir, 's.json'), env);
  return { store, settings, assistant: createAssistant({ settings, store, fetchImpl }) };
}
const ok = body => ({ ok: true, json: async () => body, text: async () => '' });

test('assistente (Anthropic): usa a chave e o modelo, e executa ferramentas', async () => {
  const calls = [];
  const fake = async (url, opts) => {
    calls.push({ url, headers: opts.headers, body: JSON.parse(opts.body) });
    return calls.length === 1
      ? ok({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'add_reminder', input: { text: 'pão', when: '2030-07-01T19:00' } }] })
      : ok({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Feito.' }] });
  };
  const { store, assistant } = setup({ ANTHROPIC_API_KEY: 'sk-ant', VASCO_MODEL: 'claude-x' }, fake);
  const text = await assistant.chat({ messages: [{ role: 'user', content: 'lembra-me do pão' }], ...NOW, tzOffset: -60 });
  assert.strictEqual(text, 'Feito.');
  assert.strictEqual(calls[0].url, 'https://api.anthropic.com/v1/messages');
  assert.strictEqual(calls[0].headers['x-api-key'], 'sk-ant');
  assert.strictEqual(calls[0].body.model, 'claude-x');
  assert.strictEqual(store.list()[0].when, '2030-07-01T18:00:00.000Z');
});

test('assistente (OpenAI-compatível): endereço, chave, ferramentas e resposta', async () => {
  const calls = [];
  const fake = async (url, opts) => {
    calls.push({ url, headers: opts.headers, body: JSON.parse(opts.body) });
    return calls.length === 1
      ? ok({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'add_reminder', arguments: '{"text":"leite","when":"2030-07-01T09:00"}' } }] } }] })
      : ok({ choices: [{ message: { role: 'assistant', content: 'Pronto.' } }] });
  };
  const { store, settings, assistant } = setup({}, fake);
  settings.update({ provider: 'openai', apiKey: 'sk-oai', model: 'gpt-x', baseUrl: 'http://localhost:11434/v1/' });
  const text = await assistant.chat({ messages: [{ role: 'user', content: 'lembra-me do leite' }], ...NOW });
  assert.strictEqual(text, 'Pronto.');
  assert.strictEqual(calls[0].url, 'http://localhost:11434/v1/chat/completions');
  assert.strictEqual(calls[0].headers.authorization, 'Bearer sk-oai');
  assert.strictEqual(calls[0].body.model, 'gpt-x');
  assert.strictEqual(calls[0].body.messages[0].role, 'system');
  assert.strictEqual(store.list().length, 1);
  assert.strictEqual(calls[1].body.messages.at(-1).role, 'tool');
});

test('assistente: erro do fornecedor sobe com o estado HTTP', async () => {
  const fake = async () => ({ ok: false, status: 401, text: async () => 'no' });
  const { assistant } = setup({ ANTHROPIC_API_KEY: 'k' }, fake);
  await assert.rejects(assistant.chat({ messages: [{ role: 'user', content: 'oi' }], ...NOW }), e => e.status === 401);
});

async function serve(env, fetchImpl, config = {}) {
  const { store, settings, assistant } = setup(env, fetchImpl);
  const server = createServer({ config: { token: '', publicDir: path.join(__dirname, '..', 'public'), ...config }, store, settings, assistant });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  return { base: 'http://127.0.0.1:' + port, port, close: () => new Promise(r => server.close(r)) };
}
const J = (method, body, headers = {}) => ({ method, headers: { 'content-type': 'application/json', ...headers }, body: body && JSON.stringify(body) });

test('API: guardar definições, nunca devolve a chave, e /test usa o fornecedor', async () => {
  const fake = async () => ok({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] });
  const s = await serve({}, fake);
  try {
    assert.strictEqual((await (await fetch(s.base + '/api/ping')).json()).chat, false);
    assert.strictEqual((await fetch(s.base + '/api/settings/test', J('POST'))).status, 503);
    const put = await fetch(s.base + '/api/settings', J('PUT', { provider: 'anthropic', apiKey: 'sk-ant-SECRETO-1234' }));
    const txt = await put.text();
    assert.strictEqual(put.status, 200);
    assert.ok(!txt.includes('SECRETO'));
    assert.ok(!(await (await fetch(s.base + '/api/settings')).text()).includes('SECRETO'));
    assert.strictEqual((await (await fetch(s.base + '/api/ping')).json()).chat, true);
    const t = await fetch(s.base + '/api/settings/test', J('POST'));
    assert.strictEqual(t.status, 200);
    assert.strictEqual((await fetch(s.base + '/api/settings', J('PUT', { provider: 'x' }))).status, 400);
  } finally { await s.close(); }
});

test('API: chave recusada pelo fornecedor devolve código "chave"', async () => {
  const fake = async () => ({ ok: false, status: 401, text: async () => 'no' });
  const s = await serve({ ANTHROPIC_API_KEY: 'k' }, fake);
  try {
    const r = await fetch(s.base + '/api/chat', J('POST', { messages: [{ role: 'user', content: 'oi' }] }));
    assert.strictEqual(r.status, 502);
    assert.strictEqual((await r.json()).error, 'chave');
  } finally { await s.close(); }
});

test('segurança: bloqueia escritas de outros sites e pedidos sem JSON', async () => {
  const s = await serve({});
  try {
    const body = JSON.stringify({ provider: 'openai', baseUrl: 'https://evil.example/v1' });
    const cross = await fetch(s.base + '/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body });
    assert.strictEqual(cross.status, 403);
    const plain = await fetch(s.base + '/api/settings', { method: 'PUT', headers: { 'content-type': 'text/plain' }, body });
    assert.strictEqual(plain.status, 403);
    assert.strictEqual((await (await fetch(s.base + '/api/settings')).json()).provider, 'anthropic');
  } finally { await s.close(); }
});

test('segurança: sem token, rejeita Host que não seja localhost (DNS rebinding)', async () => {
  const s = await serve({});
  try {
    const status = await new Promise(res => {
      const c = net.connect(s.port, '127.0.0.1', () => c.write('GET /api/settings HTTP/1.1\r\nHost: evil.example\r\nConnection: close\r\n\r\n'));
      let d = ''; c.on('data', x => d += x); c.on('end', () => res(d.split(' ')[1]));
    });
    assert.strictEqual(status, '403');
  } finally { await s.close(); }
});
