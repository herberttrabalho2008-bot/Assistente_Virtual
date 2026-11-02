// Estado da interface: modo ativo (papel/separador) e passagem do ecrã inicial para a conversa.
import { $ } from './util.js';
import { getState, setState } from './orb.js';
import { loadRem } from './reminders.js';
import { loadSettings } from './settings.js';

let role = 'geral';
export const getRole = () => role;

export const showApp = () => document.body.classList.add('on');

// r: um modo de conversa (geral, estudo, …), 'chat' (voltar à conversa), 'lem' ou 'cfg'.
export function go(r) {
  const panel = r === 'lem' || r === 'cfg' ? r : 'chat';
  if (panel === 'chat' && r !== 'chat') role = r;
  const pressed = panel === 'chat' ? role : panel;
  document.querySelectorAll('#roles button').forEach(b => b.setAttribute('aria-pressed', b.dataset.r === pressed));
  $('#log').classList.toggle('show', panel === 'chat');
  $('#rp').classList.toggle('show', panel === 'lem');
  $('#sp').classList.toggle('show', panel === 'cfg');
  if (panel !== 'chat') showApp();
  if (panel === 'lem') loadRem();
  if (panel === 'cfg') loadSettings();
  setState(getState());
}
