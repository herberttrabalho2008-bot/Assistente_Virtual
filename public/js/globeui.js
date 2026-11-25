// Definições do globo: cidade, velocidade, cor de contraste e o que aparece. Aplica ao vivo.
import { $ } from './util.js';
import { getGlobe, setGlobe, CITY_LIST, GLOBE_DEFAULTS } from './orb.js';
import { palette } from './theme.js';

const TOGGLES = ['links', 'home', 'radar', 'rings', 'hud'];
const hex = rgb => '#' + rgb.split(',').map(n => (+n).toString(16).padStart(2, '0')).join('');

// Põe os controlos de acordo com a configuração atual (o seletor de cor mostra a cor em uso).
export function syncGlobeUI() {
  const g = getGlobe();
  $('#gcity').value = g.city;
  $('#gspeed').value = g.speed; $('#gspeed').style.setProperty('--p', (g.speed / 3 * 100) + '%'); $('#gspeedv').textContent = (+g.speed).toFixed(1).replace('.0', '') + '×';
  $('#gacc').value = g.accent || hex(palette().acc);
  $('#gaccx').disabled = !g.accent;
  for (const t of TOGGLES) $('#g-' + t).checked = g[t];
}

export function initGlobeUI() {
  $('#gcity').replaceChildren(...CITY_LIST.map(([id, nome]) => Object.assign(document.createElement('option'), { value: id, textContent: nome })));
  $('#gcity').onchange = e => { setGlobe({ city: e.target.value }); syncGlobeUI(); };
  $('#gspeed').oninput = e => { setGlobe({ speed: +e.target.value }); syncGlobeUI(); };
  $('#gacc').oninput = e => { setGlobe({ accent: e.target.value }); syncGlobeUI(); };
  $('#gaccx').onclick = () => { setGlobe({ accent: '' }); syncGlobeUI(); };
  for (const t of TOGGLES) $('#g-' + t).onchange = e => setGlobe({ [t]: e.target.checked });
  $('#gres').onclick = () => { setGlobe({ ...GLOBE_DEFAULTS }); syncGlobeUI(); };
  // a cor automática depende do tema: refresca ao mudar de cor
  $('#scor').addEventListener('click', () => setTimeout(syncGlobeUI, 0));
  syncGlobeUI();
}
