// O "cérebro" do Camões: prompt, modos, ferramentas e o ciclo de chamadas ao modelo.
// Suporta a API da Anthropic e qualquer API compatível com OpenAI (OpenAI, Ollama, LM Studio…).
const SYSTEM = `És o Camões, o assistente pessoal do dia a dia do utilizador. Falas sempre em português de Portugal, de forma descontraída (usa "tu"; diz "ecrã", "telemóvel", "autocarro", "a fazer"; evita brasileirismos).
Personalidade: inteligente, direto, de confiança, com sentido de humor. Respostas curtas por defeito; alongas-te só em explicações, trabalhos e código. Sem listas pesadas em conversa normal.
Lê o momento: em conversa leve podes brincar e usar sarcasmo ligeiro e amigável; em estudo, trabalho ou código foco total; em stress, tristeza ou assuntos sérios, zero sarcasmo, calma e apoio. Em dúvida, não brinques.
Honestidade: se não sabes, dizes. Nunca inventes factos, citações ou fontes. Não finjas capacidades que não tens: crias, listas e apagas lembretes com as ferramentas e falas por voz; ainda não geras imagens nem vídeos, nem controlas o computador, e dizes isso com franqueza.
Lembretes: usa add_reminder. Se faltar o dia ou a hora, pergunta. Confirma de forma curta.
Sem palavrões. Em saúde, dinheiro ou lei, informas mas lembras que não substituis um profissional.`;

const ROLES = {
  geral: '',
  estudo: 'Modo estudo: explica passo a passo com exemplos, verifica se a pessoa percebeu e propõe perguntas de treino.',
  codigo: 'Modo programação: código limpo e comentado, vais à causa dos erros e explicas o que fizeste.',
  criativo: 'Modo criativo: ideias, textos e histórias com imaginação; podes ser mais brincalhão.',
};

const TOOLS = [
  { name: 'add_reminder', description: 'Cria um lembrete. "when" é data e hora locais no formato YYYY-MM-DDTHH:mm.', input_schema: { type: 'object', properties: { text: { type: 'string' }, when: { type: 'string' } }, required: ['text', 'when'] } },
  { name: 'list_reminders', description: 'Lista os lembretes (com id).', input_schema: { type: 'object', properties: {} } },
  { name: 'delete_reminder', description: 'Apaga um lembrete pelo id.', input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
];

const MAX_TURNS = 5;
const GIVE_UP = 'Fiquei às voltas com isso. Tenta pedir de outra forma.';

// "when" vem em hora local do utilizador; tzOffset é o getTimezoneOffset() do browser (minutos).
function localToDate(when, tzOffset) {
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(String(when));
  if (!m) throw new Error('formato de data inválido');
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) + (Number(tzOffset) || 0) * 60000);
}

// Mensagem curta do fornecedor (formatos Anthropic, OpenAI e NVIDIA), para mostrar na app.
function providerDetail(raw) {
  let d = raw;
  try { const j = JSON.parse(raw); d = (j.error && (j.error.message || j.error)) || j.detail || j.message || raw; } catch {}
  return String(typeof d === 'string' ? d : JSON.stringify(d)).replace(/\s+/g, ' ').slice(0, 200);
}

// Lê um corpo "text/event-stream" e devolve cada evento JSON.
async function* sse(r) {
  const dec = new TextDecoder(); let buf = '';
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true });
    let m;
    while ((m = /\r?\n\r?\n/.exec(buf))) {
      const block = buf.slice(0, m.index); buf = buf.slice(m.index + m[0].length);
      const data = block.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n');
      if (data && data !== '[DONE]') { try { yield JSON.parse(data); } catch {} }
    }
  }
}

// Entrega o texto aos poucos; entre rondas de ferramentas separa os parágrafos.
function makeSink(onText) {
  let any = false, gap = false;
  return {
    put(s) { if (!s) return; if (gap && any) onText('\n\n'); gap = false; any = true; onText(s); },
    gap() { gap = true; },
  };
}

const parseJson = s => { try { return JSON.parse(s || '{}'); } catch { return {}; } };
function createAssistant({ settings, store, fetchImpl = fetch }) {
  // Modelos que recusaram ferramentas (400): da próxima vez já nem as enviamos.
  const noTools = new Set();

  function runTool(name, input, tzOffset) {
    if (name === 'add_reminder') { store.add(input.text, localToDate(input.when, tzOffset)); return 'Lembrete criado.'; }
    if (name === 'list_reminders') return JSON.stringify(store.list().map(({ id, text, when, done }) => ({ id, text, when, done })));
    if (name === 'delete_reminder') return store.remove(String(input.id)) ? 'Apagado.' : 'Não encontrei esse lembrete.';
    throw new Error('ferramenta desconhecida');
  }
  const safeTool = (name, input, tz) => {
    try { return { ok: true, out: runTool(name, input || {}, tz) }; }
    catch (e) { return { ok: false, out: 'Erro: ' + e.message }; }
  };

  async function request(url, headers, body) {
    const r = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    if (!r.ok) {
      const raw = await r.text();
      console.error('Modelo', r.status, raw.slice(0, 300));
      throw Object.assign(new Error('api'), { status: r.status, detail: providerDetail(raw) });
    }
    return r;
  }
  const post = async (url, headers, body) => (await request(url, headers, body)).json();

  // Anthropic em streaming: junta os blocos de texto e de ferramenta no mesmo formato da resposta normal.
  async function streamAnthropic(url, headers, body, sink) {
    const blocks = []; let stop;
    for await (const ev of sse(await request(url, headers, { ...body, stream: true }))) {
      if (ev.type === 'content_block_start') blocks[ev.index] = { ...ev.content_block, json: '' };
      else if (ev.type === 'content_block_delta' && blocks[ev.index]) {
        const b = blocks[ev.index];
        if (ev.delta.type === 'text_delta') { b.text = (b.text || '') + ev.delta.text; sink.put(ev.delta.text); }
        else if (ev.delta.type === 'input_json_delta') b.json += ev.delta.partial_json;
      } else if (ev.type === 'message_delta') stop = ev.delta.stop_reason;
      else if (ev.type === 'error') throw Object.assign(new Error('api'), { status: 502, detail: providerDetail(JSON.stringify(ev)) });
    }
    const content = blocks.filter(b => b && (b.type === 'text' || b.type === 'tool_use'))
      .map(b => b.type === 'text' ? { type: 'text', text: b.text || '' } : { type: 'tool_use', id: b.id, name: b.name, input: parseJson(b.json) });
    return { content, stop_reason: stop };
  }

  async function chatAnthropic(cfg, system, msgs, tz, sink) {
    const url = 'https://api.anthropic.com/v1/messages';
    const headers = { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' };
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const body = { model: cfg.model, max_tokens: 1500, system, tools: TOOLS, messages: msgs };
      const data = sink ? await streamAnthropic(url, headers, body, sink) : await post(url, headers, body);
      const uses = data.content.filter(b => b.type === 'tool_use');
      if (data.stop_reason !== 'tool_use' || !uses.length) return data.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
      if (sink) sink.gap();
      msgs.push({ role: 'assistant', content: data.content });
      msgs.push({
        role: 'user',
        content: uses.map(u => { const r = safeTool(u.name, u.input, tz); return { type: 'tool_result', tool_use_id: u.id, content: r.out, ...(r.ok ? {} : { is_error: true }) }; }),
      });
    }
    return GIVE_UP;
  }

  // OpenAI-compatível em streaming: reconstrói a mensagem (texto e chamadas de ferramentas) a partir dos deltas.
  async function streamOpenAI(url, headers, body, sink) {
    let content = ''; const calls = [];
    for await (const ev of sse(await request(url, headers, { ...body, stream: true }))) {
      const d = ev.choices && ev.choices[0] && ev.choices[0].delta;
      if (!d) continue;
      if (d.content) { content += d.content; sink.put(d.content); }
      for (const c of d.tool_calls || []) {
        const i = c.index || 0;
        const t = calls[i] || (calls[i] = { id: '', type: 'function', function: { name: '', arguments: '' } });
        if (c.id) t.id = c.id;
        if (c.function && c.function.name) t.function.name += c.function.name;
        if (c.function && c.function.arguments) t.function.arguments += c.function.arguments;
      }
    }
    const msg = { role: 'assistant', content: content || null }, cs = calls.filter(Boolean);
    if (cs.length) msg.tool_calls = cs;
    return { choices: [{ message: msg }] };
  }

  async function chatOpenAI(cfg, system, msgs, tz, sink) {
    const tools = TOOLS.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
    const messages = [{ role: 'system', content: system }, ...msgs];
    const headers = cfg.apiKey ? { authorization: 'Bearer ' + cfg.apiKey } : {};
    const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions';
    const key = url + '|' + cfg.model;
    const call = body => sink ? streamOpenAI(url, headers, body, sink) : post(url, headers, body);
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      let data;
      const withTools = !noTools.has(key);
      try { data = await call(withTools ? { model: cfg.model, messages, tools } : { model: cfg.model, messages }); }
      catch (e) {
        // Alguns modelos (vários da NVIDIA e locais) recusam ferramentas: conversa sem elas, sem lembretes pela conversa.
        if (e.status !== 400 || turn > 0 || !withTools) throw e;
        noTools.add(key);
        data = await call({ model: cfg.model, messages });
      }
      const msg = data.choices && data.choices[0] && data.choices[0].message;
      if (!msg) throw Object.assign(new Error('resposta vazia'), { status: 502 });
      const calls = msg.tool_calls || [];
      if (!calls.length) return String(msg.content || '').trim();
      if (sink) sink.gap();
      messages.push(msg);
      for (const c of calls) {
        messages.push({ role: 'tool', tool_call_id: c.id, content: safeTool(c.function.name, parseJson(c.function.arguments), tz).out });
      }
    }
    return GIVE_UP;
  }

  // Com onText, o texto vai saindo à medida que o modelo o escreve; o retorno é sempre o texto final.
  async function chat({ messages, role, now, tzOffset, onText }) {
    const cfg = settings.get();
    const system = SYSTEM + (ROLES[role] ? '\n' + ROLES[role] : '') + '\n\nAgora é ' + now;
    const msgs = messages.slice(-20).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 8000) }));
    while (msgs.length && msgs[0].role !== 'user') msgs.shift();
    if (!msgs.length) throw new Error('sem mensagens');
    const sink = onText ? makeSink(onText) : null;
    return cfg.provider === 'openai' ? chatOpenAI(cfg, system, msgs, tzOffset, sink) : chatAnthropic(cfg, system, msgs, tzOffset, sink);
  }

  return { chat, isConfigured: () => settings.isConfigured() };
}

module.exports = { createAssistant, localToDate };
