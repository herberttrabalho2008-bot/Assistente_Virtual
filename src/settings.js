// Definições da API (fornecedor, modelo, chave), guardadas em data/settings.json.
// A chave nunca sai do servidor: o browser só vê se existe e as últimas letras.
const fs = require('fs');
const path = require('path');

const PROVIDERS = ['anthropic', 'openai'];
const DEFAULT_MODEL = { anthropic: 'claude-sonnet-5-5', openai: '' };
const DEFAULT_BASE = 'https://api.openai.com/v1';

const isLocalUrl = u => { try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(u).hostname); } catch { return false; } };

function createSettings(file, env = {}) {
  const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } };
  const write = obj => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, file);
  };

  function profile(name, saved) {
    const s = (saved.profiles || {})[name] || {};
    const envKey = name === 'anthropic' ? env.ANTHROPIC_API_KEY : env.OPENAI_API_KEY;
    const envModel = name === 'anthropic' ? env.CAMOES_MODEL : env.CAMOES_OPENAI_MODEL;
    const p = {
      apiKey: s.apiKey || envKey || '',
      keySource: s.apiKey ? 'definições' : envKey ? 'ambiente' : '',
      model: s.model || envModel || DEFAULT_MODEL[name],
    };
    if (name === 'openai') p.baseUrl = s.baseUrl || env.CAMOES_OPENAI_BASE_URL || DEFAULT_BASE;
    return p;
  }
  const activeName = saved => {
    const p = saved.provider || env.CAMOES_PROVIDER;
    return PROVIDERS.includes(p) ? p : 'anthropic';
  };

  function get() {
    const saved = read(), provider = activeName(saved);
    return { provider, ...profile(provider, saved) };
  }
  // Modelos locais (Ollama, LM Studio) não precisam de chave.
  function isConfigured() {
    const c = get();
    return !!c.model && (!!c.apiKey || (c.provider === 'openai' && isLocalUrl(c.baseUrl)));
  }

  function publicView() {
    const saved = read(), out = { provider: activeName(saved), configured: isConfigured(), profiles: {} };
    for (const name of PROVIDERS) {
      const p = profile(name, saved);
      out.profiles[name] = {
        model: p.model, hasKey: !!p.apiKey, keyHint: p.apiKey ? '…' + p.apiKey.slice(-4) : '', keySource: p.keySource,
        ...(name === 'openai' ? { baseUrl: p.baseUrl } : {}),
      };
    }
    return out;
  }

  function update(body) {
    const fail = m => { throw Object.assign(new Error(m), { validation: true }); };
    if (!PROVIDERS.includes(body.provider)) fail('fornecedor inválido');
    const saved = read();
    saved.profiles = saved.profiles || {};
    const p = saved.profiles[body.provider] = saved.profiles[body.provider] || {};
    if (body.model !== undefined) {
      const m = String(body.model).trim();
      if (m.length > 100 || /\s/.test(m)) fail('modelo inválido');
      if (m) p.model = m; else delete p.model;
    }
    if (body.provider === 'openai' && body.baseUrl !== undefined) {
      const u = String(body.baseUrl).trim().replace(/\/+$/, '');
      if (u) {
        let parsed; try { parsed = new URL(u); } catch { fail('endereço inválido'); }
        if (!/^https?:$/.test(parsed.protocol)) fail('endereço inválido');
        p.baseUrl = u;
      } else delete p.baseUrl;
    }
    if (body.clearKey === true) delete p.apiKey;
    else if (typeof body.apiKey === 'string' && body.apiKey.trim()) {
      const k = body.apiKey.trim();
      if (k.length > 300 || /\s/.test(k)) fail('chave inválida');
      p.apiKey = k;
    }
    saved.provider = body.provider;
    write(saved);
    return publicView();
  }

  return { get, isConfigured, publicView, update };
}

module.exports = { createSettings, isLocalUrl };
