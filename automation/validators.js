/* DEDSEC - validadores dos arquivos de data/ (W4K3, Motivação, Organize-se e regras do Fact Check)
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
    if (e.video !== undefined) {
      const ok = (s, ext) => typeof s === 'string' && new RegExp('^assets/videos/[\\w./-]+\\.' + ext + '$').test(s) && !s.includes('..');
      if (!isObj(e.video) || !ok(e.video.src, 'mp4')) errors.push(`${p}.video.src: use assets/videos/....mp4`);
      else if (e.video.poster !== undefined && !ok(e.video.poster, '(jpg|png)')) errors.push(`${p}.video.poster: use assets/videos/....jpg`);
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
 * Gravado todo dia por automation/organize/fetch.js (GitHub Actions), a partir de manchetes do Google Notícias.
 * { updatedAt: "ISO 8601",
 *   buscas?: [ { busca, ok, manchetes, atos } ],
 *   eventos: [ {
 *     id, titulo,
 *     tipo: "convocacao" (ato marcado) | "cobertura" (ato que está/estava rolando),
 *     uf: "SP" | ... | "BR" (nacional, várias cidades), estados?: ["SP", "RJ"],
 *     cidade?: "São Paulo", data?: "AAAA-MM-DD" (dia do ato; sem data = conferir na fonte), hora?: "HH:MM",
 *     publicadoEm: "ISO 8601",
 *     fonte: { nome, url }, outrasFontes?: [ { nome, url } ] } ] }
 * O site filtra por estado no navegador.
 */
const ORG_TIPOS = ['convocacao', 'cobertura'];
function isFonte(f) { return isObj(f) && isText(f.nome) && /^https?:\/\/\S+$/.test(f.url || ''); }

function validateOrganize(data) {
  const errors = [];
  if (!isObj(data)) return ['o arquivo deve ser um objeto {}'];
  if (!isIso(data.updatedAt)) errors.push('updatedAt: use data e hora ISO 8601');
  if (data.buscas !== undefined && !Array.isArray(data.buscas)) errors.push('buscas: deve ser uma lista');
  if (!Array.isArray(data.eventos)) return errors.concat('eventos: deve ser uma lista []');
  const ids = new Set();
  data.eventos.forEach((e, i) => {
    const p = `eventos[${i}]`;
    if (!isObj(e)) { errors.push(`${p}: deve ser um objeto`); return; }
    if (!isText(e.id)) errors.push(`${p}.id: obrigatório`);
    else if (ids.has(e.id)) errors.push(`${p}.id: "${e.id}" repetido`);
    ids.add(e.id);
    if (!isText(e.titulo, 3)) errors.push(`${p}.titulo: vazio`);
    if (!ORG_TIPOS.includes(e.tipo)) errors.push(`${p}.tipo: use ${ORG_TIPOS.join(' ou ')}`);
    if (e.uf !== 'BR' && !UFS.includes(e.uf)) errors.push(`${p}.uf: sigla de estado inválida ("${e.uf}")`);
    if (e.estados !== undefined && !(Array.isArray(e.estados) && e.estados.every(u => UFS.includes(u)))) errors.push(`${p}.estados: lista de siglas`);
    if (e.cidade !== undefined && !isText(e.cidade, 2)) errors.push(`${p}.cidade: vazio`);
    if (e.data !== undefined && !isDate(e.data)) errors.push(`${p}.data: use AAAA-MM-DD`);
    if (e.hora !== undefined && !TIME_RE.test(e.hora)) errors.push(`${p}.hora: use HH:MM`);
    if (!isIso(e.publicadoEm)) errors.push(`${p}.publicadoEm: use data e hora ISO 8601`);
    if (!isFonte(e.fonte)) errors.push(`${p}.fonte: precisa de nome e url (http/https)`);
    if (e.outrasFontes !== undefined && !(Array.isArray(e.outrasFontes) && e.outrasFontes.every(isFonte))) {
      errors.push(`${p}.outrasFontes: lista de { nome, url }`);
    }
  });
  return errors;
}

/* ---------- Fact Check: data/factcheck.json (regras, editado à mão) ----------
 * { updatedAt: "ISO 8601",
 *   trusted: [ { name, type: imprensa|checagem|governo|servico, domains: ["g1.globo.com"], brands: ["globo"] } ],
 *   shorteners: ["bit.ly"], riskyTlds: ["xyz"], scamWords: ["pix"], dangerousExtensions: ["apk"],
 *   agencies: [ { name, site: "aosfatos.org" } ] }   // site pode ter caminho: "g1.globo.com/fato-ou-fake"
 */
const HOST_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
const FC_TYPES = ['imprensa', 'checagem', 'governo', 'servico', 'plataforma'];

function validateFactCheck(data) {
  const errors = [];
  if (!isObj(data)) return ['o arquivo deve ser um objeto {}'];
  if (!isIso(data.updatedAt)) errors.push('updatedAt: use data e hora ISO 8601');

  const owner = new Map();
  if (!Array.isArray(data.trusted) || data.trusted.length === 0) errors.push('trusted: lista vazia ou ausente');
  else data.trusted.forEach((t, i) => {
    const p = `trusted[${i}]`;
    if (!isObj(t)) { errors.push(`${p}: deve ser um objeto`); return; }
    if (!isText(t.name)) errors.push(`${p}.name: vazio`);
    if (!FC_TYPES.includes(t.type)) errors.push(`${p}.type: use ${FC_TYPES.join(', ')}`);
    if (!Array.isArray(t.domains) || t.domains.length === 0) errors.push(`${p}.domains: lista vazia`);
    else t.domains.forEach(d => {
      if (!HOST_RE.test(d)) errors.push(`${p}.domains: "${d}" não é um domínio (minúsculas, sem http://)`);
      else if (owner.has(d)) errors.push(`${p}.domains: "${d}" já está em ${owner.get(d)}`);
      else owner.set(d, t.name);
    });
    if (!Array.isArray(t.brands) || !t.brands.every(b => /^[a-z0-9]{2,}$/.test(b))) {
      errors.push(`${p}.brands: lista de palavras em minúsculas, sem acento nem espaço`);
    }
  });

  for (const key of ['shorteners']) {
    if (!Array.isArray(data[key]) || !data[key].every(d => HOST_RE.test(d))) errors.push(`${key}: lista de domínios`);
  }
  for (const key of ['riskyTlds', 'scamWords', 'dangerousExtensions']) {
    if (!Array.isArray(data[key]) || !data[key].every(w => /^[a-z0-9]{1,}$/.test(w))) {
      errors.push(`${key}: lista de palavras em minúsculas, sem acento nem ponto`);
    }
  }

  if (!Array.isArray(data.agencies) || data.agencies.length === 0) errors.push('agencies: lista vazia ou ausente');
  else data.agencies.forEach((a, i) => {
    if (!isObj(a) || !isText(a.name)) errors.push(`agencies[${i}].name: vazio`);
    else if (typeof a.site !== 'string' || !HOST_RE.test(a.site.split('/')[0])) {
      errors.push(`agencies[${i}].site: use domínio com caminho opcional, sem http://`);
    }
  });
  return errors;
}

/* ---------- Fact Check: data/factchecks.json (gerado por automation/factchecks/fetch.js) ----------
 * { updatedAt: "ISO 8601",
 *   sources: [ { name, ok: true|false, count, error? } ],
 *   items: [ { title, link, source, date: "ISO 8601", rating, summary? } ] }   // mais recente primeiro
 */
const FC_RATINGS = ['FALSO', 'ENGANOSO', 'ANTIGO', 'FORA DE CONTEXTO', 'MONTAGEM', 'FEITO COM IA', 'GOLPE', 'VERDADEIRO', 'CHECAGEM'];

function validateFactChecks(data) {
  const errors = [];
  if (!isObj(data)) return ['o arquivo deve ser um objeto {}'];
  if (!isIso(data.updatedAt)) errors.push('updatedAt: use data e hora ISO 8601');
  if (data.sources !== undefined && !(Array.isArray(data.sources) && data.sources.every(s => isObj(s) && isText(s.name)))) {
    errors.push('sources: lista de { name, ok, count }');
  }
  if (!Array.isArray(data.items)) return errors.concat('items: deve ser uma lista []');
  const links = new Set();
  data.items.forEach((it, i) => {
    const p = `items[${i}]`;
    if (!isObj(it)) { errors.push(`${p}: deve ser um objeto`); return; }
    if (!isText(it.title, 5)) errors.push(`${p}.title: vazio`);
    if (typeof it.link !== 'string' || !/^https?:\/\/\S+$/.test(it.link)) errors.push(`${p}.link: URL inválida`);
    else if (links.has(it.link)) errors.push(`${p}.link: repetido`);
    links.add(it.link);
    if (!isText(it.source)) errors.push(`${p}.source: vazio`);
    if (!isIso(it.date)) errors.push(`${p}.date: use ISO 8601`);
    if (!FC_RATINGS.includes(it.rating)) errors.push(`${p}.rating: use ${FC_RATINGS.join(', ')}`);
    if (it.summary !== undefined && (typeof it.summary !== 'string' || it.summary.length > 400)) errors.push(`${p}.summary: texto de até 400 caracteres`);
    if (i > 0 && isIso(it.date) && isIso(data.items[i - 1].date) && data.items[i - 1].date < it.date) {
      errors.push(`${p}: fora de ordem (o mais recente deve vir primeiro)`);
    }
  });
  return errors;
}

/* ---------- Eventos: data/eventos.json (agenda presencial, editado à mão) ----------
 * { atualizadoEm?: "AAAA-MM-DD",
 *   eventos: [ {
 *     id: "2026-12-05-feira-x" (único; não mude depois de publicar, senão a 2B avisa de novo),
 *     titulo, data: "AAAA-MM-DD", fim?: "AAAA-MM-DD" (vários dias), hora?: "HH:MM", horaFim?: "HH:MM",
 *     local: "nome do lugar e endereço", cidade?, uf?: "SP" | ... ,
 *     papel?: "Palestra" | "Estande" | ... (o que vou fazer lá), descricao?, link?: "https://..." } ] }
 * A ordem não importa: o site e a 2B ordenam pela data.
 */
function validateEventos(data) {
  const errors = [];
  if (!isObj(data)) return ['o arquivo deve ser um objeto {}'];
  if (data.atualizadoEm !== undefined && !isDate(data.atualizadoEm)) errors.push('atualizadoEm: use AAAA-MM-DD');
  if (!Array.isArray(data.eventos)) return errors.concat('eventos: deve ser uma lista []');
  const ids = new Set();
  data.eventos.forEach((e, i) => {
    const p = `eventos[${i}]`;
    if (!isObj(e)) { errors.push(`${p}: deve ser um objeto`); return; }
    if (!isText(e.id) || !/^[a-z0-9-]+$/.test(e.id)) errors.push(`${p}.id: use só letras minúsculas, números e hífen`);
    else if (ids.has(e.id)) errors.push(`${p}.id: "${e.id}" repetido`);
    ids.add(e.id);
    if (!isText(e.titulo, 3)) errors.push(`${p}.titulo: vazio`);
    if (!isDate(e.data)) errors.push(`${p}.data: use AAAA-MM-DD`);
    if (e.fim !== undefined && (!isDate(e.fim) || (isDate(e.data) && e.fim < e.data))) errors.push(`${p}.fim: AAAA-MM-DD, igual ou depois de data`);
    if (e.hora !== undefined && !TIME_RE.test(e.hora)) errors.push(`${p}.hora: use HH:MM`);
    if (e.horaFim !== undefined && !TIME_RE.test(e.horaFim)) errors.push(`${p}.horaFim: use HH:MM`);
    if (!isText(e.local, 3)) errors.push(`${p}.local: vazio`);
    if (e.cidade !== undefined && !isText(e.cidade)) errors.push(`${p}.cidade: vazio`);
    if (e.uf !== undefined && !UFS.includes(e.uf)) errors.push(`${p}.uf: sigla de estado (SP, RJ...)`);
    for (const k of ['papel', 'descricao']) if (e[k] !== undefined && typeof e[k] !== 'string') errors.push(`${p}.${k}: deve ser texto`);
    if (e.descricao && e.descricao.length > 1000) errors.push(`${p}.descricao: longa demais (máx. 1000 caracteres)`);
    if (e.link !== undefined && !/^https?:\/\/\S+$/.test(e.link)) errors.push(`${p}.link: use https://...`);
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
  'data/organize.json': validateOrganize,
  'data/factcheck.json': validateFactCheck,
  'data/factchecks.json': validateFactChecks,
  'data/eventos.json': validateEventos
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { validateW4K3, validateMotivacao, validateOrganize, validateFactCheck, validateFactChecks, validateEventos, addEntry, FEEDS };
}
