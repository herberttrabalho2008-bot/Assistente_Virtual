// Conversa com o Camões.
import { $, toLocal } from './util.js';
import { api } from './api.js';
import { setState } from './orb.js';
import { speak, listen, isOn } from './voice.js';
import { loadRem } from './reminders.js';
import { getRole } from './ui.js';

const hist = [];
let busy = false;
export const isBusy = () => busy;

function bubble(cls, text) {
  const d = document.createElement('div'); d.className = 'msg ' + cls; d.textContent = text;
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
  const out = bubble('v', '…'); setState('think');
  let ok = false, reply = '';
  try {
    const now = new Date();
    const r = await api('POST', '/api/chat', {
      messages: hist.slice(-16), role: getRole(), tzOffset: now.getTimezoneOffset(),
      now: now.toLocaleString('pt-PT', { dateStyle: 'full', timeStyle: 'short' }) + ' (hora local, ISO ' + toLocal(now) + ')',
    });
    reply = r.text || '…'; out.textContent = reply; $('#reply').textContent = reply; hist.push({ role: 'assistant', content: reply }); ok = true;
    loadRem(); // o Camões pode ter criado ou apagado lembretes
  } catch (e) {
    hist.pop(); out.textContent = $('#reply').textContent = errText(e);
  }
  busy = false;
  if (ok && isOn()) speak(reply, () => { if (isOn()) listen(); else setState('idle'); });
  else if (isOn()) listen(); else setState('idle');
}
