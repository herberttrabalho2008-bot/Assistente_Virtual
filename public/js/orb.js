// Globo terrestre futurista (grelha, continentes de pontos, anéis) e texto de estado.
import { $ } from './util.js';
import { palette } from './theme.js';

const HEAD = 'Como posso ajudar-te hoje?';
const cv = $('#orb'), cx = cv.getContext('2d'), W = 640, C = W / 2, R = W * .3;
const still = matchMedia('(prefers-reduced-motion:reduce)').matches;
let state = 'idle', ph = 0, spin = 0, pulse = 0, last = 0, kick = 0;

// Personalização do globo (guardada só neste dispositivo).
export const GLOBE_DEFAULTS = { city: 'lisboa', speed: 1, accent: '', links: true, home: true, radar: true, rings: true, hud: true };
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

// Continentes (contornos grosseiros em [longitude, latitude]) -> nuvem de pontos sobre a esfera.
const LANDS = [
  [[-168,66],[-160,70],[-140,70],[-120,72],[-95,72],[-80,70],[-65,60],[-55,52],[-65,45],[-70,42],[-76,35],[-81,31],[-80,25],[-83,29],[-90,29],[-97,26],[-97,20],[-90,21],[-87,21],[-88,15],[-83,10],[-77,8],[-85,10],[-92,15],[-105,20],[-110,24],[-112,29],[-117,32],[-124,40],[-124,48],[-135,58],[-150,60],[-165,60]],
  [[-78,8],[-72,12],[-62,10],[-52,5],[-50,0],[-35,-6],[-39,-14],[-41,-22],[-48,-26],[-58,-35],[-65,-42],[-68,-52],[-72,-54],[-75,-48],[-73,-38],[-71,-30],[-70,-18],[-76,-14],[-81,-5],[-80,0]],
  [[-9,37],[-9,43],[-2,44],[-5,48],[2,51],[8,54],[10,58],[5,62],[15,69],[28,71],[45,68],[60,70],[80,73],[105,77],[130,72],[160,70],[180,68],[180,64],[165,60],[157,51],[142,54],[135,43],[128,38],[126,34],[122,40],[121,31],[120,24],[110,20],[108,12],[105,9],[100,14],[100,3],[104,1],[98,8],[97,17],[92,22],[88,22],[80,15],[77,8],[73,18],[67,25],[57,25],[55,17],[44,12],[39,21],[35,28],[34,31],[36,36],[27,37],[26,40],[22,37],[19,41],[12,44],[16,38],[12,38],[8,44],[3,43],[-1,38],[-6,36]],
  [[-17,15],[-16,22],[-10,30],[-6,36],[10,37],[11,33],[20,31],[32,31],[34,28],[38,18],[43,12],[51,12],[40,-3],[40,-15],[35,-24],[32,-29],[20,-35],[18,-32],[12,-17],[13,-8],[9,3],[-8,4]],
  [[114,-22],[122,-18],[130,-12],[137,-12],[142,-11],[146,-19],[153,-26],[150,-37],[141,-38],[135,-34],[130,-32],[115,-34]],
  [[-55,60],[-45,60],[-20,70],[-20,82],[-60,82],[-70,76]],
  [[-5,50],[2,51],[-2,57],[-5,58],[-6,54]],
  [[130,32],[140,36],[142,44],[140,42],[135,35]],
  [[109,1],[117,7],[119,1],[116,-4],[110,-3]],
  [[44,-25],[50,-15],[49,-12],[44,-17]],
];
function inside(lo, la, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > la) !== (yj > la) && lo < (xj - xi) * (la - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const D = Math.PI / 180, TILT0 = 23 * D, ST = 2.6, RING = -.35;

// Vista controlada com o rato ou os dedos: rodar (arrastar), zoom (roda / pinça), mover (Shift + arrastar).
// Os campos "T" são o alvo para onde a vista desliza; "vel" é a inércia da rotação depois de largar.
const view = { rot: 0, vel: 0, tilt: TILT0, tiltT: TILT0, zoom: 1, zoomT: 1, px: 0, py: 0, pxT: 0, pyT: 0, hold: 99, drag: false, homing: false };
let tc = Math.cos(TILT0), ts = Math.sin(TILT0); // cos e sen da inclinação atual (calculados uma vez por quadro)
// Com zoom, o próprio quadro do globo cresce (até ao tamanho da janela) em vez de cortar a imagem:
// S = quanto o quadro cresceu, L = lado do canvas em pixéis, zdraw = zoom que sobra para desenhar lá dentro.
let S = 1, L = W, zdraw = 1;
const LAND = [];
for (let la = -88; la <= 88; la += ST) {
  const step = ST / Math.max(.15, Math.cos(la * D));
  for (let lo = -180; lo < 180; lo += step) {
    if (la < -68 || LANDS.some(p => inside(lo, la, p))) LAND.push([lo * D, la * D, Math.random() * 7]);
  }
}

// Roda um ponto (lon, lat) e projeta-o: devolve [x, y, z] (z > 0 = face visível).
// "h" levanta o ponto acima da superfície (para as ligações de dados).
function proj(lo, la, rot, h = 0) {
  const l = lo + rot, cl = Math.cos(la), s = 1 + h;
  const x = cl * Math.sin(l), y = Math.sin(la), z = cl * Math.cos(l);
  return [x * s, (y * tc - z * ts) * s, (y * ts + z * tc) * s];
}

// Cidades que podes escolher como "a tua": [id, nome, latitude, longitude].
export const CITY_LIST = [
  ['lisboa', 'Lisboa', 38.72, -9.14], ['porto', 'Porto', 41.15, -8.61], ['funchal', 'Funchal', 32.65, -16.91], ['praia', 'Praia', 14.93, -23.51],
  ['luanda', 'Luanda', -8.84, 13.23], ['maputo', 'Maputo', -25.97, 32.57], ['saopaulo', 'São Paulo', -23.55, -46.63], ['rio', 'Rio de Janeiro', -22.91, -43.17],
  ['londres', 'Londres', 51.51, -.13], ['paris', 'Paris', 48.86, 2.35], ['madrid', 'Madrid', 40.42, -3.7], ['novaiorque', 'Nova Iorque', 40.71, -74.01],
  ['dubai', 'Dubai', 25.2, 55.27], ['joanesburgo', 'Joanesburgo', -26.2, 28.05], ['toquio', 'Tóquio', 35.68, 139.69], ['sydney', 'Sydney', -33.87, 151.21],
];
const DEST_ORDER = ['novaiorque', 'saopaulo', 'luanda', 'londres', 'toquio', 'joanesburgo', 'sydney', 'dubai', 'paris'];
const fmtCoord = (la, lo) => `${Math.abs(la).toFixed(1)}°${la >= 0 ? 'N' : 'S'} ${Math.abs(lo).toFixed(1)}°${lo >= 0 ? 'E' : 'O'}`;
// Ligações de dados: arcos (caminho mais curto) da tua cidade para outras seis.
let HOME, CITIES, ROUTES;
const vec = (lo, la) => [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
function route(a, b) {
  const va = vec(a[0], a[1]), vb = vec(b[0], b[1]);
  const w = Math.acos(Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]))), sw = Math.sin(w) || 1;
  return t => { // [lon, lat, altura] a uma fração t do caminho
    const k0 = Math.sin((1 - t) * w) / sw, k1 = Math.sin(t * w) / sw;
    const x = va[0] * k0 + vb[0] * k1, y = va[1] * k0 + vb[1] * k1, z = va[2] * k0 + vb[2] * k1;
    return [Math.atan2(x, z), Math.asin(Math.max(-1, Math.min(1, y))), Math.sin(Math.PI * t) * w * .12];
  };
}
function rebuild() {
  const h = CITY_LIST.find(c => c[0] === cfg.city) || CITY_LIST[0];
  HOME = { lo: h[3] * D, la: h[2] * D, name: h[1].toUpperCase(), txt: fmtCoord(h[2], h[3]) };
  CITIES = DEST_ORDER.filter(id => id !== h[0]).slice(0, 6).map(id => CITY_LIST.find(c => c[0] === id)).map(c => [c[1], c[3] * D, c[2] * D]);
  ROUTES = CITIES.map(c => route([HOME.lo, HOME.la], [c[1], c[2]]));
}
rebuild();
const STATE_TXT = { idle: 'EM ESPERA', listen: 'A OUVIR', think: 'A PROCESSAR', speak: 'A RESPONDER' };

export const getState = () => state;
export const pulseKick = v => { kick = v; };

export function setState(s) {
  state = s;
  $('#hd').textContent = s === 'listen' ? 'A ouvir…' : s === 'think' ? 'A pensar…' : s === 'speak' ? 'A falar…' : HEAD;
}

function arc(r, from, span, width, alpha) {
  cx.strokeStyle = `rgba(${pal().rgb},${alpha})`; cx.lineWidth = width;
  cx.beginPath(); cx.arc(C, C, r, from, from + span); cx.stroke();
}

// Anel de marcas, como o mostrador de um instrumento (uma marca maior de 10 em 10).
function ticks(r, rot, n, alpha) {
  cx.strokeStyle = `rgba(${pal().rgb},${alpha})`; cx.lineWidth = 1.5;
  cx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + i * 2 * Math.PI / n, len = i % 10 === 0 ? 13 : 5;
    cx.moveTo(C + Math.cos(a) * r, C + Math.sin(a) * r); cx.lineTo(C + Math.cos(a) * (r + len), C + Math.sin(a) * (r + len));
  }
  cx.stroke();
}

// Cometa: um arco com cauda que se apaga e uma cabeça brilhante. "span" negativo roda ao contrário.
function comet(r, head, span, width, rgb) {
  const P = pal(), N = 28;
  cx.lineWidth = width;
  for (let i = 0; i < N; i++) {
    const a0 = head - span * (i + 1) / N, a1 = head - span * i / N, f = 1 - i / N;
    cx.strokeStyle = `rgba(${rgb},${.75 * f * f})`;
    cx.beginPath(); cx.arc(C, C, r, Math.min(a0, a1), Math.max(a0, a1) + .01); cx.stroke();
  }
  cx.fillStyle = '#fff'; cx.shadowColor = `rgba(${rgb},1)`; cx.shadowBlur = 14;
  cx.beginPath(); cx.arc(C + Math.cos(head) * r, C + Math.sin(head) * r, width * .9, 0, 7); cx.fill();
  cx.shadowBlur = 0;
}

// Linha da grelha (meridiano ou paralelo): só desenha a parte virada para nós.
function gridLine(pts, rot, Rg, alpha, width) {
  cx.strokeStyle = `rgba(${pal().rgb},${alpha})`; cx.lineWidth = width;
  cx.beginPath();
  let pen = false;
  for (const [lo, la] of pts) {
    const [x, y, z] = proj(lo, la, rot);
    if (z <= 0) { pen = false; continue; }
    const px = C + x * Rg, py = C - y * Rg;
    if (pen) cx.lineTo(px, py); else cx.moveTo(px, py);
    pen = true;
  }
  cx.stroke();
}
const meridian = lo => Array.from({ length: 61 }, (_, i) => [lo * D, (-90 + i * 3) * D]);
const parallel = la => Array.from({ length: 121 }, (_, i) => [(-180 + i * 3) * D, la * D]);

// Anel inclinado à volta do globo; "back" desenha a metade de trás, senão a da frente.
function ring(back) {
  cx.strokeStyle = pal().orbit; cx.lineWidth = 2;
  cx.globalAlpha = back ? .25 : .8;
  cx.beginPath(); cx.ellipse(C, C, R * 1.24, R * .3, RING, back ? Math.PI : 0, back ? 2 * Math.PI : Math.PI); cx.stroke();
  cx.globalAlpha = 1;
}

// Satélite a girar no anel (a, ou na frente do globo, ou atrás dele).
function satellite(sa) {
  const sx = Math.cos(sa) * R * 1.24, sy = Math.sin(sa) * R * .3;
  cx.fillStyle = '#fff'; cx.shadowColor = `rgba(${pal().acc},1)`; cx.shadowBlur = 18;
  cx.beginPath(); cx.arc(C + sx * Math.cos(RING) - sy * Math.sin(RING), C + sx * Math.sin(RING) + sy * Math.cos(RING), 5, 0, 7); cx.fill();
  cx.shadowBlur = 0;
}

function frame(t) {
  const dt = Math.min(.05, (t - last) / 1000 || .016); last = t;
  const sp = { idle: .5, listen: .9, think: 2.6, speak: 1.6 }[state];
  ph += dt * sp * (still ? .2 : 1);
  // vista: com o dedo/rato em cima a rotação automática pára e volta devagar ~1,5 s depois de largar
  if (view.drag) view.hold = 0;
  else { view.rot += view.vel * dt; view.vel *= Math.pow(.04, dt); view.hold += dt; }
  const ease = k => Math.min(1, dt * k);
  view.zoom += (view.zoomT - view.zoom) * ease(10); view.tilt += (view.tiltT - view.tilt) * ease(8);
  view.px += (view.pxT - view.px) * ease(10); view.py += (view.pyT - view.py) * ease(10);
  if (view.homing) { // duplo clique: volta a rodar para a posição inicial (onde está a tua cidade)
    const diff = -spin - view.rot; view.rot += diff * ease(6);
    if (Math.abs(diff) < .01) view.homing = false;
  }
  tc = Math.cos(view.tilt); ts = Math.sin(view.tilt);
  const base = Math.min(420, innerWidth * .8, innerHeight * .48); // lado do quadro sem zoom (igual ao CSS)
  const Smax = Math.max(1, Math.min(innerWidth, innerHeight * .95) / base);
  S = Math.round(Math.min(Math.max(1, view.zoom), Smax) * 20) / 20;
  if (cv.width !== Math.round(W * S)) { cv.width = cv.height = Math.round(W * S); cv.style.setProperty('--s', S); }
  L = cv.width; zdraw = view.zoom / S;
  // o globo não pode sair do quadro (senão ficaria cortado): limita o quanto se pode mover
  const lim = Math.max(0, L / 2 - 300 * zdraw);
  for (const k of ['px', 'py', 'pxT', 'pyT']) view[k] = Math.max(-lim, Math.min(lim, view[k]));
  cv.classList.toggle('zm', S > 1);
  spin += dt * sp * .28 * cfg.speed * (still ? .2 : 1) * (view.drag ? 0 : Math.min(1, view.hold / 1.5));
  const k = t / 1000;
  const tgt = state === 'listen' ? .08 + .08 * Math.sin(k * 7) : state === 'speak' ? .2 * (.4 + .6 * Math.abs(Math.sin(k * 9) * Math.sin(k * 4.1))) + kick : .04 * Math.sin(k * 1.6);
  pulse += (tgt - pulse) * .2; kick *= .92;
  const P = pal(), rot = spin + view.rot, Rg = R * (1 + pulse * .12), sa = ph * .9;
  cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, L, L);
  cx.setTransform(1, 0, 0, 1, (L - W) / 2, (L - W) / 2); // o desenho de 640×640 fica sempre ao centro do quadro
  cx.save(); cx.translate(C + view.px, C + view.py); cx.scale(zdraw, zdraw); cx.translate(-C, -C);

  // atmosfera
  let g = cx.createRadialGradient(C, C, Rg * .8, C, C, Rg * 1.5);
  g.addColorStop(0, `rgba(${P.rgb},${Math.min(.6, .2 + pulse)})`); g.addColorStop(.45, `rgba(${P.rim},.13)`); g.addColorStop(1, `rgba(${P.rim},0)`);
  cx.fillStyle = g; cx.fillRect(0, 0, W, W);

  // anel (metade de trás), satélite se estiver atrás, e corpo do globo
  cx.lineCap = 'round';
  if (cfg.rings) ring(true);
  if (cfg.rings && Math.sin(sa) < 0) satellite(sa);
  g = cx.createRadialGradient(C - Rg * .3, C - Rg * .3, 0, C, C, Rg);
  g.addColorStop(0, P.body[0]); g.addColorStop(.6, P.body[1]); g.addColorStop(1, P.body[2]);
  cx.fillStyle = g; cx.beginPath(); cx.arc(C, C, Rg, 0, 7); cx.fill();

  // grelha de latitudes/longitudes e um paralelo brilhante que sobe e desce
  for (let lo = -180; lo < 180; lo += 30) gridLine(meridian(lo), rot, Rg, .2, 1);
  for (let la = -60; la <= 60; la += 30) gridLine(parallel(la), rot, Rg, la ? .2 : .4, 1);
  const sw = Math.sin(k * .6) * 70 * D;
  gridLine(parallel(sw / D), rot, Rg, .75, 2);

  // terra feita de pontos (mais clara ao centro, a apagar-se na orla)
  for (const [lo, la, f] of LAND) {
    const [x, y, z] = proj(lo, la, rot);
    if (z <= 0) continue;
    const near = Math.abs(la - sw) < 4 * D;
    cx.fillStyle = `rgba(${near ? P.acc : z < .35 ? P.rim : P.star},${Math.min(1, (.15 + .75 * z) * (near ? 1.4 : 1) + .12 * Math.sin(k * 2 + f))})`;
    const s = 1.6 + z * 1.4;
    cx.fillRect(C + x * Rg - s / 2, C - y * Rg - s / 2, s, s);
  }

  // varrimento de radar e linhas de scan holográficas, só dentro do globo
  if (cfg.radar) {
  cx.save(); cx.beginPath(); cx.arc(C, C, Rg, 0, 7); cx.clip();
  if (cx.createConicGradient) {
    const gr = cx.createConicGradient(ph * .7, C, C);
    gr.addColorStop(0, `rgba(${P.rgb},0)`); gr.addColorStop(.78, `rgba(${P.rgb},0)`); gr.addColorStop(1, `rgba(${P.rgb},.34)`);
    cx.fillStyle = gr; cx.fillRect(C - Rg, C - Rg, Rg * 2, Rg * 2);
  }
  cx.fillStyle = `rgba(${P.rgb},.06)`;
  for (let y = C - Rg + (k * 18) % 5; y < C + Rg; y += 5) cx.fillRect(C - Rg, y, Rg * 2, 1);
  cx.restore();
  }

  // ligações de dados a partir da tua cidade, com pacotes a viajar
  if (cfg.links) ROUTES.forEach((rt, i) => {
    cx.strokeStyle = `rgba(${P.acc},.6)`; cx.lineWidth = 1.5; cx.beginPath();
    let pen = false;
    for (let j = 0; j <= 40; j++) {
      const [lo, la, h] = rt(j / 40), [x, y, z] = proj(lo, la, rot, h);
      if (z <= .02) { pen = false; continue; }
      const px = C + x * Rg, py = C - y * Rg;
      if (pen) cx.lineTo(px, py); else cx.moveTo(px, py);
      pen = true;
    }
    cx.stroke();
    const [lo, la, h] = rt((k * .35 + i * .17) % 1), [x, y, z] = proj(lo, la, rot, h);
    if (z > .02) {
      cx.fillStyle = '#fff'; cx.shadowColor = `rgba(${P.acc},1)`; cx.shadowBlur = 12;
      cx.beginPath(); cx.arc(C + x * Rg, C - y * Rg, 3, 0, 7); cx.fill(); cx.shadowBlur = 0;
    }
    const [nx, ny, nz] = proj(CITIES[i][1], CITIES[i][2], rot);
    if (nz > .02) { cx.fillStyle = `rgba(${P.acc},.95)`; cx.fillRect(C + nx * Rg - 3, C - ny * Rg - 3, 6, 6); }
  });

  // a tua cidade: marcador com onda e legenda
  const [lx, ly, lz] = proj(HOME.lo, HOME.la, rot);
  if (cfg.home && lz > .05) {
    const px = C + lx * Rg, py = C - ly * Rg, w = (k * .8) % 1, dir = lx >= 0 ? 1 : -1;
    cx.strokeStyle = `rgba(${P.acc},${(1 - w) * .9 * lz})`; cx.lineWidth = 2;
    cx.beginPath(); cx.arc(px, py, 4 + w * 22, 0, 7); cx.stroke();
    cx.fillStyle = '#fff'; cx.shadowColor = `rgba(${P.acc},1)`; cx.shadowBlur = 16;
    cx.beginPath(); cx.arc(px, py, 3.5, 0, 7); cx.fill(); cx.shadowBlur = 0;
    cx.strokeStyle = `rgba(${P.acc},${.8 * lz})`; cx.lineWidth = 1.2;
    cx.beginPath(); cx.moveTo(px, py); cx.lineTo(px + dir * 26, py - 26); cx.lineTo(px + dir * 76, py - 26); cx.stroke();
    cx.font = '15px ui-monospace, Consolas, monospace'; cx.textAlign = dir > 0 ? 'left' : 'right'; cx.textBaseline = 'bottom';
    cx.fillStyle = `rgba(${P.acc},${.95 * lz})`;
    cx.fillText(HOME.name, px + dir * 30, py - 29);
    cx.textBaseline = 'top'; cx.fillStyle = `rgba(${P.rgb},${.8 * lz})`; cx.fillText(HOME.txt, px + dir * 30, py - 22);
  }

  // orla com reflexo
  g = cx.createRadialGradient(C, C, Rg * .78, C, C, Rg);
  g.addColorStop(0, `rgba(${P.rgb},0)`); g.addColorStop(1, `rgba(${P.rgb},.35)`);
  cx.fillStyle = g; cx.beginPath(); cx.arc(C, C, Rg, 0, 7); cx.fill();
  // luz de contorno: do tom da atmosfera (canto de cima) para o da cor principal (baixo)
  g = cx.createLinearGradient(C - Rg, C - Rg, C + Rg, C + Rg);
  g.addColorStop(0, `rgba(${P.rim},.95)`); g.addColorStop(.5, `rgba(${P.rgb},.35)`); g.addColorStop(1, `rgba(${P.rgb},.7)`);
  cx.strokeStyle = g; cx.lineWidth = 2.5; cx.beginPath(); cx.arc(C, C, Rg, 0, 7); cx.stroke();

  // anel (metade da frente) e satélite se estiver à frente
  if (cfg.rings) ring(false);
  if (cfg.rings && Math.sin(sa) >= 0) satellite(sa);

  // contorno pontilhado e anéis exteriores
  cx.setLineDash([1.5, 7]); arc(R * 1.05, ph * .1, 7, 1.5, .45); cx.setLineDash([]);
  if (cfg.rings) {
    cx.lineCap = 'butt'; ticks(R * 1.32, -ph * .05, 120, .32);
    arc(R * 1.44, 0, 7, 1, .14);
    cx.lineCap = 'round';
    comet(R * 1.44, ph * .55, 1.7, 3.2, P.rgb);
    comet(R * 1.44, -ph * .4 + 2.6, -1.1, 2.4, P.acc);
    // cantos de mira: quatro suportes grossos a rodar muito devagar
    cx.lineCap = 'butt';
    for (let i = 0; i < 4; i++) arc(R * 1.6, ph * .04 + Math.PI / 4 + i * Math.PI / 2 - .22, .44, 3, .6);
  }

  cx.restore(); // fim da parte que faz zoom; os textos dos cantos ficam sempre no mesmo sítio

  // leituras nos cantos, estilo painel de comando
  if (!cfg.hud) { requestAnimationFrame(frame); return; }
  const hh = new Date().toISOString().slice(11, 19);
  cx.font = '17px ui-monospace, Consolas, monospace'; cx.textBaseline = 'top'; cx.fillStyle = `rgba(${P.rgb},.7)`;
  cx.textAlign = 'left'; cx.fillText('■ SISTEMA ATIVO', 16, 14); cx.textBaseline = 'bottom'; cx.fillText('REDE ' + String(cfg.links ? ROUTES.length : 0).padStart(2, '0') + ' LIGAÇÕES', 16, W - 14);
  cx.textAlign = 'right'; cx.textBaseline = 'top'; cx.fillStyle = `rgba(${P.acc},.9)`; cx.fillText(STATE_TXT[state] + ' ◂', W - 16, 14);
  cx.fillStyle = `rgba(${P.rgb},.7)`; cx.textBaseline = 'bottom'; cx.fillText(hh + ' UTC', W - 16, W - 14);
  requestAnimationFrame(frame);
}

// Rato e dedos: arrastar roda o globo (com inércia), a roda do rato ou a pinça fazem zoom,
// Shift + arrastar (ou botão direito) move-o, e duplo clique repõe a vista.
const ptrs = new Map();
let lastX = 0, lastY = 0, lastT = 0, pinch = 0, panning = false;
const cssW = () => cv.getBoundingClientRect().width;
const dist = () => { const [a, b] = [...ptrs.values()]; return Math.hypot(a[0] - b[0], a[1] - b[1]) || 1; };
function clampView() {
  view.zoomT = Math.min(3, Math.max(.6, view.zoomT));
}
cv.title = 'Arrasta para rodar · roda do rato para zoom · Shift + arrastar para mover · duplo clique para repor';
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  lastX = e.clientX; lastY = e.clientY; lastT = e.timeStamp; view.vel = 0; view.drag = true; view.homing = false;
  panning = e.shiftKey || e.button === 1 || e.button === 2;
  if (ptrs.size === 2) pinch = dist();
});
cv.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (ptrs.size === 2) { const d = dist(); if (pinch) { view.zoomT *= d / pinch; clampView(); } pinch = d; return; }
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  if (panning) {
    const k = L / cssW();
    view.pxT += dx * k; view.pyT += dy * k; clampView(); view.px = view.pxT; view.py = view.pyT;
  } else {
    const r = R * (cssW() / L) * zdraw, da = dx / r, dt = Math.max(.001, (e.timeStamp - lastT) / 1000);
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
cv.addEventListener('pointerup', release); cv.addEventListener('pointercancel', release);
cv.addEventListener('wheel', e => { e.preventDefault(); view.zoomT *= Math.exp(-e.deltaY * .0011); clampView(); }, { passive: false });
cv.addEventListener('dblclick', () => { view.zoomT = 1; view.pxT = view.pyT = 0; view.tiltT = TILT0; view.vel = 0; view.homing = true; });
cv.addEventListener('contextmenu', e => e.preventDefault());

requestAnimationFrame(frame);
