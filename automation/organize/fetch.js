#!/usr/bin/env node
/* Organize-se: busca diária de atos e manifestações de esquerda e de movimentos populares em cada estado.
 * Roda no GitHub Actions (.github/workflows/organize.yml), sem IA e sem o PC de casa.
 * Uso local: node automation/organize/fetch.js [--dry-run]
 *
 * Como funciona:
 *  1. Faz uma busca no Google Notícias (RSS) por estado e algumas buscas nacionais por movimentos.
 *  2. Fica só com manchetes que falam de ato/protesto E de uma pauta ou organização do campo popular
 *     (sindicatos, estudantes, sem-terra, sem-teto, feministas, antirracistas, contra o ajuste fiscal etc.),
 *     e descarta as da direita (bolsonaristas, anistia aos golpistas, "patriotas").
 *  3. Tira o estado, a cidade, a data e a hora da própria manchete. Quando não acha a data, o ato aparece
 *     como "data a confirmar" e a pessoa confere na fonte.
 *  4. Junta manchetes repetidas do mesmo ato (vários jornais) e guarda o que ainda não aconteceu.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { validateOrganize } = require('../validators.js');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'data', 'organize.json');
const DRY = process.argv.includes('--dry-run');
const UNDATED_DAYS = 10;   // convocação sem data fica 10 dias depois de publicada
const COVERAGE_DAYS = 3;   // notícia de ato que já está rolando fica 3 dias
const MAX_AHEAD_DAYS = 150;

/* ---------- Estados, cidades e lugares conhecidos ---------- */
// Cidades com nome ambíguo (Toledo, Paulista, Bonito, Palmas no PR etc.) ficam de fora de propósito.
const STATES = [
  ['AC', 'Acre', ['acreano', 'acreana'], ['Rio Branco', 'Cruzeiro do Sul']],
  ['AL', 'Alagoas', ['alagoano', 'alagoana'], ['Maceió', 'Arapiraca']],
  ['AP', 'Amapá', ['amapaense'], ['Macapá']],
  ['AM', 'Amazonas', ['amazonense'], ['Manaus', 'Parintins', 'Itacoatiara']],
  ['BA', 'Bahia', ['baiano', 'baiana'], ['Salvador', 'Feira de Santana', 'Vitória da Conquista', 'Camaçari', 'Ilhéus', 'Itabuna', 'Juazeiro']],
  ['CE', 'Ceará', ['cearense'], ['Fortaleza', 'Juazeiro do Norte', 'Sobral', 'Caucaia']],
  ['DF', 'Distrito Federal', ['brasiliense'], ['Brasília', 'Ceilândia', 'Taguatinga', 'Esplanada dos Ministérios', 'Praça dos Três Poderes']],
  ['ES', 'Espírito Santo', ['capixaba'], ['@Vitória', 'Vila Velha', 'Cariacica']],
  ['GO', 'Goiás', ['goiano', 'goiana'], ['Goiânia', 'Anápolis', 'Aparecida de Goiânia', 'Rio Verde']],
  ['MA', 'Maranhão', ['maranhense'], ['São Luís', 'Imperatriz']],
  ['MT', 'Mato Grosso', ['mato-grossense'], ['Cuiabá', 'Várzea Grande', 'Rondonópolis', 'Sinop']],
  ['MS', 'Mato Grosso do Sul', ['sul-mato-grossense'], ['Campo Grande', 'Dourados', 'Três Lagoas']],
  ['MG', 'Minas Gerais', ['mineiro', 'mineira'], ['Belo Horizonte', 'BH', 'Uberlândia', 'Contagem', 'Juiz de Fora', 'Betim', 'Montes Claros', 'Uberaba', 'Ipatinga', 'Governador Valadares']],
  ['PA', 'Pará', ['paraense'], ['Belém', 'Ananindeua', 'Santarém', 'Marabá']],
  ['PB', 'Paraíba', ['paraibano', 'paraibana'], ['João Pessoa', 'Campina Grande']],
  ['PR', 'Paraná', ['paranaense'], ['Curitiba', 'Londrina', 'Maringá', 'Ponta Grossa', 'Cascavel', 'Foz do Iguaçu']],
  ['PE', 'Pernambuco', ['pernambucano', 'pernambucana'], ['Recife', 'Olinda', 'Caruaru', 'Petrolina', 'Jaboatão']],
  ['PI', 'Piauí', ['piauiense'], ['Teresina', 'Parnaíba']],
  ['RJ', 'Rio de Janeiro', ['carioca', 'fluminense'], ['Niterói', 'Duque de Caxias', 'Nova Iguaçu', 'São Gonçalo', 'Petrópolis', 'Volta Redonda', 'Campos dos Goytacazes', 'Cinelândia', 'Candelária', 'Alerj']],
  ['RN', 'Rio Grande do Norte', ['potiguar'], ['@Natal', 'Mossoró']],
  ['RS', 'Rio Grande do Sul', ['gaúcho', 'gaúcha'], ['Porto Alegre', 'Caxias do Sul', 'Pelotas', 'Canoas', 'Santa Maria', 'Esquina Democrática']],
  ['RO', 'Rondônia', ['rondoniense'], ['Porto Velho', 'Ji-Paraná']],
  ['RR', 'Roraima', ['roraimense'], ['Boa Vista']],
  ['SC', 'Santa Catarina', ['catarinense'], ['Florianópolis', 'Joinville', 'Blumenau', 'Chapecó', 'Criciúma', 'Itajaí']],
  ['SP', 'São Paulo', ['paulista', 'paulistano', 'paulistana'], ['Campinas', 'Guarulhos', 'Santos', 'São Bernardo', 'Santo André', 'Osasco', 'Ribeirão Preto', 'Sorocaba', 'São José dos Campos', 'Jundiaí', 'Bauru', 'Piracicaba', 'Faria Lima', 'Avenida Paulista', 'Masp', 'Praça da Sé', 'Alesp', 'ABC paulista']],
  ['SE', 'Sergipe', ['sergipano', 'sergipana'], ['Aracaju']],
  ['TO', 'Tocantins', ['tocantinense'], ['@Palmas', 'Araguaína']]
].map(([uf, nome, gentilicos, cidades]) => ({ uf, nome, gentilicos, cidades }));

// Cidade que é o nome do estado: "São Paulo", "Rio de Janeiro" contam como capital.
const CAPITAL_SAME_NAME = { SP: 'São Paulo', RJ: 'Rio de Janeiro' };
// Lugares que não são cidade: entram no texto como local, a cidade é a capital.
const LANDMARK_CITY = {
  'Esplanada dos Ministérios': 'Brasília', 'Praça dos Três Poderes': 'Brasília',
  Cinelândia: 'Rio de Janeiro', Candelária: 'Rio de Janeiro', Alerj: 'Rio de Janeiro',
  'Esquina Democrática': 'Porto Alegre',
  'Faria Lima': 'São Paulo', 'Avenida Paulista': 'São Paulo', Masp: 'São Paulo', 'Praça da Sé': 'São Paulo', Alesp: 'São Paulo', 'ABC paulista': 'São Bernardo',
  BH: 'Belo Horizonte'
};
// Nome de estado que sem acento vira palavra comum ("Pará" -> "para"): só vale com acento e maiúscula.
const STATE_EXACT = { PA: /(^|[^A-Za-zÀ-ú])Pará($|[^A-Za-zÀ-ú])/ };
// Sindicatos e entidades cujo nome já diz o estado
const ORG_STATE = [
  [/(^|[^a-z])cpers($|[^a-z])/, 'RS'], [/(^|[^a-z])apeoesp($|[^a-z])/, 'SP'], [/(^|[^a-z])sepe($|[^a-z])/, 'RJ'],
  [/(^|[^a-z])sind-?ute($|[^a-z])/, 'MG'], [/(^|[^a-z])app-?sindicato($|[^a-z])/, 'PR'], [/(^|[^a-z])sismuc($|[^a-z])/, 'PR', 'Curitiba'],
  [/(^|[^a-z])sindimetro[- ]?rs($|[^a-z])/, 'RS'], [/(^|[^a-z])sindimetro[- ]?sp($|[^a-z])/, 'SP'], [/(^|[^a-z])sinte[- ]?sc($|[^a-z])/, 'SC'],
  [/(^|[^a-z])sintep[- ]?pb($|[^a-z])/, 'PB'], [/(^|[^a-z])sintepe($|[^a-z])/, 'PE'], [/(^|[^a-z])apeoc($|[^a-z])/, 'CE'], [/(^|[^a-z])aplb($|[^a-z])/, 'BA']
];

/* ---------- Texto ---------- */
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’' };
function decode(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] || m)
    .replace(/\s+/g, ' ')
    .trim();
}
/** minúsculas e sem acento, para comparar */
function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function wordRe(s, flags = '') { return new RegExp(`(^|[^a-z0-9])${escapeRe(norm(s))}($|[^a-z0-9])`, flags); }

/* ---------- Filtros de pauta ---------- */
const PROTEST_RE = /(^|[^a-z])(atos?|manifestac(ao|oes)|protestos?|protestam|protestar|marchas?|passeatas?|dia (nacional )?de mobilizacao|mobilizacao nacional|panfletac[oa]s?|vigilias?|caminhada|dia (nacional )?de luta|greve geral|carreata|tuitaco|aulao publico|ocupam as ruas|vao as ruas|vai as ruas|tomam as ruas)($|[^a-z])/;

// campo popular / esquerda: organizações, categorias e pautas
const LEFT_RE = new RegExp('(^|[^a-z])(' + [
  'mst', 'mtst', 'mab', 'mpa', 'une', 'ubes', 'anpg', 'cut', 'ctb', 'intersindical', 'conlutas', 'csp-conlutas', 'forca sindical', 'ugt',
  'sind(?!icancia|ico|ica$)[a-z0-9-]*', 'sint[a-z]*-[a-z]{2}', 'apeoesp', 'cpers', 'andes', 'fasubra', 'fenaj', 'contraf', 'fup', 'petroleiros',
  'frente brasil popular', 'povo sem medo', 'levante popular', 'marcha mundial das mulheres', 'coalizao negra', 'uneafro', 'mnu', 'apib', 'cimi',
  'movimentos? sociais', 'movimentos? popular(es)?', 'movimento negro', 'movimento estudantil', 'centrais sindicais', 'central sindical', 'sindicatos?', 'sindicalistas?',
  'psol', 'pt', 'pcdob', 'pco', 'pstu', 'pcb', 'up', 'unidade popular', 'rede sustentabilidade', 'juventude',
  'servidor(es|as)?', 'professor(es|as)?', 'educador(es|as)', 'trabalhador(es|as)?', 'operarios?', 'metalurgicos?', 'bancarios?', 'metroviarios?', 'rodoviarios?', 'garis', 'enfermeir[oa]s', 'enfermagem', 'medicos', 'entregador(es)?', 'motoboys?', 'aplicativo', 'terceirizad[oa]s', 'aposentad[oa]s', 'categoria',
  'estudantes', 'estudantil', 'universitarios', 'secundaristas', 'reitoria',
  'sem-terra', 'sem terra', 'sem-teto', 'sem teto', 'moradia', 'despejos?', 'reforma agraria', 'acampad[oa]s', 'assentad[oa]s', 'quilombolas?', 'indigenas?', 'povos originarios', 'marco temporal', 'terra indigena',
  'feminist[ae]s?', 'mulheres', 'feminicidio', 'violencia contra a mulher', '8m', 'aborto legal', 'lgbt[a-z+]*', 'parada', 'transfobia', 'homofobia', 'antirracist[ae]s?', 'racismo', 'vidas negras', 'consciencia negra', 'zumbi', 'marielle',
  'violencia policial', 'chacina', 'letalidade policial', 'genocidio', 'palestin[ao]s?', 'gaza', 'imperialismo',
  'ajuste fiscal', 'arcabouco', 'taxacao', 'super-ricos', 'super ricos', 'juros altos', 'juros', 'banco central', 'privatizac(ao|oes)', 'privatista', 'contra a privatizacao', 'terceirizacao', 'reforma administrativa', 'reforma da previdencia', 'escala 6x1', '6x1', 'fim da escala', 'piso salarial', 'reajuste', 'salario minimo', 'tarifa zero', 'passe livre', 'aumento da passagem', 'sus', 'saude publica', 'educacao publica', 'escola publica', 'universidade publica', 'cortes na educacao',
  'sem anistia', 'contra a anistia', 'democracia', 'golpistas', 'fora [a-z]+', 'contra o fascismo', 'antifascist[ae]s?',
  'clima', 'climatic[ao]', 'ambientalistas?', 'desmatamento', 'agrotoxicos', 'mineradora', 'atingidos'
].join('|') + ')($|[^a-z])');

// direita / fora do escopo
const RIGHT_RE = new RegExp('(^|[^a-z])(' + [
  'bolsonarist[ae]s?', 'pro-bolsonaro', 'pro bolsonaro', 'apoiadores de bolsonaro', 'em apoio a bolsonaro', 'a favor de bolsonaro', 'em defesa de bolsonaro', 'liberdade para bolsonaro',
  'direitistas?', 'de direita', 'patriotas?', 'conservador(es|as)?', 'intervencao militar', 'mbl', 'vem pra rua', 'nikolas', 'malafaia', 'marcha para jesus', 'marcha pela vida', 'pro-vida', 'contra o aborto',
  'anistia ampla', 'pela anistia', 'a favor da anistia', 'em defesa da anistia', 'impeachment de lula', 'fora lula', 'contra o stf', 'contra moraes', 'fora moraes', 'agronegocio', 'ruralistas', 'caminhoneiros bloqueiam'
].join('|') + ')($|[^a-z])');

// notícia de outro país (o Google mistura Portugal, Argentina...)
const ABROAD_RE = /(^|[^a-z])(portugal|portugues(es)?|lisboa|coimbra|braga|sines|argentina|buenos aires|milei|espanha|madri|franca|paris|eua|estados unidos|nova york|trump|londres|alemanha|berlim|italia|roma|chile|santiago|colombia|bogota|mexico|venezuela|caracas|angola|mocambique|israel|tel aviv)($|[^a-z])/;
const ABROAD_SOURCE_RE = /\.(pt|es|ar|ao|mz|cv|uy|cl|co|mx|fr|it|de|uk)(\/|$)/i;
// tem que ser ato acontecendo/marcado, não análise de ato antigo
const OLD_RE = /(^|[^a-z])(ha (um|dois|tres|\d+) anos?|anos depois|aniversario do|relembr|memoria d[oa]|historia d[oa]|em \d{4}|ditadura militar|1964|1968|2013|jornadas de junho)($|[^a-z])/;

// "manifestação" no sentido de parecer jurídico ou de opinião
const NOT_ACT_RE = /(^|[^a-z])(pede manifestac|manifestac(ao|oes) d[aoe]s? (pgr|agu|congresso|governo|stf|ministerio|mp|defesa|camara|senado|tribunal|tcu|presidente|ministro)|manifesta (solidariedade|apoio|preocupacao|repudio)|ato (normativo|administrativo|institucional|de posse|declaratorio)|ato infracional|ato libidinoso|atos? de vandalismo|ato falho)($|[^a-z])/;

const FUTURE_RE = /(^|[^a-z])(convoc[a-z]*|marca(m|do|da|dos|das)?|agenda(m|do|da)?|programad[oa]s?|prepara(m)?|promete(m)?|planeja(m)?|chama(m)?|organiza(m)?|vao (realizar|fazer|ocupar|as ruas)|vai (realizar|fazer|ocupar|as ruas)|fara(o)?|realizara(o)?|acontece(ra)?|ocorre(ra)?|neste|nesta|amanha|proxim[oa]|para (o )?dia|dia \d{1,2}|convite|chamado|chamada)($|[^a-z])/;

/* ---------- Local ---------- */
const STATE_MATCHERS = STATES.map(s => {
  const place = [];
  for (const c of s.cidades) {
    if (c[0] === '@') { // nome que também é palavra comum: só "em Natal", "em Vitória", com maiúscula
      const name = c.slice(1);
      place.push({ re: new RegExp(`(^|[^A-Za-zÀ-ú])(em|de|da|na) ${escapeRe(name)}($|[^A-Za-zÀ-ú])`), city: name, exact: true });
    } else place.push({ re: wordRe(c), city: LANDMARK_CITY[c] || c });
  }
  if (CAPITAL_SAME_NAME[s.uf]) place.push({ re: wordRe(CAPITAL_SAME_NAME[s.uf]), city: CAPITAL_SAME_NAME[s.uf] });
  return {
    uf: s.uf,
    place,
    state: [STATE_EXACT[s.uf] ? null : wordRe(s.nome), ...s.gentilicos.map(g => wordRe(g)), new RegExp(`(^|[-\\s(/])${s.uf}($|[\\s)/,.;:])`)]
  };
});
// "Rio Grande do Norte" contém "Rio Grande"; "Mato Grosso do Sul" contém "Mato Grosso": o mais longo vence.
const STATE_PRIORITY = ['MS', 'RN', 'RS'];
// "Avenida Paulista" não deve contar também o gentílico "paulista" como outro lugar; "Juazeiro do Norte" x "Juazeiro" (BA)

/**
 * Descobre o estado e a cidade pela manchete (e pelo nome do veículo, ex.: "Sindjus-DF", "Sul 21").
 * Devolve { uf, cidade } ou { uf: 'BR' } para ato nacional, ou null se não achou.
 */
function findPlace(title, sourceName = '') {
  const t = norm(title);
  const src = String(sourceName || '');
  const hits = new Map(); // uf -> { score, cidade }
  const add = (uf, score, cidade) => {
    const h = hits.get(uf) || { score: 0, cidade: null };
    h.score += score;
    if (cidade && !h.cidade) h.cidade = cidade;
    hits.set(uf, h);
  };
  // nomes de cidade mais longos primeiro, para "Juazeiro do Norte" (CE) vencer "Juazeiro" (BA)
  const placeHits = [];
  for (const m of STATE_MATCHERS) for (const p of m.place) {
    const mm = (p.exact ? title : t).match(p.re);
    if (mm) placeHits.push({ uf: m.uf, city: p.city, len: p.re.source.length, idx: mm.index });
  }
  placeHits.sort((a, b) => b.len - a.len);
  const used = [];
  for (const h of placeHits) {
    const hc = norm(h.city);
    if (used.some(u => u.includes(hc) || hc.includes(u))) continue; // "Juazeiro" dentro de "Juazeiro do Norte"
    used.push(hc);
    add(h.uf, 3, h.city);
  }
  for (const m of STATE_MATCHERS) {
    if (m.state.slice(0, -1).some(re => re && re.test(t))) add(m.uf, 2);
    if (STATE_EXACT[m.uf] && STATE_EXACT[m.uf].test(title)) add(m.uf, 2);
    // sigla em maiúscula na manchete, ou no nome de um sindicato que é a fonte ("Sindjus-DF")
    const sigla = m.state[m.state.length - 1];
    if (sigla.test(title) || (/^(sind|sint|apeo|cpers|app)/i.test(src) && sigla.test(src))) add(m.uf, 2);
  }
  // "ato no Rio" = Rio de Janeiro (mas não "Rio Grande", "Rio Branco", rio de verdade)
  if (/(^|[^a-z])(no|do|ao|pelo) rio($|[^a-z])/.test(t) && !/(^|[^a-z])(no|do|ao|pelo) rio (grande|branco|verde|negro|sao francisco|tiete|doce|pinheiros|madeira|xingu|amazonas|tapajos|parana|guaiba|capibaribe)/.test(t)) add('RJ', 3, 'Rio de Janeiro');
  for (const [re, uf, cidade] of ORG_STATE) if (re.test(t) || re.test(norm(src))) add(uf, 2, cidade);
  if (/(^|[^a-z])sul ?21($|[^a-z])/.test(norm(src))) add('RS', 1);
  // prioridade de nomes compostos
  for (const uf of STATE_PRIORITY) {
    if (!hits.has(uf)) continue;
    if (uf === 'MS') hits.delete('MT');
    if (uf === 'RN' || uf === 'RS') { /* "Rio Grande" sozinho não é casado; nada a fazer */ }
  }
  // "Vitória da Conquista" (BA) contém "Vitória" (ES)
  if (hits.has('BA') && hits.get('BA').cidade === 'Vitória da Conquista' && hits.has('ES') && hits.get('ES').cidade === 'Vitória') hits.delete('ES');
  // "Aparecida de Goiânia" e "Goiânia" são do mesmo estado: ok. "Campina Grande" x "Campo Grande": nomes distintos.
  // "São Paulo" como cidade e "paulista": mesmo estado.
  if (hits.size === 1) {
    const [[uf, h]] = [...hits];
    return { uf, cidade: h.cidade || undefined };
  }
  if (hits.size > 1) {
    // duas ou mais cidades de estados diferentes: chamada nacional
    const withCity = [...hits].filter(([, h]) => h.cidade).map(([uf]) => uf);
    if (withCity.length >= 2) return { uf: 'BR', varios: withCity };
    const sorted = [...hits].sort((a, b) => b[1].score - a[1].score);
    // vários estados citados com o mesmo peso: chamada nacional ("atos em SP, RJ e BH")
    if (sorted[0][1].score === sorted[1][1].score) return { uf: 'BR', varios: sorted.map(([uf]) => uf) };
    return { uf: sorted[0][0], cidade: sorted[0][1].cidade || undefined };
  }
  if (/(^|[^a-z])(todo o pais|todo o brasil|pelo pais|pelo brasil|em (varias|diversas|dez|\d+) (cidades|capitais|estados)|nas capitais|nacional(mente)?|dia nacional|em brasilia e|do brasil inteiro|lula|governo federal|congresso|camara dos deputados|senado|stf)($|[^a-z])/.test(t)) {
    return { uf: 'BR' };
  }
  return null;
}

/* ---------- Data e hora ---------- */
const MONTHS = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const WEEKDAYS = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
const BRT_OFFSET = -3 * 3600000;

/** Data AAAA-MM-DD no horário de Brasília. */
function brDate(ms) { return new Date(ms + BRT_OFFSET).toISOString().slice(0, 10); }
function addDays(ymd, n) { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function ymd(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}
/** Escolhe o ano para dia/mês ficar perto da publicação (até 10 dias antes, até MAX_AHEAD_DAYS depois). */
function pickYear(day, month, pub) {
  const y = +pub.slice(0, 4);
  for (const yy of [y, y + 1, y - 1]) {
    const v = ymd(yy, month, day);
    if (!v) continue;
    const diff = (Date.parse(v) - Date.parse(pub)) / 86400000;
    if (diff >= -10 && diff <= MAX_AHEAD_DAYS) return v;
  }
  return null;
}
/** Dia do mês sem mês: o próximo dia com esse número a partir da publicação. */
function nextDayOfMonth(day, pub) {
  let [y, m] = pub.split('-').map(Number);
  for (let i = 0; i < 2; i++) {
    const v = ymd(y, m, day);
    if (v && v >= addDays(pub, -1)) return v;
    m++; if (m > 12) { m = 1; y++; }
  }
  return null;
}
function nextWeekday(wd, pub, allowToday = true) {
  for (let i = allowToday ? 0 : 1; i < 8; i++) {
    const v = addDays(pub, i);
    if (new Date(v + 'T12:00:00Z').getUTCDay() === wd) return v;
  }
  return null;
}

/**
 * Data e hora do ato a partir da manchete. pub = AAAA-MM-DD (data de publicação, horário de Brasília).
 * Devolve { data?, hora? }.
 */
function findWhen(title, pub) {
  const t = norm(title);
  const out = {};
  let m;
  // 18/11, 18/11/2026, (18/11)
  if ((m = t.match(/(^|[^\d/])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?($|[^\d/])/))) {
    const d = +m[2], mo = +m[3];
    if (mo >= 1 && mo <= 12) {
      if (m[4]) { const yy = +m[4] < 100 ? 2000 + +m[4] : +m[4]; out.data = ymd(yy, mo, d) || undefined; }
      else out.data = pickYear(d, mo, pub) || undefined;
    }
  }
  // 27 de novembro, dia 1º de dezembro
  if (!out.data && (m = t.match(new RegExp(`(^|[^\\d])(\\d{1,2})(?:o|º)?\\s+de\\s+(${MONTHS.join('|')})`)))) {
    out.data = pickYear(+m[2], MONTHS.indexOf(m[3]) + 1, pub) || undefined;
  }
  // nesta quarta-feira (18), sábado (22)
  if (!out.data && (m = t.match(/(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira)?,?\s*\(?(\d{1,2})\)/))) {
    out.data = nextDayOfMonth(+m[2], pub) || undefined;
  }
  // dia 20
  if (!out.data && (m = t.match(/(^|[^a-z])(?:no |para o |neste |nesse )?dia (\d{1,2})($|[^\d/])/))) {
    out.data = nextDayOfMonth(+m[2], pub) || undefined;
  }
  // neste sábado, na próxima sexta
  if (!out.data && (m = t.match(/(?:neste|nesta|nesse|nessa|este|esta|proximo|proxima|no|na)\s+(domingo|segunda|terca|quarta|quinta|sexta|sabado)/))) {
    const prox = /proxim/.test(m[0]);
    out.data = nextWeekday(WEEKDAYS[m[1]], pub, !prox) || undefined;
  }
  if (!out.data && /(^|[^a-z])amanha($|[^a-z])/.test(t)) out.data = addDays(pub, 1);
  if (!out.data && /(^|[^a-z])(hoje|nesta (manha|tarde|noite))($|[^a-z])/.test(t)) out.data = pub;
  // dia da Consciência Negra
  if (!out.data && /consciencia negra|dia de zumbi/.test(t) && /(^|[^a-z])(dia|neste|nesta|feriado)($|[^a-z])/.test(t)) {
    out.data = pickYear(20, 11, pub) || undefined;
  }
  // hora: 17h, 17h30, às 9h
  if ((m = t.match(/(^|[^\d])([01]?\d|2[0-3])h([0-5]\d)?($|[^a-z0-9])/))) {
    out.hora = String(m[2]).padStart(2, '0') + ':' + (m[3] || '00');
  }
  if (!out.data) delete out.data;
  return out;
}

/* ---------- RSS ---------- */
function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : '';
}

/** Lê o RSS do Google Notícias. A manchete vem como "Título - Veículo". */
function parseFeed(xml) {
  const items = [];
  for (const block of xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || []) {
    const raw = decode(tag(block, 'title'));
    const link = decode(tag(block, 'link'));
    const when = new Date(decode(tag(block, 'pubDate')));
    const srcM = block.match(/<source[^>]*url="([^"]*)"[^>]*>([\s\S]*?)<\/source>/i);
    const sourceName = srcM ? decode(srcM[2]) : '';
    const sourceUrl = srcM ? decode(srcM[1]) : '';
    let title = raw;
    if (sourceName && title.endsWith(' - ' + sourceName)) title = title.slice(0, -(sourceName.length + 3)).trim();
    if (!title || !/^https?:\/\//.test(link) || isNaN(when)) continue;
    items.push({ title, link, sourceName: sourceName || 'Google Notícias', sourceUrl, published: when.toISOString() });
  }
  return items;
}

/**
 * Transforma uma manchete num ato (ou null, se não for ato do campo popular no Brasil).
 * now = ms, para os testes.
 */
function toEvent(item, now = Date.now()) {
  const t = norm(item.title);
  if (!PROTEST_RE.test(t)) return null;
  if (!LEFT_RE.test(t)) return null;
  if (RIGHT_RE.test(t)) return null;
  if (ABROAD_RE.test(t) || ABROAD_SOURCE_RE.test(item.sourceUrl || '')) return null;
  if (OLD_RE.test(t)) return null;
  if (NOT_ACT_RE.test(t)) return null;
  const place = findPlace(item.title, item.sourceName);
  if (!place) return null;

  const pub = brDate(Date.parse(item.published));
  const today = brDate(now);
  const when = findWhen(item.title, pub);
  const future = FUTURE_RE.test(t) || (when.data && when.data > pub);
  const tipo = future ? 'convocacao' : 'cobertura';

  // fora do prazo
  if (when.data) {
    if (when.data < today) return null;
  } else if (tipo === 'convocacao') {
    if (addDays(pub, UNDATED_DAYS) < today) return null;
  } else if (addDays(pub, COVERAGE_DAYS) < today) return null;

  const ev = {
    id: crypto.createHash('sha1').update(item.link).digest('hex').slice(0, 12),
    titulo: item.title.length > 220 ? item.title.slice(0, 217).replace(/\s+\S*$/, '') + '…' : item.title,
    tipo,
    uf: place.uf,
    publicadoEm: item.published,
    fonte: { nome: item.sourceName, url: item.link }
  };
  if (place.cidade) ev.cidade = place.cidade;
  if (place.varios) ev.estados = place.varios;
  if (when.data) ev.data = when.data;
  if (when.hora) ev.hora = when.hora;
  return ev;
}

/* ---------- Juntar repetidos ---------- */
const STOP = new Set('a o as os de da do das dos e em no na nos nas para por com contra um uma que se ao aos sua seu neste nesta dia ato atos protesto protestos manifestacao manifestacoes convoca convocam marcha'.split(' '));
function tokens(s) { return new Set(norm(s).split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOP.has(w))); }
function similar(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / Math.min(A.size, B.size);
}
/** Mesma UF, mesma data (ou sem data) e manchetes parecidas = mesmo ato. Mantém a convocação mais antiga como principal. */
function mergeEvents(list) {
  const out = [];
  const sorted = [...list].sort((a, b) => (a.publicadoEm < b.publicadoEm ? -1 : 1));
  for (const ev of sorted) {
    const twin = out.find(o => o.uf === ev.uf && (o.data || '') === (ev.data || '') && (!o.cidade || !ev.cidade || o.cidade === ev.cidade) && similar(o.titulo, ev.titulo) >= 0.5);
    if (!twin) { out.push({ ...ev, outrasFontes: ev.outrasFontes ? [...ev.outrasFontes] : [] }); continue; }
    const urls = new Set([twin.fonte.url, ...twin.outrasFontes.map(f => f.url)]);
    for (const f of [ev.fonte, ...(ev.outrasFontes || [])]) if (!urls.has(f.url)) { twin.outrasFontes.push(f); urls.add(f.url); }
    if (!twin.cidade && ev.cidade) twin.cidade = ev.cidade;
    if (!twin.hora && ev.hora) twin.hora = ev.hora;
    if (ev.tipo === 'convocacao') twin.tipo = 'convocacao';
  }
  for (const o of out) {
    o.outrasFontes = o.outrasFontes.slice(0, 5);
    if (!o.outrasFontes.length) delete o.outrasFontes;
  }
  return out;
}

/* ---------- Buscas ---------- */
const PROTEST_Q = '(ato OR manifestação OR protesto OR marcha OR passeata OR mobilização)';
function queries() {
  const qs = STATES.map(s => ({ label: s.uf, q: `${PROTEST_Q} "${s.nome}" when:7d` }));
  qs.push(
    { label: 'convocações', q: `${PROTEST_Q} (convoca OR convocam OR "marcado para") when:7d` },
    { label: 'movimentos', q: `${PROTEST_Q} (MST OR MTST OR UNE OR CUT OR "movimentos sociais" OR "Frente Brasil Popular" OR "Povo Sem Medo") when:7d` },
    { label: 'sindicatos', q: `${PROTEST_Q} (sindicato OR servidores OR professores OR trabalhadores) when:7d` },
    { label: 'pautas', q: `${PROTEST_Q} (feminista OR antirracista OR indígenas OR LGBT OR Palestina OR moradia OR "6x1" OR "ajuste fiscal") when:7d` }
  );
  return qs;
}
function feedUrl(q) {
  return 'https://news.google.com/rss/search?q=' + encodeURIComponent(q) + '&hl=pt-BR&gl=BR&ceid=BR:pt-419';
}
async function getFeed(q) {
  const res = await fetch(feedUrl(q), {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; DEDSEC-Organize/1.0; leitor de RSS)', accept: 'application/rss+xml, application/xml, text/xml' },
    redirect: 'follow',
    signal: AbortSignal.timeout(30000)
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return parseFeed(await res.text());
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  let old = { eventos: [] };
  try { old = JSON.parse(fs.readFileSync(OUT, 'utf8').replace(/^﻿/, '')); } catch (e) { /* primeira vez */ }

  const fresh = [];
  const buscas = [];
  for (const { label, q } of queries()) {
    try {
      const items = await getFeed(q);
      const evs = items.map(it => toEvent(it)).filter(Boolean);
      fresh.push(...evs);
      buscas.push({ busca: label, ok: true, manchetes: items.length, atos: evs.length });
      console.log(`✓  ${label}: ${items.length} manchetes, ${evs.length} atos`);
    } catch (err) {
      buscas.push({ busca: label, ok: false, manchetes: 0, atos: 0 });
      console.log(`✗  ${label}: ${String(err && err.message || err).slice(0, 120)}`);
    }
    await sleep(1200); // educado com o Google
  }
  if (!buscas.some(b => b.ok)) { console.log('Nenhuma busca respondeu: mantendo o arquivo como está.'); process.exit(1); }

  // antigos que ainda valem (o Google só devolve 7 dias), passados de novo pelo filtro de prazo
  const now = Date.now();
  const today = brDate(now);
  const keepOld = (Array.isArray(old.eventos) ? old.eventos : []).filter(e => {
    if (!e || !e.fonte || !e.publicadoEm) return false;
    const pub = brDate(Date.parse(e.publicadoEm));
    if (e.data) return e.data >= today;
    return addDays(pub, e.tipo === 'convocacao' ? UNDATED_DAYS : COVERAGE_DAYS) >= today;
  });
  const byLink = new Map();
  for (const e of [...fresh, ...keepOld]) if (!byLink.has(e.fonte.url)) byLink.set(e.fonte.url, e);
  const eventos = mergeEvents([...byLink.values()]).sort((a, b) => {
    const da = a.data || '9999', db = b.data || '9999';
    if (da !== db) return da < db ? -1 : 1;
    return a.publicadoEm < b.publicadoEm ? 1 : -1;
  });

  const data = { updatedAt: new Date().toISOString(), buscas, eventos };
  const errors = validateOrganize(data);
  if (errors.length) { console.log('✗  arquivo inválido:\n   ' + errors.slice(0, 20).join('\n   ')); process.exit(1); }

  const porUf = {};
  for (const e of eventos) porUf[e.uf] = (porUf[e.uf] || 0) + 1;
  console.log(`\n${eventos.length} atos. Por estado: ${Object.entries(porUf).sort().map(([k, v]) => k + '=' + v).join(' ')}`);
  if (DRY) {
    for (const e of eventos) console.log(`   ${e.uf} ${e.cidade || '-'} | ${e.data || 'sem data'} ${e.hora || ''} | ${e.tipo} | ${e.titulo}`);
    console.log('--dry-run: arquivo não gravado.');
    return;
  }
  fs.writeFileSync(OUT, JSON.stringify(data, null, 1) + '\n');
  console.log('Gravado: data/organize.json');
}

if (require.main === module) main().catch(err => { console.error(err); process.exit(1); });
module.exports = { parseFeed, toEvent, findPlace, findWhen, mergeEvents, decode, norm };
