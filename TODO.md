# Tarefas por fazer

Estado a 2026-11-25. Ordenadas por prioridade dentro de cada secção.

## Verificar (código escrito, nunca testado a sério)

- [ ] Conversa com a API real da Anthropic: confirmar que o pedido, as ferramentas e os erros se comportam como nos testes com `fetch` falso (usar **Testar** em Definições).
- [ ] Conversa com uma API compatível com OpenAI (OpenAI e, sobretudo, Ollama ou LM Studio), incluindo chamadas de ferramentas: nem todos os modelos locais as suportam.
- [ ] Voz no PC: microfone, reconhecimento em pt-PT, voz do Camões e o ciclo ouvir/responder.
- [ ] Telemóvel real: instalação como app, voz, notificações e o campo de texto (Enter faz nova linha).
- [ ] Erro na consola "An unknown error occurred when fetching the script": causa por confirmar (suspeita: registo do service worker).

## Telemóvel e acesso fora de casa

- [ ] Escolher e montar o HTTPS (Tailscale, Cloudflare Tunnel ou VPS com Caddy). Sem isto, voz, notificações e instalação não funcionam no telemóvel.
- [ ] Atrás de proxy ou túnel, o limite de pedidos por IP vê o IP do proxy: usar o IP real (cabeçalho do proxy, só se o proxy for de confiança).
- [ ] Definir um limite de gastos na conta da API.

## Funcionalidades

- [ ] Avisos de lembretes com a app fechada (Web Push: chaves VAPID, subscrição guardada no servidor).
- [x] Guardar o histórico da conversa (feito no `localStorage`, últimas 40 mensagens). Falta, se for preciso, sincronizá-lo entre dispositivos no servidor.
- [x] Respostas em *streaming* (feito: o texto aparece à medida que é escrito, e a voz fala por frases).
- [ ] Verificar a voz por frases num browser com microfone e voz pt-PT (escrita mas não ouvida).
- [ ] Voltar a tirar as imagens do README (`ecra-pc`, `ecra-telemovel` e `cor-*`): mostram o globo antigo, anterior ao planeta em WebGL.
- [ ] Lembretes: editar, repetir (diário, semanal) e adiar.
- [ ] Controlar o PC: módulo local com uma lista curta de ações permitidas e confirmação antes de executar. Só depois de rever a segurança.
- [ ] Mostrar na página de Definições a lista de modelos disponíveis, em vez de só sugestões.

## Qualidade

- [ ] Testes do frontend (hoje os testes cobrem só o servidor).
- [ ] Correr a skill `revisao-seguranca` e guardar o relatório fora do repositório.
- [ ] Acrescentar uma licença ao repositório.
- [ ] Registar a origem e a revisão das skills em `.claude/skills/` num documento do projeto (só se for preciso; as skills não vão para o GitHub).
- [ ] Escolher a voz do Camões de forma menos frágil (hoje procura nomes de vozes conhecidas).

## Já feito

- [x] Servidor Node sem dependências (`src/`) e app instalável (`public/`).
- [x] Lembretes guardados no servidor, iguais no PC e no telemóvel.
- [x] Página de Definições: fornecedor (Anthropic ou compatível OpenAI), modelo, endereço e chave.
- [x] Proteção contra pedidos de outros sites e contra DNS rebinding nas rotas de escrita.
- [x] Testes do servidor (`npm test`).
- [x] Protótipos originais guardados em `legacy/`.
