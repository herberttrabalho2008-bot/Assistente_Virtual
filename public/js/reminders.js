// Lembretes: lista, formulário e avisos. Os dados vivem no servidor (iguais em todos os dispositivos).
import { $, fmt, toast } from './util.js';
import { api } from './api.js';
import { speak, isOn } from './voice.js';

let reminders = [], swReg = null;
const fired = new Set();

export const setServiceWorker = r => { swReg = r; };

export async function loadRem() {
  try {
    reminders = await api('GET', '/api/reminders');
    $('#sy').textContent = 'lembretes sincronizados';
    render(); check();
  } catch (e) { $('#sy').textContent = 'sem ligação ao servidor'; }
}
export async function addRem(text, when) {
  const d = new Date(when); if (isNaN(d)) throw new Error('data inválida');
  await api('POST', '/api/reminders', { text, when: d.toISOString() }); await loadRem();
}
const setDone = async id => { await api('PATCH', '/api/reminders/' + id, { done: true }); await loadRem(); };
const delRem = async id => { await api('DELETE', '/api/reminders/' + id); await loadRem(); };

function render() {
  const box = $('#list'); box.textContent = '';
  const s = [...reminders].sort((a, b) => (a.done - b.done) || (new Date(a.when) - new Date(b.when)));
  if (!s.length) {
    const p = document.createElement('p'); p.className = 'note'; p.textContent = 'Sem lembretes. Adiciona um acima ou pede ao Camões.'; box.append(p); return;
  }
  for (const r of s) {
    const late = !r.done && new Date(r.when) < Date.now();
    const el = document.createElement('div');
    el.className = 'card' + (r.done ? ' done' : '') + (late ? ' late' : '');
    const t = document.createElement('div'); t.className = 't'; t.textContent = r.text;
    const w = document.createElement('div'); w.className = 'w'; w.textContent = (late ? 'Atrasado · ' : '') + fmt(r.when);
    const bar = document.createElement('div'); bar.className = 'bar';
    const fill = document.createElement('i'); fill.style.width = progress(r) + '%'; bar.append(fill);
    const acts = document.createElement('div'); acts.className = 'acts';
    if (!r.done) {
      const ok = document.createElement('button'); ok.className = 'x'; ok.textContent = '✓';
      ok.setAttribute('aria-label', 'Marcar como feito'); ok.onclick = () => setDone(r.id); acts.append(ok);
    }
    const x = document.createElement('button'); x.className = 'x'; x.textContent = '×';
    x.setAttribute('aria-label', 'Apagar lembrete'); x.onclick = () => delRem(r.id); acts.append(x);
    el.append(t, w, bar, acts); box.append(el);
  }
}

// Quanto tempo já passou desde que o lembrete foi criado (lembretes antigos não têm "created": conta as últimas 24 h).
function progress(r) {
  const end = new Date(r.when).getTime();
  if (r.done || end <= Date.now()) return 100;
  const start = r.created ? new Date(r.created).getTime() : end - 864e5;
  return Math.max(2, Math.min(100, (Date.now() - start) / (end - start) * 100));
}

// Os avisos só aparecem com a app aberta (ver README). Vários em atraso juntam-se num só aviso.
async function check() {
  const due = reminders.filter(r => !r.done && !fired.has(r.id) && new Date(r.when) <= Date.now());
  if (!due.length) return;
  due.forEach(r => fired.add(r.id));
  const msg = due.length === 1 ? due[0].text : due.length + ' lembretes: ' + due.map(r => r.text).join('; ');
  toast('Lembrete: ' + msg);
  try {
    if (window.Notification && Notification.permission === 'granted') {
      if (swReg) swReg.showNotification('Camões', { body: msg, icon: 'icon-192.png' }); else new Notification('Camões', { body: msg });
    }
  } catch (e) {}
  if (isOn()) speak('Lembrete: ' + msg, () => {});
  try { await Promise.all(due.map(r => api('PATCH', '/api/reminders/' + r.id, { done: true }))); await loadRem(); } catch (e) {}
}

export function startReminders() {
  setInterval(loadRem, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadRem(); });
  loadRem();
}
