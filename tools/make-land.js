// Gera public/data/land.json (os continentes do globo) a partir de um GeoJSON do Natural Earth.
// Uso: node tools/make-land.js ne_110m_land.geojson
// Fonte: Natural Earth, "Land" 110m (domínio público): https://www.naturalearthdata.com/downloads/110m-physical-vectors/
const fs = require('fs');
const path = require('path');

const [, , input, output = path.join(__dirname, '..', 'public', 'data', 'land.json')] = process.argv;
if (!input) { console.error('Uso: node tools/make-land.js <ficheiro.geojson> [saída.json]'); process.exit(1); }

const gj = JSON.parse(fs.readFileSync(input, 'utf8'));
const polys = [];
const bad = () => { throw new Error('GeoJSON inesperado'); };
const round = n => Math.round(n * 10) / 10;

// Cada polígono é uma lista de anéis; cada anel é uma lista plana [lon, lat, lon, lat, ...] com 1 casa decimal.
function addPolygon(rings) {
  if (!Array.isArray(rings)) bad();
  polys.push(rings.map(ring => {
    const flat = [];
    for (const pt of ring) {
      const [lo, la] = pt;
      if (!(Math.abs(lo) <= 180 && Math.abs(la) <= 90)) bad(); // também apanha NaN
      flat.push(round(lo), round(la));
    }
    return flat;
  }));
}

if (gj.type !== 'FeatureCollection' || !Array.isArray(gj.features)) bad();
for (const f of gj.features) {
  const g = f && f.geometry;
  if (!g) bad();
  if (g.type === 'Polygon') addPolygon(g.coordinates);
  else if (g.type === 'MultiPolygon') g.coordinates.forEach(addPolygon);
  else bad();
}

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify({ fonte: 'Natural Earth 110m Land (domínio público)', polys }));
console.log(`${polys.length} polígonos -> ${output} (${fs.statSync(output).size} bytes)`);
