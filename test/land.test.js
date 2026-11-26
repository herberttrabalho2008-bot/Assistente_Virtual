const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('terra: land.json tem polígonos válidos dentro de lon/lat', () => {
  const { polys } = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'land.json'), 'utf8'));
  assert.ok(polys.length > 100, 'esperava mais de 100 polígonos');
  for (const rings of polys) for (const ring of rings) {
    assert.ok(ring.length >= 6 && ring.length % 2 === 0, 'anel com pontos a menos ou ímpar');
    for (let i = 0; i < ring.length; i += 2) assert.ok(Math.abs(ring[i]) <= 180 && Math.abs(ring[i + 1]) <= 90, 'ponto fora de lon/lat');
  }
});
