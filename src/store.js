// Armazenamento dos lembretes num ficheiro JSON.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function createStore(file) {
  const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; } };
  const write = list => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
    fs.renameSync(tmp, file);
  };

  return {
    list: read,
    add(text, when) {
      const d = new Date(when);
      if (!text || isNaN(d)) throw new Error('lembrete inválido');
      const r = { id: 'r' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex'), text: String(text).slice(0, 300), when: d.toISOString(), done: false };
      const list = read(); list.push(r); write(list);
      return r;
    },
    patch(id, patch) {
      const list = read(); const r = list.find(x => x.id === id);
      if (!r) return null;
      if (typeof patch.done === 'boolean') r.done = patch.done;
      write(list); return r;
    },
    remove(id) {
      const list = read(); const rest = list.filter(x => x.id !== id);
      if (rest.length === list.length) return false;
      write(rest); return true;
    },
  };
}

module.exports = { createStore };
