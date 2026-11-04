// Ponto de entrada da app: liga os módulos aos elementos da página.
import { $, toLocal, toast } from './util.js';
import { api } from './api.js';
import * as voice from './voice.js';
import { addRem, startReminders, setServiceWorker } from './reminders.js';
import { view, setRole, getRole, openSettings } from './ui.js';
import { setTheme, getTheme } from './theme.js';
import { send, isBusy } from './chat.js';
import { initSettings } from './settings.js';

voice.hooks.onUtterance = send;
voice.hooks.isBusy = isBusy;

/* conversa */
$('#f').onsubmit = e => { e.preventDefault(); const t = $('#q').value; $('#q').value = ''; $('#q').style.height = ''; send(t); };
$('#q').addEventListener('keydown', e => {
  // No telemóvel, Enter faz nova linha; no PC envia.
  if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer:coarse)').matches) { e.preventDefault(); $('#f').requestSubmit(); }
});
$('#q').addEventListener('input', e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(110, e.target.scrollHeight) + 'px'; });

/* voz */
$('#mic').onclick = () => { if (voice.toggle()) voice.listen(); };

/* ecrãs, modos e definições */
$('#tabs').onclick = e => { const b = e.target.closest('button'); if (b) view(b.dataset.v); };
$('#srole').onchange = e => setRole(e.target.value);
setRole(getRole());
const marcaCor = () => document.querySelectorAll('#scor button').forEach(b => b.setAttribute('aria-pressed', b.dataset.c === getTheme()));
$('#scor').onclick = e => { const b = e.target.closest('button'); if (b) { setTheme(b.dataset.c); marcaCor(); } };
setTheme(getTheme()); marcaCor();
$('#cfgb').onclick = openSettings;
$('#sx').onclick = () => $('#sd').close();

/* lembretes */
$('#rw').value = toLocal(new Date(Date.now() + 3600e3));
$('#fa').onsubmit = async e => {
  e.preventDefault();
  try { await addRem($('#rt').value.trim(), $('#rw').value); $('#rt').value = ''; } catch (x) { toast('Não consegui guardar o lembrete.'); }
};

/* avisos e PWA */
const nb = $('#nb');
const bell = () => nb.setAttribute('aria-pressed', !!window.Notification && Notification.permission === 'granted');
bell();
nb.onclick = async () => {
  if (!window.Notification) { toast('Este browser não mostra avisos.'); return; }
  if (Notification.permission === 'default') { try { await Notification.requestPermission(); } catch (e) {} bell(); }
  toast(Notification.permission === 'granted' ? 'Avisos ligados.' : 'Avisos bloqueados. Permite-os nas definições do site.');
};
if ('serviceWorker' in navigator && isSecureContext) {
  navigator.serviceWorker.register('sw.js').then(setServiceWorker).catch(() => {});
}
initSettings();
api('GET', '/api/ping').then(p => { if (!p.chat) toast('Ainda não há API configurada: abre Definições (roda dentada).'); }).catch(() => {});
startReminders();
