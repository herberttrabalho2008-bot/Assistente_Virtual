# VASCO

Assistente virtual pessoal, em português de Portugal. Corre no PC e no telemóvel (como app instalável, PWA) a partir de um servidor teu.

- Conversa por texto e por voz (esfera animada, modos Geral / Estudo / Programação / Criativo).
- Lembretes guardados no servidor, por isso iguais em todos os dispositivos.
- Sem dependências: só Node 18+.

## Arrancar no PC

```bash
node server.js
```

Abre http://localhost:3000 e vai a **Definições** para escolher a API. Sem `VASCO_TOKEN`, o servidor só aceita ligações do próprio computador.

Opcionais: `PORT` (3000), `VASCO_TOKEN`.

## Escolher a API (Definições)

- **Anthropic (Claude):** modelo (por omissão `claude-sonnet-5-5`) e chave.
- **Compatível com OpenAI:** endereço, modelo e chave. Serve para a OpenAI e para modelos locais como Ollama (`http://localhost:11434/v1`) ou LM Studio; em endereços `localhost` a chave é opcional e o nome do modelo é obrigatório.
- Cada fornecedor guarda a sua própria chave. **Testar** faz uma chamada real ao modelo.
- As definições ficam em `data/settings.json` (fora do Git, só no servidor). A chave nunca volta a ser mostrada no browser.
- Em alternativa, podes definir `ANTHROPIC_API_KEY` (ou `OPENAI_API_KEY`) no ambiente ou no `.env`; o que gravares em Definições tem prioridade. Também existem `VASCO_PROVIDER`, `VASCO_MODEL`, `VASCO_OPENAI_MODEL` e `VASCO_OPENAI_BASE_URL`.
- Quem tiver acesso ao Vasco pode mudar a API e o endereço: por isso o `VASCO_TOKEN` é obrigatório fora do localhost. As rotas de escrita rejeitam pedidos vindos de outros sites e, sem token, Hosts que não sejam localhost.

## Usar no telemóvel

Define um código de acesso (obrigatório para sair do localhost) e arranca:

```bash
VASCO_TOKEN=um-codigo-grande-e-aleatorio node server.js
```

O telemóvel tem de chegar ao servidor. Há duas formas, e **a escolha importa**:

1. **Mesma rede Wi-Fi** (`http://IP-do-PC:3000`): funciona para texto e lembretes, mas o browser **bloqueia microfone, notificações e a instalação como app** em `http` que não seja localhost.
2. **HTTPS** (recomendado): põe o Vasco atrás de um túnel ou servidor com HTTPS, por exemplo Tailscale (`tailscale serve`), Cloudflare Tunnel ou uma VPS com Caddy. Só assim a voz e a instalação funcionam no telemóvel.

Na primeira vez a app pede o `VASCO_TOKEN`; fica guardado no dispositivo. Para instalar: Chrome/Android → "Instalar app"; Safari/iOS → Partilhar → "Adicionar ao ecrã principal".

## Limitações (a saber)

- **Os avisos de lembretes só aparecem com a app aberta.** Para avisar com a app fechada é preciso Web Push (chaves VAPID + subscrição no servidor); ainda não está feito.
- A voz usa o reconhecimento do browser (no Chrome envia o áudio para a Google). Não funciona no Firefox.
- O Vasco **não controla o PC**; isso exigiria ações locais explícitas e permitidas no servidor.
- Sem `VASCO_TOKEN` e exposto à internet, qualquer pessoa gastaria a tua chave da API. Não o faças.
- O servidor limita a 20 mensagens/minuto por IP, mas não substitui um limite de gastos na conta da API.

## Estrutura

```
server.js            ponto de entrada (só liga as peças)
src/
  config.js          variáveis de ambiente e leitura do .env
  store.js           lembretes em data/reminders.json
  settings.js        fornecedor, modelo e chave (data/settings.json)
  assistant.js       prompt, modos, ferramentas e chamadas ao modelo (Anthropic ou compatível OpenAI)
  http.js            ficheiros estáticos, autenticação e rotas /api
public/              a app (sem build: módulos ES nativos)
  index.html, sw.js, manifest.webmanifest, ícones
  css/style.css
  js/main.js         liga tudo à página
  js/chat.js         conversa
  js/voice.js        microfone e voz
  js/reminders.js    lembretes e avisos
  js/orb.js          esfera animada
  js/settings.js     página de Definições
  js/ui.js, api.js, util.js
test/                testes (node --test, sem dependências)
tools/make-icons.js  gera os ícones PNG
legacy/              protótipos originais (só funcionavam dentro do claude.ai)
```

Comandos: `npm start`, `npm test`, `npm run icons`. Para a configuração, copia `.env.example` para `.env`.
