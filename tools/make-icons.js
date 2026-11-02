// Gera os ícones PNG (esfera verde sobre fundo escuro) sem dependências. Uso: node tools/make-icons.js
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
function png(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  const R = size * 0.29, c = size / 2;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const i = y * (size * 3 + 1) + 1 + x * 3;
      const d = Math.hypot(x - c, y - c);
      let rgb = [3, 8, 5];
      if (d < R) {
        const t = Math.min(1, Math.hypot(x - (c - R * .25), y - (c - R * .3)) / (R * 1.3));
        rgb = [240 - 194 * t, 255 - 26 * t, 246 - 108 * t];
      } else if (d < R * 1.5) {
        const g = 1 - (d - R) / (R * .5);
        rgb = [3 + 20 * g * g, 8 + 120 * g * g, 5 + 70 * g * g];
      }
      raw[i] = rgb[0]; raw[i + 1] = rgb[1]; raw[i + 2] = rgb[2];
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const out = path.join(__dirname, '..', 'public');
for (const [name, size] of [['icon-180.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) fs.writeFileSync(path.join(out, name), png(size));
console.log('Ícones gerados em public/');
