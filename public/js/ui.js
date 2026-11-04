// Estado da interface: modo de conversa (guardado neste dispositivo), ecrã visível no telemóvel e janela de definições.
import { $ } from './util.js';
import { loadRem } from './reminders.js';
import { loadSettings } from './settings.js';

const ROLES = { geral: 'Geral', estudo: 'Estudo', codigo: 'Programação', criativo: 'Criativo' };
let role = 'geral';
try { const r = localStorage.getItem('camoes_modo'); if (ROLES[r]) role = r; } catch (e) {}
export const getRole = () => role;

// O modo escolhe-se nas Definições e aparece ao lado do título da Conversa.
export function setRole(r) {
  if (!ROLES[r]) return;
  role = r;
  $('#srole').value = r;
  $('#mode').textContent = ROLES[r];
  try { localStorage.setItem('camoes_modo', r); } catch (e) {}
}

// v: 'home', 'chat' ou 'lem'. No PC as três colunas estão sempre visíveis.
export function view(v) {
  $('#app').dataset.view = v;
  document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === v));
  if (v === 'lem') loadRem();
  if (v === 'chat') { const l = $('#log'); l.scrollTop = l.scrollHeight; }
}

export function openSettings() { loadSettings(); $('#sd').showModal(); }
