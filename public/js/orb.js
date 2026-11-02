// Esfera animada e texto de estado.
import { $ } from './util.js';

const HEAD = 'Como posso ajudar-te hoje?';
const cv = $('#orb'), cx = cv.getContext('2d'), W = 640, C = W / 2;
const still = matchMedia('(prefers-reduced-motion:reduce)').matches;
let state = 'idle', ph = 0, pulse = 0, last = 0, kick = 0;

export const getState = () => state;
export const pulseKick = v => { kick = v; };

export function setState(s) {
  state = s;
  const on = document.body.classList.contains('on');
  $('#hd').textContent = s === 'listen' ? 'A ouvir…' : s === 'think' ? 'A pensar…' : s === 'speak' ? 'A falar…' : (on ? '' : HEAD);
}

function frame(t) {
  const dt = Math.min(.05, (t - last) / 1000 || .016); last = t;
  const sp = { idle: .5, listen: .9, think: 2.6, speak: 2.4 }[state];
  ph += dt * sp * (still ? .2 : 1);
  const k = t / 1000;
  const tgt = state === 'listen' ? .05 + .05 * Math.sin(k * 7) : state === 'speak' ? .1 * (.4 + .6 * Math.abs(Math.sin(k * 9) * Math.sin(k * 4.1))) + kick : .02 * Math.sin(k * 1.6);
  pulse += (tgt - pulse) * .2;
  kick *= .92; const R = W * .27 * (1 + pulse);
  cx.clearRect(0, 0, W, W);
  let g = cx.createRadialGradient(C, C, R * .5, C, C, R * 1.9);
  g.addColorStop(0, 'rgba(34,229,139,.5)'); g.addColorStop(.5, 'rgba(20,160,90,.18)'); g.addColorStop(1, 'rgba(10,120,60,0)');
  cx.fillStyle = g; cx.fillRect(0, 0, W, W);
  cx.save(); cx.beginPath(); cx.arc(C, C, R, 0, 7); cx.clip();
  g = cx.createRadialGradient(C - R * .25, C - R * .3, R * .05, C, C, R);
  g.addColorStop(0, '#F0FFF6'); g.addColorStop(.6, '#A8F0C4'); g.addColorStop(1, '#2EE58A');
  cx.fillStyle = g; cx.fillRect(0, 0, W, W);
  cx.lineWidth = R * .045; cx.lineCap = 'round';
  const N = 9;
  for (let i = 0; i < N; i++) {
    const a = ph + i * Math.PI / N, rx = Math.max(R * Math.abs(Math.cos(a)), 2);
    const lg = cx.createLinearGradient(C - R, C - R, C + R, C + R);
    lg.addColorStop(0, i % 2 ? '#06A64F' : '#00FF85'); lg.addColorStop(1, i % 2 ? '#0B7A4B' : '#7CFFB8');
    cx.strokeStyle = lg; cx.shadowColor = 'rgba(0,255,140,.9)'; cx.shadowBlur = R * .08;
    cx.beginPath(); cx.ellipse(C, C, rx, R * .97, -.45 + Math.sin(k * .4) * .1, 0, 7); cx.stroke();
  }
  cx.restore();
  cx.shadowBlur = 0; cx.strokeStyle = 'rgba(190,255,220,.7)'; cx.lineWidth = 3;
  cx.beginPath(); cx.arc(C, C, R, 0, 7); cx.stroke();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
