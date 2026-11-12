/* DEDSEC - validadores dos feeds diários (W4K3, Motivação, Organize-se)
 *
 * Arquivo sem dependências, usado em três lugares:
 *  1. n8n: cole este arquivo inteiro num nó "Code" antes do nó do GitHub (veja automation/n8n/README.md).
 *     Se o conteúdo for inválido, o nó lança erro, o fluxo para e o site continua com o conteúdo de ontem.
 *  2. GitHub Actions: automation/validate.js roda a cada push em data/ e avisa por e-mail se algo quebrou.
 *  3. Local: `node automation/validate.js`
 *
 * Cada validador recebe o CONTEÚDO FINAL do arquivo (já com a entrada nova somada às antigas)
 * e devolve uma lista de erros. Lista vazia = válido.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR',
  'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function isText(v, min = 1) { return typeof v === 'string' && v.trim().length >= min; }
function isDate(v) {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === v; // recusa 2026-02-31
}
function isIso(v) { return typeof v === 'string' && !isNaN(Date.parse(v)); }
function isUrlOrHash(v) { return v === '#' || (typeof v === 'string' && /^https?:\/\/\S+$/.test(v)); }

/** Datas em ordem decrescente (mais recente primeiro) e sem repetição. */
function checkNewestFirst(list, errors, label) {
  const seen = new Set();
  for (let i = 0; i < list.length; i++) {
    const d = list[i] && list[i].date;
    if (!isDate(d)) continue;
    if (seen.has(d)) errors.push(`${label}[${i}]: data ${d} repetida`);
    seen.add(d);
    if (i > 0 && isDate(list[i - 1].date) && list[i - 1].date < d) {
      errors.push(`${label}[${i}]: fora de ordem (o mais recente deve vir primeiro)`);
    }
  }
}

/* ---------- W4K3 PR0T0C0L: data/reflections.json ----------
 * [ { id, date: "AAAA-MM-DD",
 *     news: { title, link, summary, source, publishedDate },
 *     reflection: { title, content (HTML simples), excerpt },
 *     sources: [ { title, link, source, date } ],
 *     tags: [ "..." ] }, ... ]   // mais recente primeiro
 */
function validateW4K3(data) {
  const errors = [];
  if (!Array.isArray(data)) return ['o arquivo deve ser uma lista []'];
  if (data.length === 0) errors.push('lista vazia: publique ao menos uma entrada');
  data.forEach((e, i) => {
    const p = `[${i}]`;
    if (!isObj(e)) { errors.push(`${p}: deve ser um objeto`); return; }
    if (!isDate(e.date)) errors.push(`${p}.date: use AAAA-MM-DD`);
    if (!isObj(e.reflection)) errors.push(`${p}.reflection: obrigatório`);
    else {
      if (!isText(e.reflection.title, 3)) errors.push(`${p}.reflection.title: vazio`);
      if (!isText(e.reflection.content, 50)) errors.push(`${p}.reflection.content: vazio ou curto demais`);
    }
    if (e.news !== undefined) {
      if (!isObj(e.news)) errors.push(`${p}.news: deve ser um objeto`);
      else {
        if (!isText(e.news.title)) errors.push(`${p}.news.title: vazio`);
        if (e.news.link !== undefined && !isUrlOrHash(e.news.link)) errors.push(`${p}.news.link: URL inválida`);
      }
    }
    if (e.sources !== undefined) {
      if (!Array.isArray(e.sources)) errors.push(`${p}.sources: deve ser uma lista`);
      else e.sources.forEach((s, j) => {
        if (!isObj(s) || !isText(s.title)) errors.push(`${p}.sources[${j}].title: vazio`);
        else if (s.link !== undefined && !isUrlOrHash(s.link)) errors.push(`${p}.sources[${j}].link: URL inválida`);
      });
    }
    if (e.tags !== undefined && !(Array.isArray(e.tags) && e.tags.every(t => typeof t === 'string'))) {
      errors.push(`${p}.tags: deve ser uma lista de textos`);
    }
  });
  checkNewestFirst(data, errors, '');
  return errors;
}

/* ---------- Motivação Diária: data/motivations.json ----------
 * [ { date: "AAAA-MM-DD", content: "frase", author?: "..." }, ... ]   // mais recente primeiro
 */
function validateMotivacao(data) {
  const errors = [];
  if (!Array.isArray(data)) return ['o arquivo deve ser uma lista []'];
  if (data.length === 0) errors.push('lista vazia: publique ao menos uma frase');
  data.forEach((e, i) => {
    const p = `[${i}]`;
    if (!isObj(e)) { errors.push(`${p}: deve ser um objeto`); return; }
    if (!isDate(e.date)) errors.push(`${p}.date: use AAAA-MM-DD`);
    if (!isText(e.content, 10)) errors.push(`${p}.content: vazio ou curto demais`);
    else if (e.content.length > 500) errors.push(`${p}.content: longo demais (máx. 500 caracteres)`);
    if (e.author !== undefined && typeof e.author !== 'string') errors.push(`${p}.author: deve ser texto`);
  });
  checkNewestFirst(data, errors, '');
  return errors;
}

/* ---------- Organize-se: data/organize.json ----------
 * { updatedAt: "ISO 8601",
 *   dicasGerais: [ "..." ],
 *   eventos: [ {
 *     id, titulo, descricao,
 *     data: "AAAA-MM-DD", hora?: "HH:MM",
 *     uf: "SP", cidade: "São Paulo",
 *     local: "ponto de concentração", trajeto?: "...",
 *     organizacao?: "...", oQueLevar?: [ "..." ],
 *     fonte: { nome, url } } ] }
 * A IA cobre o Brasil inteiro; o site filtra por estado e cidade no navegador.
 */
function validateOrganize(data) {
  const errors = [];
  if (!isObj(data)) return ['o arquivo deve ser um objeto {}'];
  if (!isIso(data.updatedAt)) errors.push('updatedAt: use data e hora ISO 8601');
  if (data.dicasGerais !== undefined && !(Array.isArray(data.dicasGerais) && data.dicasGerais.every(t => isText(t)))) {
    errors.push('dicasGerais: deve ser uma lista de textos');
  }
  if (!Array.isArray(data.eventos)) return errors.concat('eventos: deve ser uma lista []');
  const ids = new Set();
  data.eventos.forEach((e, i) => {
    const p = `eventos[${i}]`;
    if (!isObj(e)) { errors.push(`${p}: deve ser um objeto`); return; }
    if (!isText(e.id)) errors.push(`${p}.id: obrigatório`);
    else if (ids.has(e.id)) errors.push(`${p}.id: "${e.id}" repetido`);
    ids.add(e.id);
    if (!isText(e.titulo, 3)) errors.push(`${p}.titulo: vazio`);
    if (!isDate(e.data)) errors.push(`${p}.data: use AAAA-MM-DD`);
    if (e.hora !== undefined && !TIME_RE.test(e.hora)) errors.push(`${p}.hora: use HH:MM`);
    if (!UFS.includes(e.uf)) errors.push(`${p}.uf: sigla de estado inválida ("${e.uf}")`);
    if (!isText(e.cidade, 2)) errors.push(`${p}.cidade: vazio`);
    if (!isText(e.local, 3)) errors.push(`${p}.local: vazio`);
    if (e.oQueLevar !== undefined && !(Array.isArray(e.oQueLevar) && e.oQueLevar.every(t => isText(t)))) {
      errors.push(`${p}.oQueLevar: deve ser uma lista de textos`);
    }
    if (!isObj(e.fonte) || !isText(e.fonte.nome) || !/^https?:\/\/\S+$/.test(e.fonte.url || '')) {
      errors.push(`${p}.fonte: precisa de nome e url (http/https)`);
    }
  });
  return errors;
}

/** Junta a entrada nova às antigas: tira a do mesmo dia, põe a nova no topo e guarda só as `max` mais recentes. */
function addEntry(list, entry, max = 60) {
  const rest = (Array.isArray(list) ? list : []).filter(e => e && e.date !== entry.date);
  return [entry, ...rest].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, max);
}

const FEEDS = {
  'data/reflections.json': validateW4K3,
  'data/motivations.json': validateMotivacao,
  'data/organize.json': validateOrganize
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { validateW4K3, validateMotivacao, validateOrganize, addEntry, FEEDS };
}
