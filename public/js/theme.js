// Cor do Camões (verde, azul ou vermelho). Fica guardada só neste dispositivo.
// As cores da página estão no CSS ([data-theme]); aqui ficam as da esfera e da barra do browser.
const THEMES = {
  verde: { rgb: '34,229,139', orbit: '#3CF59A', star: '170,255,210', ray: '120,255,190', halo: '140,255,200', core: ['#DDFFEC', '#7FE8B0', '#2A9E66'], body: ['#0E4A2E', '#062418', '#03130C'], bar: '#050C09' },
  azul: { rgb: '56,189,248', orbit: '#5CCBFF', star: '170,220,255', ray: '120,200,255', halo: '140,210,255', core: ['#DDF3FF', '#7CC8F0', '#2A78A8'], body: ['#0E2F4A', '#061A2B', '#030C14'], bar: '#050A0F' },
  vermelho: { rgb: '244,63,94', orbit: '#FF5C77', star: '255,190,200', ray: '255,140,160', halo: '255,150,170', core: ['#FFE3E8', '#F08A9B', '#A82A40'], body: ['#4A0E1A', '#2B0610', '#140308'], bar: '#0D0507' },
};

let name = 'verde';
try { const t = localStorage.getItem('camoes_cor'); if (THEMES[t]) name = t; } catch (e) {}

export const palette = () => THEMES[name];
export const getTheme = () => name;

export function setTheme(t) {
  if (!THEMES[t]) return;
  name = t;
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]').content = THEMES[t].bar;
  try { localStorage.setItem('camoes_cor', t); } catch (e) {}
}
