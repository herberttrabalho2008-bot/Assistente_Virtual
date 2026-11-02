// Ponto de entrada da app: liga os módulos aos elementos da página.
import { $, toLocal, toast } from './util.js';
import { api } from './api.js';
import * as voice from './voice.js';
import { addRem, startReminders, setServiceWorker } from './reminders.js';
import { go, showApp } from './ui.js';
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
$('#mic').onclick = () => { if (voice.toggle()) { go('chat'); showApp(); voice.listen(); } };

/* modos e lembretes */
$('#roles').onclick = e => { const b = e.target.closest('button'); if (b) go(b.dataset.r); };
$('#rw').value = toLocal(new Date(Date.now() + 3600e3));
$('#fa').onsubmit = async e => {
  e.preventDefault();
  try { await addRem($('#rt').value.trim(), $('#rw').value); $('#rt').value = ''; } catch (x) { toast('Não consegui guardar o lembrete.'); }
};

/* avisos e PWA */
try {
  if (window.Notification && Notification.permission === 'default') {
    const b = $('#nb'); b.hidden = false;
    b.onclick = async () => { try { await Notification.requestPermission(); } catch (e) {} b.hidden = true; };
  }
} catch (e) {}
if ('serviceWorker' in navigator && isSecureContext) {
  navigator.serviceWorker.register('sw.js').then(setServiceWorker).catch(() => {});
}
initSettings();
api('GET', '/api/ping').then(p => { if (!p.chat) toast('Ainda não há API configurada: abre Definições.'); }).catch(() => {});
startReminders();
