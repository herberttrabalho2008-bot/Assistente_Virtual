export const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2, '0');
export const toLocal = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
export const fmt = i => new Date(i).toLocaleString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

let tt;
export function toast(m) {
  const t = $('#toast'); t.textContent = m; t.style.display = 'block';
  clearTimeout(tt); tt = setTimeout(() => t.style.display = 'none', 6000);
}
