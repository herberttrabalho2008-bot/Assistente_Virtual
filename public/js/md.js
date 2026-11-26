// Markdown simples para as respostas: blocos de código, listas, títulos, negrito, itálico e código em linha.
// Constrói elementos do DOM (nunca innerHTML), por isso o texto do modelo não consegue injetar HTML.
const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };

function inline(parent, text) {
  const re = /`([^`\n]+)`|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) parent.append(text.slice(last, m.index));
    const n = el(m[1] !== undefined ? 'code' : m[2] !== undefined ? 'strong' : 'em');
    n.textContent = m[1] ?? m[2] ?? m[3];
    parent.append(n); last = re.lastIndex;
  }
  if (last < text.length) parent.append(text.slice(last));
}

// Texto fora de blocos de código: parágrafos, títulos (#) e listas (-, *, 1.).
function blocks(root, text) {
  let list = null, para = null;
  for (const line of text.split('\n')) {
    const item = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line), head = /^#{1,3}\s+(.*)$/.exec(line);
    if (item) {
      const tag = /^\s*\d/.test(line) ? 'ol' : 'ul';
      if (!list || list.localName !== tag) { list = el(tag); root.append(list); }
      para = null;
      const li = el('li'); inline(li, item[1]); list.append(li);
    } else if (!line.trim()) list = para = null;
    else if (head) { list = para = null; const p = el('p', 'h'); inline(p, head[1]); root.append(p); }
    else {
      list = null;
      if (para) para.append('\n'); else { para = el('p'); root.append(para); }
      inline(para, line);
    }
  }
}

// Escreve o markdown "text" dentro de "root". Um bloco de código ainda por fechar (resposta a meio) conta como código.
export function md(root, text) {
  root.replaceChildren();
  text.split('```').forEach((part, i) => {
    if (i % 2) {
      const pre = el('pre'), code = el('code');
      code.textContent = part.replace(/^[^\n]*\n/, '').replace(/\n$/, ''); // a 1.ª linha pode ser o nome da linguagem
      pre.append(code); root.append(pre);
    } else blocks(root, part);
  });
}

// Texto simples para o ecrã inicial: sem os blocos de código nem os símbolos do markdown.
export const plain = s => s.replace(/```[\s\S]*?(```|$)/g, ' ').replace(/[*`#]+/g, '').trim();
