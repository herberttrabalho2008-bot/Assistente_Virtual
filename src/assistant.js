// O "cérebro" do Vasco: prompt, modos, ferramentas e o ciclo de chamadas ao modelo.
// Suporta a API da Anthropic e qualquer API compatível com OpenAI (OpenAI, Ollama, LM Studio…).
const SYSTEM = `És o Vasco, o assistente pessoal do dia a dia do utilizador. Falas sempre em português de Portugal, de forma descontraída (usa "tu"; diz "ecrã", "telemóvel", "autocarro", "a fazer"; evita brasileirismos).
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

function createAssistant({ settings, store, fetchImpl = fetch }) {
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

  async function post(url, headers, body) {
    const r = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    if (!r.ok) {
      console.error('Modelo', r.status, (await r.text()).slice(0, 300));
      throw Object.assign(new Error('api'), { status: r.status });
    }
    return r.json();
  }

  async function chatAnthropic(cfg, system, msgs, tz) {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const data = await post('https://api.anthropic.com/v1/messages',
        { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
        { model: cfg.model, max_tokens: 1500, system, tools: TOOLS, messages: msgs });
      const uses = data.content.filter(b => b.type === 'tool_use');
      if (data.stop_reason !== 'tool_use' || !uses.length) return data.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
      msgs.push({ role: 'assistant', content: data.content });
      msgs.push({
        role: 'user',
        content: uses.map(u => { const r = safeTool(u.name, u.input, tz); return { type: 'tool_result', tool_use_id: u.id, content: r.out, ...(r.ok ? {} : { is_error: true }) }; }),
      });
    }
    return GIVE_UP;
  }

  async function chatOpenAI(cfg, system, msgs, tz) {
    const tools = TOOLS.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
    const messages = [{ role: 'system', content: system }, ...msgs];
    const headers = cfg.apiKey ? { authorization: 'Bearer ' + cfg.apiKey } : {};
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const data = await post(cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions', headers, { model: cfg.model, messages, tools });
      const msg = data.choices && data.choices[0] && data.choices[0].message;
      if (!msg) throw Object.assign(new Error('resposta vazia'), { status: 502 });
      const calls = msg.tool_calls || [];
      if (!calls.length) return String(msg.content || '').trim();
      messages.push(msg);
      for (const c of calls) {
        let args = {};
        try { args = JSON.parse(c.function.arguments || '{}'); } catch {}
        messages.push({ role: 'tool', tool_call_id: c.id, content: safeTool(c.function.name, args, tz).out });
      }
    }
    return GIVE_UP;
  }

  async function chat({ messages, role, now, tzOffset }) {
    const cfg = settings.get();
    const system = SYSTEM + (ROLES[role] ? '\n' + ROLES[role] : '') + '\n\nAgora é ' + now;
    const msgs = messages.slice(-20).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 8000) }));
    while (msgs.length && msgs[0].role !== 'user') msgs.shift();
    if (!msgs.length) throw new Error('sem mensagens');
    return cfg.provider === 'openai' ? chatOpenAI(cfg, system, msgs, tzOffset) : chatAnthropic(cfg, system, msgs, tzOffset);
  }

  return { chat, isConfigured: () => settings.isConfigured() };
}

module.exports = { createAssistant, localToDate };
