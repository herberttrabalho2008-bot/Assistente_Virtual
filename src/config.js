// Configuração: variáveis de ambiente, com suporte a um ficheiro .env na raiz (sem dependências).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function loadEnvFile(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return; }
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    // As variáveis já definidas no ambiente têm prioridade sobre o .env.
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

function loadConfig(env = process.env) {
  const token = env.CAMOES_TOKEN || '';
  return {
    port: Number(env.PORT) || 3000,
    token,
    // Sem token, só aceita ligações deste computador. Com token, fica acessível na rede.
    host: env.HOST || (token ? '0.0.0.0' : '127.0.0.1'),
    publicDir: path.join(ROOT, 'public'),
    dataFile: env.CAMOES_DATA || path.join(ROOT, 'data', 'reminders.json'),
    settingsFile: env.CAMOES_SETTINGS || path.join(ROOT, 'data', 'settings.json'),
  };
}

module.exports = { ROOT, loadEnvFile, loadConfig };
