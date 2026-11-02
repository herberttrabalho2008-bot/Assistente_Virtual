// Servidor HTTP: ficheiros estáticos, autenticação e rotas /api.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json',
};

function send(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > 200000) { reject(Object.assign(new Error('grande'), { status: 413 })); req.destroy(); } else chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); }
      catch { reject(Object.assign(new Error('json'), { status: 400 })); }
    });
  });
}

const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];
const hostname = h => String(h || '').replace(/:\d+$/, '').toLowerCase();

function createServer({ config, store, assistant, settings }) {
  // Defesas contra páginas de outros sites a mexer no servidor (CSRF e DNS rebinding):
  // sem token só aceita nomes de localhost; escritas exigem JSON e, se houver Origin, o mesmo host.
  const sameSite = req => {
    if (!config.token && !LOOPBACK.includes(hostname(req.headers.host))) return false;
    if (req.method === 'GET' || req.method === 'HEAD') return true;
    if (!/^application\/json/i.test(req.headers['content-type'] || '') && req.method !== 'DELETE') return false;
    const o = req.headers.origin;
    if (!o) return true;
    try { return new URL(o).host === req.headers.host; } catch { return false; }
  };

  const authed = req => {
    if (!config.token) return true;
    const got = Buffer.from(String(req.headers['x-camoes-token'] || ''));
    const want = Buffer.from(config.token);
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  };

  // 401/403 do fornecedor = chave recusada; o resto é falha do modelo ou da rede.
  const modelError = e => (e.status === 401 || e.status === 403 ? 'chave' : 'modelo');

  // Limite simples por IP para a rota que gasta dinheiro.
  const hits = new Map();
  const limited = ip => {
    const now = Date.now(), arr = (hits.get(ip) || []).filter(t => now - t < 60000);
    arr.push(now); hits.set(ip, arr);
    return arr.length > 20;
  };

  async function api(req, res, url) {
    if (!sameSite(req)) return send(res, 403, { error: 'origem' });
    if (!authed(req)) return send(res, 401, { error: 'token' });
    const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
    if (parts[1] === 'ping') return send(res, 200, { ok: true, chat: assistant.isConfigured() });

    if (parts[1] === 'settings') {
      if (parts[2] === 'test' && req.method === 'POST') {
        if (!assistant.isConfigured()) return send(res, 503, { error: 'sem_chave' });
        if (limited(req.socket.remoteAddress)) return send(res, 429, { error: 'rate' });
        try {
          const text = await assistant.chat({ messages: [{ role: 'user', content: 'Responde só com a palavra: ok' }], role: 'geral', now: new Date().toISOString(), tzOffset: 0 });
          return send(res, 200, { ok: true, text: text.slice(0, 100) });
        } catch (e) { return send(res, e.status === 429 ? 429 : 502, { error: modelError(e), status: e.status, detail: e.detail }); }
      }
      if (!parts[2] && req.method === 'GET') return send(res, 200, settings.publicView());
      if (!parts[2] && req.method === 'PUT') {
        try { return send(res, 200, settings.update(await readJson(req))); }
        catch (e) { if (e.validation) return send(res, 400, { error: 'pedido', message: e.message }); throw e; }
      }
    }

    if (parts[1] === 'reminders') {
      if (req.method === 'GET') return send(res, 200, store.list());
      if (req.method === 'POST') {
        const b = await readJson(req);
        try { return send(res, 200, store.add(b.text, b.when)); } catch { return send(res, 400, { error: 'pedido' }); }
      }
      if (req.method === 'PATCH' && parts[2]) {
        const r = store.patch(parts[2], await readJson(req));
        return send(res, r ? 200 : 404, r || { error: 'nao encontrado' });
      }
      if (req.method === 'DELETE' && parts[2]) return send(res, store.remove(parts[2]) ? 200 : 404, { ok: true });
    }

    if (parts[1] === 'chat' && req.method === 'POST') {
      if (!assistant.isConfigured()) return send(res, 503, { error: 'sem_chave' });
      if (limited(req.socket.remoteAddress)) return send(res, 429, { error: 'rate' });
      const b = await readJson(req);
      if (!Array.isArray(b.messages)) return send(res, 400, { error: 'pedido' });
      try {
        const text = await assistant.chat({ messages: b.messages, role: b.role, now: String(b.now || new Date().toISOString()).slice(0, 200), tzOffset: b.tzOffset });
        return send(res, 200, { text });
      } catch (e) {
        return send(res, e.status === 429 ? 429 : 502, { error: modelError(e), status: e.status, detail: e.detail });
      }
    }
    send(res, 404, { error: 'nao encontrado' });
  }

  function serveStatic(req, res, url) {
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.normalize(path.join(config.publicDir, rel));
    if (!file.startsWith(config.publicDir + path.sep)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('Não encontrado'); }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': file.endsWith('sw.js') ? 'no-cache' : 'public, max-age=300' });
      res.end(buf);
    });
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (url.pathname.startsWith('/api/')) await api(req, res, url);
      else if (req.method === 'GET') serveStatic(req, res, url);
      else { res.writeHead(405); res.end(); }
    } catch (e) {
      if (!res.headersSent) send(res, e.status || 500, { error: 'erro' });
    }
  });
}

module.exports = { createServer };
