// Gera a logo do Camões (public/icon.svg) e os ícones PNG, sem dependências. Uso: node tools/make-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
// Logo "a voz em C": barras de onda sonora em forma de C à volta da esfera.
// É a fonte única da logo: gera public/icon.svg e os PNG a partir das mesmas barras.
const G1 = [46, 229, 138], G2 = [168, 240, 196];
const hex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
const R = 160, BAR = 12, ORB = 84;
const BARS = Array.from({ length: 26 }, (_, i) => {
  const a = (45 + i * 270 / 25) * Math.PI / 180;
  const len = 26 + 46 * Math.abs(Math.sin(i * 0.9)) * (0.5 + 0.5 * Math.sin(i * 0.37 + 1));
  const p = d => [256 + d * Math.cos(a), 256 + d * Math.sin(a)];
  return { a: p(R - len / 2), b: p(R + len / 2), color: i % 2 ? G2 : G1 };
});
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
function segDist(u, v, [x1, y1], [x2, y2]) {
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((u - x1) * dx + (v - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(u - x1 - t * dx, v - y1 - t * dy);
}
function paint(u, v) {
  let rgb = [3, 8, 5];
  for (const b of BARS) if (segDist(u, v, b.a, b.b) <= BAR / 2) rgb = b.color;
  if (Math.hypot(u - 256, v - 256) < ORB) {
    const t = Math.min(1, Math.hypot(u - (256 - ORB + .8 * ORB), v - (256 - ORB + .7 * ORB)) / (1.4 * ORB));
    rgb = t < .6 ? mix([240, 255, 246], G2, t / .6) : mix(G2, G1, (t - .6) / .4);
  }
  return rgb;
}
function svg() {
  const f = n => n.toFixed(1);
  const bars = BARS.map(b => `<line x1="${f(b.a[0])}" y1="${f(b.a[1])}" x2="${f(b.b[0])}" y2="${f(b.b[1])}" stroke="${hex(b.color)}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><radialGradient id="o" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#F0FFF6"/><stop offset=".6" stop-color="${hex(G2)}"/><stop offset="1" stop-color="${hex(G1)}"/></radialGradient></defs><rect width="512" height="512" fill="#030805"/><g stroke-width="${BAR}" stroke-linecap="round">${bars}</g><circle cx="256" cy="256" r="${ORB}" fill="url(#o)"/></svg>
`;
}
function png(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size), k = 512 / size;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let acc = [0, 0, 0];
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
        const c = paint((x + (sx + .5) / 4) * k, (y + (sy + .5) / 4) * k);
        acc = acc.map((v, i) => v + c[i] / 16);
      }
      const i = y * (size * 3 + 1) + 1 + x * 3;
      raw[i] = Math.round(acc[0]); raw[i + 1] = Math.round(acc[1]); raw[i + 2] = Math.round(acc[2]);
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const out = path.join(__dirname, '..', 'public');
for (const [name, size] of [['icon-180.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) fs.writeFileSync(path.join(out, name), png(size));
fs.writeFileSync(path.join(out, 'icon.svg'), svg());
fs.copyFileSync(path.join(out, 'icon-512.png'), path.join(__dirname, '..', 'imagens', 'logo.png'));
console.log('Logo e ícones gerados em public/ (e imagens/logo.png)');
