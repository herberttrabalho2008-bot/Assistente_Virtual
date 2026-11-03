// Estado da interface: modo de conversa, ecrã visível no telemóvel e janela de definições.
import { $ } from './util.js';
import { loadRem } from './reminders.js';
import { loadSettings } from './settings.js';

let role = 'geral';
export const getRole = () => role;

export function setRole(r) {
  role = r;
  document.querySelectorAll('#roles button').forEach(b => b.setAttribute('aria-pressed', b.dataset.r === r));
}

// v: 'home', 'chat' ou 'lem'. No PC as três colunas estão sempre visíveis.
export function view(v) {
  $('#app').dataset.view = v;
  document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === v));
  if (v === 'lem') loadRem();
  if (v === 'chat') { const l = $('#log'); l.scrollTop = l.scrollHeight; }
}

export function openSettings() { loadSettings(); $('#sd').showModal(); }
