// Esfera animada (núcleo, órbitas, estrelas e anéis) e texto de estado.
import { $ } from './util.js';
import { palette } from './theme.js';

const HEAD = 'Como posso ajudar-te hoje?';
const cv = $('#orb'), cx = cv.getContext('2d'), W = 640, C = W / 2, R = W * .36;
const still = matchMedia('(prefers-reduced-motion:reduce)').matches;
let state = 'idle', ph = 0, pulse = 0, last = 0, kick = 0;

// Estrelas fixas dentro da esfera (raio, ângulo, tamanho, fase do brilho).
const STARS = Array.from({ length: 170 }, () => [R * .93 * Math.sqrt(Math.random()), Math.random() * 7, .6 + Math.random() * 1.4, Math.random() * 7]);
const RAYS = Array.from({ length: 36 }, (_, i) => i * Math.PI / 18 + Math.random() * .1);

export const getState = () => state;
export const pulseKick = v => { kick = v; };

export function setState(s) {
  state = s;
  $('#hd').textContent = s === 'listen' ? 'A ouvir…' : s === 'think' ? 'A pensar…' : s === 'speak' ? 'A falar…' : HEAD;
}

function arc(r, from, span, width, alpha) {
  cx.strokeStyle = `rgba(${palette().rgb},${alpha})`; cx.lineWidth = width;
  cx.beginPath(); cx.arc(C, C, r, from, from + span); cx.stroke();
}

function orbit(rot, from, span, width) {
  cx.strokeStyle = palette().orbit; cx.lineWidth = width;
  cx.beginPath(); cx.ellipse(C, C, R * .6, R * .25, rot, from, from + span); cx.stroke();
}

function frame(t) {
  const dt = Math.min(.05, (t - last) / 1000 || .016); last = t;
  const sp = { idle: .5, listen: .9, think: 2.6, speak: 1.6 }[state];
  ph += dt * sp * (still ? .2 : 1);
  const k = t / 1000;
  const tgt = state === 'listen' ? .08 + .08 * Math.sin(k * 7) : state === 'speak' ? .2 * (.4 + .6 * Math.abs(Math.sin(k * 9) * Math.sin(k * 4.1))) + kick : .04 * Math.sin(k * 1.6);
  pulse += (tgt - pulse) * .2; kick *= .92;
  const P = palette();
  cx.clearRect(0, 0, W, W);

  // brilho à volta e corpo da esfera
  let g = cx.createRadialGradient(C, C, R * .85, C, C, R * 1.38);
  g.addColorStop(0, `rgba(${P.rgb},.12)`); g.addColorStop(1, `rgba(${P.rgb},0)`);
  cx.fillStyle = g; cx.fillRect(0, 0, W, W);
  g = cx.createRadialGradient(C, C, 0, C, C, R);
  g.addColorStop(0, P.body[0]); g.addColorStop(.55, P.body[1]); g.addColorStop(1, P.body[2]);
  cx.fillStyle = g; cx.beginPath(); cx.arc(C, C, R, 0, 7); cx.fill();

  // raios e estrelas, a rodar devagar
  cx.save(); cx.beginPath(); cx.arc(C, C, R, 0, 7); cx.clip();
  cx.strokeStyle = `rgba(${P.ray},.05)`; cx.lineWidth = 1;
  for (const a of RAYS) { cx.beginPath(); cx.moveTo(C, C); cx.lineTo(C + Math.cos(a + ph * .03) * R, C + Math.sin(a + ph * .03) * R); cx.stroke(); }
  for (const [r, a, s, f] of STARS) {
    cx.fillStyle = `rgba(${P.star},${.2 + .5 * Math.abs(Math.sin(k * 1.3 + f))})`;
    cx.fillRect(C + Math.cos(a + ph * .05) * r, C + Math.sin(a + ph * .05) * r, s, s);
  }
  cx.restore();

  // contorno pontilhado e anéis exteriores
  cx.setLineDash([1.5, 7]); arc(R * .94, ph * .1, 7, 1.5, .45); cx.setLineDash([]);
  arc(R, 0, 7, 1.5, .18);
  cx.lineCap = 'round';
  arc(R * 1.07, ph * .3, Math.PI * 1.1, 5, .5);
  arc(R * 1.07, ph * .3 + Math.PI * 1.35, Math.PI * .45, 5, .3);
  arc(R * 1.14, -ph * .22 + 2, Math.PI * .55, 2.5, .35);

  // núcleo
  const rc = R * .2 * (1 + pulse);
  g = cx.createRadialGradient(C, C, 0, C, C, rc * 2.2);
  g.addColorStop(0, `rgba(${P.halo},.55)`); g.addColorStop(1, `rgba(${P.rgb},0)`);
  cx.fillStyle = g; cx.beginPath(); cx.arc(C, C, rc * 2.2, 0, 7); cx.fill();
  g = cx.createRadialGradient(C - rc * .15, C - rc * .15, 0, C, C, rc);
  g.addColorStop(0, '#FFFFFF'); g.addColorStop(.3, P.core[0]); g.addColorStop(.6, P.core[1]); g.addColorStop(1, P.core[2]);
  cx.fillStyle = g; cx.beginPath(); cx.arc(C, C, rc, 0, 7); cx.fill();

  // órbitas brilhantes
  cx.shadowColor = `rgba(${P.rgb},.9)`; cx.shadowBlur = 24;
  orbit(-.55 + Math.sin(k * .3) * .05, ph, Math.PI * 1.45, R * .05 * (1 + pulse));
  orbit(.95, -ph * .8 + 1, Math.PI * 1.05, R * .04 * (1 + pulse));
  cx.shadowBlur = 0;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
