// Voz: reconhecimento (microfone) e síntese (o Camões a falar).
import { $, toast } from './util.js';
import { setState, pulseKick } from './orb.js';

// Ligados pelo main.js, para este módulo não depender do chat.
export const hooks = { onUtterance() {}, isBusy: () => false };

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let on = false, rec = null;

export const isOn = () => on;
const updMic = () => $('#mic').setAttribute('aria-pressed', on);

export function speak(t, done) {
  if (!window.speechSynthesis) { done(); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(t.replace(/[*_`#>]/g, ''));
  u.lang = 'pt-PT'; u.rate = 1;
  const vs = speechSynthesis.getVoices().filter(v => /^pt[-_]PT/i.test(v.lang));
  const v = vs.find(x => /duarte|joaquim|diogo|pedro|cristiano/i.test(x.name)) || vs[0];
  if (v) u.voice = v;
  u.onstart = () => setState('speak'); u.onboundary = () => pulseKick(.09);
  let fin = false; const end = () => { if (!fin) { fin = true; done(); } };
  u.onend = end; u.onerror = end;
  setState('speak'); speechSynthesis.speak(u);
}

export function listen() {
  if (!on || hooks.isBusy()) return;
  if (!SR) { on = false; updMic(); toast('Este browser não suporta reconhecimento de voz. Experimenta o Chrome, Edge ou Safari.'); return; }
  try {
    rec = new SR(); rec.lang = 'pt-PT'; rec.interimResults = true; rec.continuous = false;
    let heard = '';
    rec.onresult = e => { heard = ''; for (const r of e.results) heard += r[0].transcript; $('#q').value = heard; };
    rec.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        on = false; updMic();
        toast(isSecureContext ? 'O browser bloqueou o microfone. Permite o acesso nas definições do site.' : 'O microfone só funciona em HTTPS ou em localhost. Vê o README.');
      }
    };
    rec.onend = () => {
      if (!on) { setState('idle'); return; }
      const t = $('#q').value.trim();
      if (t) { $('#q').value = ''; hooks.onUtterance(t); } else setTimeout(listen, 300);
    };
    setState('listen'); rec.start();
  } catch (e) { on = false; updMic(); setState('idle'); }
}

// Liga/desliga o modo de voz; devolve o novo estado.
export function toggle() {
  on = !on; updMic();
  if (!on) {
    try { rec && rec.abort(); } catch (e) {}
    try { speechSynthesis.cancel(); } catch (e) {}
    setState('idle');
  }
  return on;
}
