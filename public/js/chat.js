// Conversa com o Camões.
import { $, toLocal } from './util.js';
import { apiStream } from './api.js';
import { setState } from './orb.js';
import { speaker, listen, isOn } from './voice.js';
import { loadRem } from './reminders.js';
import { getRole } from './ui.js';
import { md, plain } from './md.js';

// O histórico fica no browser (só neste dispositivo) e volta quando se recarrega a página.
const KEY = 'camoes_conversa', MAX = 40;
const hist = (() => {
  try { const h = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(h) ? h.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-MAX) : []; }
  catch (e) { return []; }
})();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(hist.slice(-MAX))); } catch (e) {} };
let busy = false;
export const isBusy = () => busy;

// Apaga a conversa (histórico, balões e o texto do ecrã principal). Não faz nada a meio de uma resposta.
export function clearChat() {
  if (busy) return false;
  hist.length = 0; save();
  $('#log').replaceChildren();
  $('#said').textContent = $('#reply').textContent = $('#tmr').textContent = '';
  try { speechSynthesis.cancel(); } catch (e) {}
  return true;
}

function bubble(cls, text) {
  const d = document.createElement('div'); d.className = 'msg ' + cls;
  if (cls === 'v') { const b = document.createElement('div'); b.className = 'md'; md(b, text); d.append(b); } else d.textContent = text; // as respostas têm markdown
  const l = $('#log'); l.append(d); l.scrollTop = l.scrollHeight; return d;
}

function errText(e) {
  if (e.code === 'sem_chave') return 'Ainda não há API configurada. Abre Definições e escolhe o fornecedor, o modelo e a chave.';
  if (e.code === 'chave') return 'O fornecedor recusou a chave da API. Confirma-a em Definições.';
  if (e.code === 'origem') return 'Pedido bloqueado por segurança. Abre o Camões pelo endereço do servidor.';
  if (e.status === 429) return 'Calma aí, estás a ir depressa demais. Tenta daqui a pouco.';
  if (e.status === 401) return 'Código de acesso errado. Recarrega a página e tenta outra vez.';
  if (e.status === 502) return 'O modelo não respondeu' + (e.detail ? ` (${e.upstream}: ${e.detail})` : '') + '. Confirma o modelo em Definições.';
  return 'Não consegui falar com o servidor Camões. Está ligado?';
}

export async function send(text) {
  if (busy || !text.trim()) return;
  busy = true;
  bubble('u', text); hist.push({ role: 'user', content: text });
  $('#said').textContent = text; $('#reply').textContent = '';
  const out = bubble('v', ''), body = out.firstChild, tm = document.createElement('div');
  const dots = document.createElement('span'); dots.className = 'dots'; dots.append(...[0, 1, 2].map(() => document.createElement('i'))); body.append(dots); // "a escrever" até chegar o texto
  tm.className = 'tm'; out.append(tm);
  // contador de segundos: corre enquanto o Camões responde e fica com o tempo total no fim
  const t0 = performance.now();
  const tick = () => { $('#tmr').textContent = tm.textContent = '⏱ ' + ((performance.now() - t0) / 1000).toFixed(1) + ' s'; };
  tick(); const timer = setInterval(tick, 100);
  setState('think');
  let ok = false, reply = '';
  // Em modo de voz, o Camões começa a falar na primeira frase, sem esperar pelo fim da resposta.
  const spk = isOn() ? speaker(() => { if (isOn()) listen(); else setState('idle'); }) : null;
  try {
    const now = new Date();
    await apiStream('/api/chat', {
      messages: hist.slice(-16), role: getRole(), tzOffset: now.getTimezoneOffset(),
      now: now.toLocaleString('pt-PT', { dateStyle: 'full', timeStyle: 'short' }) + ' (hora local, ISO ' + toLocal(now) + ')',
    }, t => {
      reply += t; md(body, reply); $('#reply').textContent = plain(reply);
      const l = $('#log'); l.scrollTop = l.scrollHeight;
      if (spk) spk.push(t);
    });
    if (!reply.trim()) throw Object.assign(new Error('vazio'), { status: 502, detail: 'resposta vazia, o modelo demorou demasiado ou falhou' });
    reply = reply.trim(); md(body, reply); $('#reply').textContent = plain(reply); hist.push({ role: 'assistant', content: reply }); ok = true;
    loadRem(); // o Camões pode ter criado ou apagado lembretes
  } catch (e) {
    if (spk) spk.abort();
    hist.pop(); body.replaceChildren(errText(e)); $('#reply').textContent = errText(e);
  }
  clearInterval(timer); tick(); save(); busy = false;
  if (ok && spk) spk.end();
  else if (isOn()) listen(); else setState('idle');
}

// Mostra a conversa guardada: os balões e a última pergunta e resposta no ecrã inicial.
for (const m of hist) bubble(m.role === 'user' ? 'u' : 'v', m.content);
const last = r => (hist.findLast(m => m.role === r) || {}).content || '';
$('#said').textContent = last('user'); $('#reply').textContent = plain(last('assistant'));
