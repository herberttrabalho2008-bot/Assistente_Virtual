const TK = 'camoes_token';
const getTok = () => { try { return localStorage.getItem(TK) || ''; } catch (e) { return ''; } };

// Pede ao servidor; se o código de acesso faltar ou estiver errado, pergunta uma vez e tenta de novo.
export async function api(method, url, body, retry = true) {
  const r = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', 'x-camoes-token': getTok() },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401 && retry) {
    const t = prompt('Código de acesso do Camões (CAMOES_TOKEN do servidor):');
    if (t === null) throw new Error('sem acesso');
    try { localStorage.setItem(TK, t.trim()); } catch (e) {}
    return api(method, url, body, false);
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw apiError(data, r.status);
  return data;
}

function apiError(data, status) {
  const e = new Error(data.error || 'erro'); e.status = status; e.code = data.error; e.detail = data.detail; e.upstream = data.status; return e;
}

// Como api(), mas a resposta chega aos bocados: onText(trecho) é chamado à medida que o texto sai.
export async function apiStream(url, body, onText, retry = true) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-camoes-token': getTok() },
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (r.status === 401 && retry) {
    const t = prompt('Código de acesso do Camões (CAMOES_TOKEN do servidor):');
    if (t === null) throw new Error('sem acesso');
    try { localStorage.setItem(TK, t.trim()); } catch (e) {}
    return apiStream(url, body, onText, false);
  }
  if (!r.ok) throw apiError(await r.json().catch(() => ({})), r.status);
  const reader = r.body.getReader(), dec = new TextDecoder();
  let buf = '', full = '';
  const handle = l => {
    if (!l.trim()) return;
    const o = JSON.parse(l);
    if (o.error) throw apiError(o, 502);
    if (o.t) { full += o.t; onText(o.t); }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { handle(buf.slice(0, i)); buf = buf.slice(i + 1); }
  }
  handle(buf);
  return full;
}
