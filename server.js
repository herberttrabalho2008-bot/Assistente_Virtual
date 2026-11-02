// Camões — ponto de entrada. A lógica está em src/.
const path = require('path');
const { ROOT, loadEnvFile, loadConfig } = require('./src/config');

loadEnvFile(path.join(ROOT, '.env'));
const config = loadConfig();

const { createStore } = require('./src/store');
const { createSettings } = require('./src/settings');
const { createAssistant } = require('./src/assistant');
const { createServer } = require('./src/http');

const store = createStore(config.dataFile);
const settings = createSettings(config.settingsFile, process.env);
const assistant = createAssistant({ settings, store });

createServer({ config, store, assistant, settings }).listen(config.port, config.host, () => {
  console.log(`Camões a correr em http://localhost:${config.port} (${config.host})`);
  if (!assistant.isConfigured()) console.log('Aviso: sem API configurada — abre Definições na app (ou define ANTHROPIC_API_KEY). Os lembretes funcionam.');
  if (!config.token) console.log('Sem CAMOES_TOKEN: só aceita ligações deste computador. Define-o para usar no telemóvel.');
});
