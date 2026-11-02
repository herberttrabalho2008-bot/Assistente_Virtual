const TK = 'vasco_token';
const getTok = () => { try { return localStorage.getItem(TK) || ''; } catch (e) { return ''; } };

// Pede ao servidor; se o código de acesso faltar ou estiver errado, pergunta uma vez e tenta de novo.
export async function api(method, url, body, retry = true) {
  const r = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', 'x-vasco-token': getTok() },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401 && retry) {
    const t = prompt('Código de acesso do Vasco (VASCO_TOKEN do servidor):');
    if (t === null) throw new Error('sem acesso');
    try { localStorage.setItem(TK, t.trim()); } catch (e) {}
    return api(method, url, body, false);
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(data.error || 'erro'); e.status = r.status; e.code = data.error; throw e; }
  return data;
}
