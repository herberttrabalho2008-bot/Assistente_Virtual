// O globo do Camões: um globo holográfico em WebGL (esfera de vidro, continentes, atmosfera) com uma camada 2D por cima
// (ligações de dados, anéis, satélite e leituras). Os dois canvases ocupam o ecrã todo, atrás da
// interface; o "#orb" é só o espaço que o globo ocupa na página.
import { $ } from './util.js';
import { palette } from './theme.js';

const HEAD = 'Como posso ajudar-te hoje?';
const slot = $('#orb'), glCv = $('#gl'), fxCv = $('#fx'), fx = fxCv.getContext('2d');
const gl = glCv.getContext('webgl', { antialias: false });
const still = matchMedia('(prefers-reduced-motion:reduce)').matches;
const D = Math.PI / 180, RING = -.35;
let state = 'idle', ph = 0, spin = 0, pulse = 0, last = 0, kick = 0;

export const getState = () => state;
export const pulseKick = v => { kick = v; };
export function setState(s) {
  state = s;
  $('#hd').textContent = s === 'listen' ? 'A ouvir…' : s === 'think' ? 'A pensar…' : s === 'speak' ? 'A falar…' : HEAD;
}

// ---------- personalização (guardada só neste dispositivo) ----------
export const GLOBE_DEFAULTS = { city: 'lisboa', speed: 1, accent: '', links: true, home: true, radar: true, rings: true };
const cfg = { ...GLOBE_DEFAULTS };
try { Object.assign(cfg, JSON.parse(localStorage.getItem('camoes_globo') || '{}')); } catch (e) {}
export const getGlobe = () => ({ ...cfg });
export function setGlobe(patch) {
  Object.assign(cfg, patch);
  try { localStorage.setItem('camoes_globo', JSON.stringify(cfg)); } catch (e) {}
  rebuild();
}

// A paleta do tema, com a cor de contraste personalizada por cima, se houver.
const hex2rgb = h => /^#[0-9a-f]{6}$/i.test(h) ? [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(',') : null;
let palCache = null, palAcc = '';
function pal() {
  const base = palette();
  if (!palCache || palCache.base !== base || palAcc !== cfg.accent) {
    palAcc = cfg.accent; const a = hex2rgb(cfg.accent);
    palCache = { ...base, base, ...(a ? { acc: a } : {}) };
  }
  return palCache;
}

// ---------- cidades e ligações de dados ----------
// Cidades que podes escolher como "a tua": [id, nome, latitude, longitude].
export const CITY_LIST = [
  ['lisboa', 'Lisboa', 38.72, -9.14], ['porto', 'Porto', 41.15, -8.61], ['funchal', 'Funchal', 32.65, -16.91], ['praia', 'Praia', 14.93, -23.51],
  ['luanda', 'Luanda', -8.84, 13.23], ['maputo', 'Maputo', -25.97, 32.57], ['saopaulo', 'São Paulo', -23.55, -46.63], ['rio', 'Rio de Janeiro', -22.91, -43.17],
  ['londres', 'Londres', 51.51, -.13], ['paris', 'Paris', 48.86, 2.35], ['madrid', 'Madrid', 40.42, -3.7], ['novaiorque', 'Nova Iorque', 40.71, -74.01],
  ['dubai', 'Dubai', 25.2, 55.27], ['joanesburgo', 'Joanesburgo', -26.2, 28.05], ['toquio', 'Tóquio', 35.68, 139.69], ['sydney', 'Sydney', -33.87, 151.21],
];
const DEST_ORDER = ['novaiorque', 'saopaulo', 'luanda', 'londres', 'toquio', 'joanesburgo', 'sydney', 'dubai', 'paris'];
const fmtCoord = (la, lo) => `${Math.abs(la).toFixed(1)}°${la >= 0 ? 'N' : 'S'} ${Math.abs(lo).toFixed(1)}°${lo >= 0 ? 'E' : 'O'}`;
const vec = (lo, la) => [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];

// Caminho mais curto entre dois pontos: devolve t -> [lon, lat, altura acima da superfície].
function route(a, b) {
  const va = vec(a[0], a[1]), vb = vec(b[0], b[1]);
  const w = Math.acos(Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]))), sw = Math.sin(w) || 1;
  return t => {
    const k0 = Math.sin((1 - t) * w) / sw, k1 = Math.sin(t * w) / sw;
    const x = va[0] * k0 + vb[0] * k1, y = va[1] * k0 + vb[1] * k1, z = va[2] * k0 + vb[2] * k1;
    return [Math.atan2(x, z), Math.asin(Math.max(-1, Math.min(1, y))), Math.sin(Math.PI * t) * w * .12];
  };
}

let HOME, CITIES, ROUTES;
function rebuild() {
  const h = CITY_LIST.find(c => c[0] === cfg.city) || CITY_LIST[0];
  HOME = { lo: h[3] * D, la: h[2] * D, name: h[1].toUpperCase(), txt: fmtCoord(h[2], h[3]) };
  CITIES = DEST_ORDER.filter(id => id !== h[0]).slice(0, 6).map(id => CITY_LIST.find(c => c[0] === id)).map(c => [c[1], c[3] * D, c[2] * D]);
  ROUTES = CITIES.map(c => route([HOME.lo, HOME.la], [c[1], c[2]]));
}
rebuild();

// ---------- vista: rodar (arrastar), zoom (roda / pinça), mover (Shift + arrastar) ----------
// Os campos "T" são o alvo para onde a vista desliza; "vel" é a inércia da rotação depois de largar.
const TILT0 = 23 * D;
const view = { rot: 0, vel: 0, tilt: TILT0, tiltT: TILT0, zoom: 1, zoomT: 1, px: 0, py: 0, pxT: 0, pyT: 0, hold: 99, drag: false, homing: false };
let tc = Math.cos(TILT0), ts = Math.sin(TILT0); // cos e sen da inclinação (calculados uma vez por quadro)

// Roda um ponto (lon, lat) e projeta-o: [x, y, z] com y para cima e z > 0 na face visível.
// "h" levanta o ponto acima da superfície (para as ligações de dados).
function proj(lo, la, rot, h = 0) {
  const l = lo + rot, cl = Math.cos(la), s = 1 + h;
  const x = cl * Math.sin(l), y = Math.sin(la), z = cl * Math.cos(l);
  return [x * s, (y * tc - z * ts) * s, (y * ts + z * tc) * s];
}

// ---------- WebGL: o planeta ----------
const VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uC;
uniform float uR, uRot, uTc, uTs, uTime, uGlow, uGrid, uScan;
uniform vec3 uSun, uOcean, uDeep, uLand, uRim, uMain;
uniform sampler2D uTex;
void main() {
  vec2 p = (gl_FragCoord.xy - uC) / uR;
  float r2 = dot(p, p), r = sqrt(r2);
  if (r > 3.0) { gl_FragColor = vec4(0.0); return; }
  vec3 L = normalize(uSun);

  // brilho da atmosfera à volta, mais forte do lado da luz
  float d = max(r - 1.0, 0.0);
  float side = 0.5 + 0.5 * dot(normalize(p + vec2(1e-5)), normalize(L.xy + vec2(1e-5)));
  float halo = (exp(-d * 9.0) * 0.6 + exp(-d * 2.4) * 0.14) * (0.35 + 0.65 * side) * uGlow;
  vec4 outer = vec4(uRim * halo, halo);

  // ponto da esfera -> longitude/latitude
  float z = sqrt(max(1.0 - r2, 0.0));
  vec3 v = vec3(p, z);
  float yw = v.y * uTc + v.z * uTs;
  float zw = -v.y * uTs + v.z * uTc;
  float la = asin(clamp(yw, -1.0, 1.0));
  float lo = atan(v.x, zw) - uRot;

  float lit = dot(v, L);
  float day = smoothstep(-0.35, 0.45, lit);                 // do lado da luz tudo brilha mais

  // esfera de vidro escuro com um degradé suave
  vec3 base = mix(uDeep, uOcean * 0.55, day * 0.85);

  // continentes: preenchimento suave e uma linha de costa a brilhar (estilo mapa tecnológico)
  float t = texture2D(uTex, vec2(fract(lo / 6.2831853 + 0.5), 0.5 - la / 3.1415927)).r;
  float land = smoothstep(0.42, 0.58, t);
  float coast = exp(-pow((t - 0.5) * 5.0, 2.0));
  base += uLand * land * (0.16 + 0.30 * day);
  base += uLand * coast * (0.45 + 0.65 * day);

  // opção "grelha": linhas de latitude e longitude ténues e uma linha de varrimento que sobe e desce
  if (uGrid > 0.5) {
    vec2 q = abs(fract(vec2(lo, la) / 0.5235988 + 0.5) - 0.5);
    base += uMain * smoothstep(0.012, 0.0, min(q.x, q.y)) * 0.13;
    base += uMain * exp(-pow((la - uScan) * 30.0, 2.0)) * 0.2;
  }

  // reflexo da atmosfera na orla (como um vidro a brilhar)
  float fres = pow(1.0 - z, 2.6);
  base = mix(base, uRim, fres * (0.18 + 0.5 * smoothstep(-0.5, 0.6, lit)));
  base += uRim * pow(fres, 3.0) * 0.35;

  float edge = clamp((1.0 - r) * uR + 0.5, 0.0, 1.0);
  gl_FragColor = mix(outer, vec4(base, 1.0), edge);
}`;

const U = {};
let tex = null;
function initGL() {
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(prog)); return false; }
  gl.useProgram(prog);
  for (const n of ['uC', 'uR', 'uRot', 'uTc', 'uTs', 'uTime', 'uGlow', 'uGrid', 'uScan', 'uSun', 'uOcean', 'uDeep', 'uLand', 'uRim', 'uMain', 'uTex']) U[n] = gl.getUniformLocation(prog, n);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); // um triângulo que cobre o ecrã
  const a = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
  tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); // oceano até a terra chegar
  gl.uniform1i(U.uTex, 0);
  return true;
}
const glOk = !!gl && initGL();

// Desenha a terra (data/land.json, do Natural Earth) numa imagem 2048x1024 em projeção equiretangular e envia-a para a placa gráfica.
fetch('data/land.json').then(r => r.json()).then(({ polys }) => {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 2048, 1024); g.fillStyle = '#fff';
  for (const rings of polys) {
    g.beginPath();
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i += 2) {
        const x = (ring[i] + 180) / 360 * 2048, y = (90 - ring[i + 1]) / 180 * 1024;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.closePath();
    }
    g.fill('evenodd');
  }
  if (glOk) { gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c); }
}).catch(() => {});

const rgb3 = s => s.split(',').map(n => n / 255);
const hex3 = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const SUN = (() => { const v = [-.55, .4, .73], n = Math.hypot(...v); return v.map(x => x / n); })();

let vw = 0, vh = 0, dpr = 1;
function resize() {
  const w = innerWidth, h = innerHeight, d = Math.min(devicePixelRatio || 1, 2);
  if (w === vw && h === vh && d === dpr) return;
  vw = w; vh = h; dpr = d;
  for (const c of [glCv, fxCv]) { c.width = Math.round(w * d); c.height = Math.round(h * d); }
  if (glOk) gl.viewport(0, 0, glCv.width, glCv.height);
}

function drawPlanet(cx, cy, R, rot, k, P) {
  const W = glCv.width, H = glCv.height;
  gl.disable(gl.SCISSOR_TEST); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  const pad = R * 3.05;
  const x0 = Math.max(0, Math.floor((cx - pad) * dpr)), x1 = Math.min(W, Math.ceil((cx + pad) * dpr));
  const y0 = Math.max(0, Math.floor(H - (cy + pad) * dpr)), y1 = Math.min(H, Math.ceil(H - (cy - pad) * dpr));
  if (x1 <= x0 || y1 <= y0) return;
  gl.enable(gl.SCISSOR_TEST); gl.scissor(x0, y0, x1 - x0, y1 - y0); // só pinta a zona à volta do planeta
  const main = rgb3(P.rgb);
  gl.uniform2f(U.uC, cx * dpr, H - cy * dpr); gl.uniform1f(U.uR, R * dpr);
  gl.uniform1f(U.uRot, rot); gl.uniform1f(U.uTc, tc); gl.uniform1f(U.uTs, ts); gl.uniform1f(U.uTime, k);
  gl.uniform1f(U.uGlow, 1 + pulse * 3); gl.uniform1f(U.uGrid, cfg.radar ? 1 : 0); gl.uniform1f(U.uScan, Math.sin(k * .6) * 70 * D);
  gl.uniform3fv(U.uSun, SUN);
  gl.uniform3fv(U.uOcean, hex3(P.ocean)); gl.uniform3fv(U.uDeep, hex3(P.deep));
  gl.uniform3fv(U.uLand, hex3(P.land));
  gl.uniform3fv(U.uRim, rgb3(P.rim)); gl.uniform3fv(U.uMain, main);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// ---------- camada 2D por cima: ligações, anéis, satélite e leituras ----------
const F = { cx: 0, cy: 0, u: 1 }; // centro do globo (px) e escala da interface (1 = 640 px de largura)

const font = n => `${n * F.u}px ui-monospace, Consolas, monospace`;

function arc(r, from, span, width, alpha) {
  fx.strokeStyle = `rgba(${pal().rgb},${alpha})`; fx.lineWidth = width * F.u;
  fx.beginPath(); fx.arc(F.cx, F.cy, r, from, from + span); fx.stroke();
}

// Arco que nasce e desvanece nas pontas (mais elegante do que um traço com extremos secos).
function fadeArc(r, from, span, width, rgb, alpha) {
  const N = 20;
  fx.lineWidth = width * F.u; fx.lineCap = 'butt';
  for (let i = 0; i < N; i++) {
    const a0 = from + span * i / N;
    fx.strokeStyle = `rgba(${rgb},${alpha * Math.sin(Math.PI * (i + .5) / N)})`;
    fx.beginPath(); fx.arc(F.cx, F.cy, r, a0, a0 + span / N + .01); fx.stroke();
  }
}

// Anel de marcas, como o mostrador de um instrumento (uma marca maior de 8 em 8).
function ticks(r, rot, n, alpha) {
  fx.strokeStyle = `rgba(${pal().rgb},${alpha})`; fx.lineWidth = 1.2 * F.u;
  fx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + i * 2 * Math.PI / n, len = (i % 8 === 0 ? 10 : 4) * F.u;
    fx.moveTo(F.cx + Math.cos(a) * r, F.cy + Math.sin(a) * r); fx.lineTo(F.cx + Math.cos(a) * (r + len), F.cy + Math.sin(a) * (r + len));
  }
  fx.stroke();
}

// Cometa: um arco com cauda que se apaga e uma cabeça brilhante. "span" negativo roda ao contrário.
function comet(r, head, span, width, rgb) {
  const N = 28;
  fx.lineWidth = width * F.u;
  for (let i = 0; i < N; i++) {
    const a0 = head - span * (i + 1) / N, a1 = head - span * i / N, f = 1 - i / N;
    fx.strokeStyle = `rgba(${rgb},${.75 * f * f})`;
    fx.beginPath(); fx.arc(F.cx, F.cy, r, Math.min(a0, a1), Math.max(a0, a1) + .01); fx.stroke();
  }
  fx.fillStyle = '#fff'; fx.shadowColor = `rgba(${rgb},1)`; fx.shadowBlur = 14;
  fx.beginPath(); fx.arc(F.cx + Math.cos(head) * r, F.cy + Math.sin(head) * r, width * .9 * F.u, 0, 7); fx.fill();
  fx.shadowBlur = 0;
}

// Anel inclinado à volta do planeta: "back" é a metade de trás, senão a da frente.
function ring(R, back) {
  fx.strokeStyle = pal().orbit; fx.lineWidth = 1.5 * F.u; fx.globalAlpha = back ? .18 : .7;
  fx.beginPath(); fx.ellipse(F.cx, F.cy, R * 1.24, R * .3, RING, back ? Math.PI : 0, back ? 2 * Math.PI : Math.PI); fx.stroke();
  fx.globalAlpha = 1;
}

// Satélite a girar no anel.
function satellite(R, sa) {
  const sx = Math.cos(sa) * R * 1.24, sy = Math.sin(sa) * R * .3;
  fx.fillStyle = '#fff'; fx.shadowColor = `rgba(${pal().acc},1)`; fx.shadowBlur = 18;
  fx.beginPath(); fx.arc(F.cx + sx * Math.cos(RING) - sy * Math.sin(RING), F.cy + sx * Math.sin(RING) + sy * Math.cos(RING), 5 * F.u, 0, 7); fx.fill();
  fx.shadowBlur = 0;
}

// Ligações de dados da tua cidade para outras seis: um arco fino que esbate para o destino, com um pulso a viajar.
function links(R, rot, k, P) {
  const N = 48, TAIL = .16;
  fx.lineCap = 'round';
  ROUTES.forEach((rt, i) => {
    const pts = [];
    for (let j = 0; j <= N; j++) { const [lo, la, h] = rt(j / N); pts.push(proj(lo, la, rot, h)); }
    const seg = (j, width, alpha) => { // um troço do arco (some junto à orla do globo, onde já está de lado)
      const a = pts[j], b = pts[j + 1], vis = Math.min(1, Math.min(a[2], b[2]) * 4);
      if (vis <= 0) return;
      fx.strokeStyle = `rgba(${P.acc},${alpha * vis})`; fx.lineWidth = width * F.u;
      fx.beginPath(); fx.moveTo(F.cx + a[0] * R, F.cy - a[1] * R); fx.lineTo(F.cx + b[0] * R, F.cy - b[1] * R); fx.stroke();
    };
    for (let j = 0; j < N; j++) seg(j, 1.1, .5 * (1 - .6 * j / N));
    const head = (k * .3 + i * .21) % 1.3; // depois de chegar, descansa um bocadinho
    for (let j = 0; j < N; j++) {
      const d = head - (j + .5) / N;
      if (d >= 0 && d < TAIL) seg(j, 1.1 + 2 * (1 - d / TAIL), .95 * (1 - d / TAIL));
    }
    if (head <= 1) {
      const p = pts[Math.round(head * N)];
      if (p[2] > .02) {
        fx.fillStyle = '#fff'; fx.shadowColor = `rgba(${P.acc},1)`; fx.shadowBlur = 10;
        fx.beginPath(); fx.arc(F.cx + p[0] * R, F.cy - p[1] * R, 2.2 * F.u, 0, 7); fx.fill(); fx.shadowBlur = 0;
      }
    }
    const [nx, ny, nz] = proj(CITIES[i][1], CITIES[i][2], rot); // destino: um anel pequeno com ponto ao centro
    if (nz > .02) {
      const px = F.cx + nx * R, py = F.cy - ny * R, vis = Math.min(1, nz * 4);
      fx.strokeStyle = `rgba(${P.acc},${.9 * vis})`; fx.lineWidth = 1.3 * F.u;
      fx.beginPath(); fx.arc(px, py, 4.5 * F.u, 0, 7); fx.stroke();
      fx.fillStyle = `rgba(${P.acc},${vis})`; fx.beginPath(); fx.arc(px, py, 1.7 * F.u, 0, 7); fx.fill();
    }
  });
}

// A tua cidade: marcador com onda e legenda.
function home(R, rot, k, P) {
  const [x, y, z] = proj(HOME.lo, HOME.la, rot);
  if (z <= .05) return;
  const px = F.cx + x * R, py = F.cy - y * R, w = (k * .8) % 1, dir = x >= 0 ? 1 : -1, u = F.u;
  fx.strokeStyle = `rgba(${P.acc},${(1 - w) * .9 * z})`; fx.lineWidth = 2 * u;
  fx.beginPath(); fx.arc(px, py, (4 + w * 22) * u, 0, 7); fx.stroke();
  fx.fillStyle = '#fff'; fx.shadowColor = `rgba(${P.acc},1)`; fx.shadowBlur = 16;
  fx.beginPath(); fx.arc(px, py, 3.5 * u, 0, 7); fx.fill(); fx.shadowBlur = 0;
  fx.strokeStyle = `rgba(${P.acc},${.8 * z})`; fx.lineWidth = 1.2 * u;
  fx.beginPath(); fx.moveTo(px, py); fx.lineTo(px + dir * 26 * u, py - 26 * u); fx.lineTo(px + dir * 76 * u, py - 26 * u); fx.stroke();
  fx.font = font(15); fx.textAlign = dir > 0 ? 'left' : 'right'; fx.textBaseline = 'bottom';
  fx.fillStyle = `rgba(${P.acc},${.95 * z})`; fx.fillText(HOME.name, px + dir * 30 * u, py - 29 * u);
  fx.textBaseline = 'top'; fx.fillStyle = `rgba(${P.rgb},${.8 * z})`; fx.fillText(HOME.txt, px + dir * 30 * u, py - 22 * u);
}

// ---------- ciclo de animação ----------
function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (t - last) / 1000 || .016); last = t;
  const sp = { idle: .5, listen: .9, think: 2.6, speak: 1.6 }[state];
  ph += dt * sp * (still ? .2 : 1);
  const k = t / 1000;
  const tgt = state === 'listen' ? .08 + .08 * Math.sin(k * 7) : state === 'speak' ? .2 * (.4 + .6 * Math.abs(Math.sin(k * 9) * Math.sin(k * 4.1))) + kick : .04 * Math.sin(k * 1.6);
  pulse += (tgt - pulse) * .2; kick *= .92;

  // vista: com o dedo/rato em cima a rotação automática pára e volta devagar ~1,5 s depois de largar
  if (view.drag) view.hold = 0;
  else { view.rot += view.vel * dt; view.vel *= Math.pow(.04, dt); view.hold += dt; }
  const ease = n => Math.min(1, dt * n);
  view.zoom += (view.zoomT - view.zoom) * ease(10); view.tilt += (view.tiltT - view.tilt) * ease(8);
  view.px += (view.pxT - view.px) * ease(10); view.py += (view.pyT - view.py) * ease(10);
  if (view.homing) { // duplo clique: volta a rodar para onde está a tua cidade
    const diff = -spin - view.rot; view.rot += diff * ease(6);
    if (Math.abs(diff) < .01) view.homing = false;
  }
  tc = Math.cos(view.tilt); ts = Math.sin(view.tilt);
  spin += dt * sp * .28 * cfg.speed * (still ? .2 : 1) * (view.drag ? 0 : Math.min(1, view.hold / 1.5));

  resize();
  fx.setTransform(dpr, 0, 0, dpr, 0, 0); fx.clearRect(0, 0, vw, vh);
  const r = slot.getBoundingClientRect();
  if (r.width < 8) { if (glOk) { gl.disable(gl.SCISSOR_TEST); gl.clear(gl.COLOR_BUFFER_BIT); } return; } // ecrã sem globo (telemóvel, noutro separador)

  const P = pal(), rot = spin + view.rot, u = r.width / 640;
  const lim = r.width * .6; // o globo não se afasta mais do que isto do seu lugar
  for (const n of ['px', 'py', 'pxT', 'pyT']) view[n] = Math.max(-lim, Math.min(lim, view[n]));
  F.u = u; F.cx = r.left + r.width / 2 + view.px; F.cy = r.top + r.height / 2 + view.py;
  const R = r.width * .3 * view.zoom * (1 + pulse * .12), sa = ph * .9;

  if (glOk) drawPlanet(F.cx, F.cy, R, rot, k, P);
  else { // sem WebGL: um disco simples
    const g = fx.createRadialGradient(F.cx - R * .3, F.cy - R * .3, 0, F.cx, F.cy, R);
    g.addColorStop(0, P.body[0]); g.addColorStop(.6, P.body[1]); g.addColorStop(1, P.body[2]);
    fx.fillStyle = g; fx.beginPath(); fx.arc(F.cx, F.cy, R, 0, 7); fx.fill();
  }

  fx.lineCap = 'round';
  if (cfg.rings) { // metade de trás do anel (e o satélite, se estiver atrás) escondida pelo planeta
    fx.save(); fx.beginPath(); fx.rect(0, 0, vw, vh); fx.arc(F.cx, F.cy, R, 0, 7); fx.clip('evenodd');
    ring(R, true); if (Math.sin(sa) < 0) satellite(R, sa);
    fx.restore();
  }
  if (cfg.links) links(R, rot, k, P);
  if (cfg.home) home(R, rot, k, P);

  // luz de contorno: do tom da atmosfera (em cima) para o da cor principal (em baixo)
  const g = fx.createLinearGradient(F.cx - R, F.cy - R, F.cx + R, F.cy + R);
  g.addColorStop(0, `rgba(${P.rim},.8)`); g.addColorStop(.5, `rgba(${P.rgb},.25)`); g.addColorStop(1, `rgba(${P.rgb},.6)`);
  fx.strokeStyle = g; fx.lineWidth = 2 * u; fx.beginPath(); fx.arc(F.cx, F.cy, R, 0, 7); fx.stroke();

  if (cfg.rings) {
    ring(R, false); if (Math.sin(sa) >= 0) satellite(R, sa);
    arc(R * 1.17, 0, 7, 1, .16); // linha fina contínua, a emoldurar o planeta
    for (let i = 0; i < 3; i++) fadeArc(R * 1.29, ph * .08 + i * 2.0944, 1.35, 2.2, P.rgb, .8); // três arcos que desvanecem nas pontas
    fx.lineCap = 'butt'; ticks(R * 1.43, -ph * .03, 96, .22); // escala fina
    fx.lineCap = 'round';
    comet(R * 1.57, ph * .5, 1.5, 2.4, P.rgb);
    comet(R * 1.57, -ph * .32 + 2.4, -.9, 1.8, P.acc);
  }
}

// ---------- rato e dedos ----------
// Arrastar roda o planeta (com inércia), a roda do rato ou a pinça fazem zoom, Shift + arrastar
// (ou botão direito) move-o, e duplo clique repõe a vista. Vale em todo o ecrã do globo, menos nos botões.
const pane = slot.parentElement, ptrs = new Map();
let lastX = 0, lastY = 0, lastT = 0, pinch = 0, panning = false;
const dist = () => { const [a, b] = [...ptrs.values()]; return Math.hypot(a[0] - b[0], a[1] - b[1]) || 1; };
const clampZoom = () => { view.zoomT = Math.min(3, Math.max(.6, view.zoomT)); };
slot.title = 'Arrasta para rodar · roda do rato para zoom · Shift + arrastar para mover · duplo clique para repor';
pane.addEventListener('pointerdown', e => {
  if (e.target.closest('button,a,input,textarea,select')) return;
  pane.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  lastX = e.clientX; lastY = e.clientY; lastT = e.timeStamp; view.vel = 0; view.drag = true; view.homing = false;
  panning = e.shiftKey || e.button === 1 || e.button === 2;
  if (ptrs.size === 2) pinch = dist();
});
pane.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (ptrs.size === 2) { const d = dist(); if (pinch) { view.zoomT *= d / pinch; clampZoom(); } pinch = d; return; }
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  if (panning) { view.pxT += dx; view.pyT += dy; view.px = view.pxT; view.py = view.pyT; }
  else {
    const r = slot.getBoundingClientRect().width * .3 * view.zoom, da = dx / r, dt = Math.max(.001, (e.timeStamp - lastT) / 1000);
    view.rot += da;
    view.tilt = view.tiltT = Math.max(-1.4, Math.min(1.4, view.tilt + dy / r));
    view.vel = Math.max(-8, Math.min(8, .6 * view.vel + .4 * da / dt));
  }
  lastX = e.clientX; lastY = e.clientY; lastT = e.timeStamp;
});
const release = e => {
  if (!ptrs.delete(e.pointerId)) return;
  pinch = 0;
  if (panning || e.timeStamp - lastT > 90) view.vel = 0; // parou antes de largar: sem inércia
  if (!ptrs.size) view.drag = false;
  else { const [p] = ptrs.values(); lastX = p[0]; lastY = p[1]; }
};
pane.addEventListener('pointerup', release); pane.addEventListener('pointercancel', release);
pane.addEventListener('wheel', e => { e.preventDefault(); view.zoomT *= Math.exp(-e.deltaY * .0011); clampZoom(); }, { passive: false });
pane.addEventListener('dblclick', e => {
  if (e.target.closest('button,a,input,textarea,select')) return;
  view.zoomT = 1; view.pxT = view.pyT = 0; view.tiltT = TILT0; view.vel = 0; view.homing = true;
});
pane.addEventListener('contextmenu', e => { if (!e.target.closest('input,textarea')) e.preventDefault(); });

requestAnimationFrame(frame);
