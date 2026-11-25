// Voz: reconhecimento (microfone) e síntese (o Camões a falar).
import { $, toast } from './util.js';
import { setState, pulseKick } from './orb.js';

// Ligados pelo main.js, para este módulo não depender do chat.
export const hooks = { onUtterance() {}, isBusy: () => false };

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let on = false, rec = null;

export const isOn = () => on;
const updMic = () => $('#mic').setAttribute('aria-pressed', on);

// Fala por frases: push(texto) vai recebendo o texto à medida que chega e fala cada frase assim
// que está completa; end() fala o resto e chama done() quando acabar. abort() corta tudo em silêncio.
export function speaker(done) {
  if (!window.speechSynthesis) return { push() {}, end: done, abort() {} };
  speechSynthesis.cancel();
  let buf = '', pending = 0, ended = false, fin = false;
  const check = () => { if (ended && !pending && !fin) { fin = true; done(); } };
  const say = raw => {
    const t = raw.replace(/[*_`#>]/g, '').trim();
    if (!t) return;
    const u = new SpeechSynthesisUtterance(t);
    u.lang = 'pt-PT'; u.rate = 1;
    const vs = speechSynthesis.getVoices().filter(v => /^pt[-_]PT/i.test(v.lang));
    const v = vs.find(x => /duarte|joaquim|diogo|pedro|cristiano/i.test(x.name)) || vs[0];
    if (v) u.voice = v;
    u.onstart = () => setState('speak'); u.onboundary = () => pulseKick(.09);
    u.onend = u.onerror = () => { pending--; check(); };
    pending++; speechSynthesis.speak(u);
  };
  return {
    push(s) {
      buf += s;
      let m; // frase completa = pelo menos 12 caracteres até . ! ? … seguido de espaço, ou uma linha inteira
      while ((m = /^(?:([\s\S]{12,}?[.!?…])\s|([^\n]*)\n)/.exec(buf))) { say(m[1] !== undefined ? m[1] : m[2]); buf = buf.slice(m[0].length); }
    },
    end() { say(buf); buf = ''; ended = true; check(); },
    abort() { fin = true; buf = ''; speechSynthesis.cancel(); },
  };
}

export function speak(t, done) {
  const s = speaker(done);
  s.push(t); s.end();
}

export function listen() {
  if (!on || hooks.isBusy()) return;
  if (!SR) { on = false; updMic(); toast('Este browser não suporta reconhecimento de voz. Experimenta o Chrome, Edge ou Safari.'); return; }
  try {
    rec = new SR(); rec.lang = 'pt-PT'; rec.interimResults = true; rec.continuous = false;
    let heard = '';
    rec.onresult = e => { heard = ''; for (const r of e.results) heard += r[0].transcript; $('#q').value = heard; $('#said').textContent = heard; };
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
