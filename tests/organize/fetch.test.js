#!/usr/bin/env node
/* Testes do coletor do Organize-se (local, data, filtro de pauta). Uso: node tests/organize/fetch.test.js */
const assert = require('assert');
const { findPlace, findWhen, toEvent, mergeEvents, parseFeed } = require('../../automation/organize/fetch.js');
const { validateOrganize } = require('../../automation/validators.js');

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log(`✓  ${name}`); }
  catch (err) { failed++; console.log(`✗  ${name}\n     ${err.message}`); }
}
const NOW = Date.parse('2026-11-17T12:00:00-03:00');
const item = (title, extra = {}) => ({ title, link: 'https://news.google.com/rss/articles/' + encodeURIComponent(title), sourceName: 'Jornal', sourceUrl: 'https://jornal.com.br', published: '2026-11-16T15:00:00Z', ...extra });

check('local: capital, sigla, lugar conhecido', () => {
  assert.deepStrictEqual(findPlace('Movimentos convocam manifestação em BH contra ajuste fiscal'), { uf: 'MG', cidade: 'Belo Horizonte' });
  assert.deepStrictEqual(findPlace('UNE marca ato na Faria Lima'), { uf: 'SP', cidade: 'São Paulo' });
  assert.deepStrictEqual(findPlace('No Recife (PE), estudantes protestam'), { uf: 'PE', cidade: 'Recife' });
  assert.deepStrictEqual(findPlace('Estudantes chamam ato no Rio nesta terça'), { uf: 'RJ', cidade: 'Rio de Janeiro' });
  assert.strictEqual(findPlace('Sindimetrô RS convoca ato').uf, 'RS');
});
check('local: palavra comum não vira estado', () => {
  assert.strictEqual(findPlace('UNE marca ato para terça (17)'), null);                       // "para" não é Pará
  assert.strictEqual(findPlace('PT prepara militância para transformar vitória em mobilização'), null); // "vitória" não é Vitória (ES)
  assert.strictEqual(findPlace('Protesto no Pará reúne indígenas').uf, 'PA');
  assert.strictEqual(findPlace('Ato em Natal contra a escala 6x1').uf, 'RN');
  assert.strictEqual(findPlace('Ato no rio Tietê denuncia poluição'), null);
});
check('local: sindicato na fonte e nacional', () => {
  assert.strictEqual(findPlace('SINDJUS convoca categoria para novo ato', 'Sindjus-DF').uf, 'DF');
  assert.strictEqual(findPlace('UNE realiza atos em 13 cidades contra ajuste fiscal').uf, 'BR');
  assert.strictEqual(findPlace('Atos em São Paulo e no Rio contra a 6x1').uf, 'BR');
});
check('data: formatos da manchete', () => {
  assert.deepStrictEqual(findWhen('novo ato nesta quarta-feira (18/11)', '2026-11-17'), { data: '2026-11-18' });
  assert.deepStrictEqual(findWhen('Marcha ocupa o centro nesta sexta (20)', '2026-11-17'), { data: '2026-11-20' });
  assert.deepStrictEqual(findWhen('manifestação em Toledo no dia 27 de novembro', '2026-11-11'), { data: '2026-11-27' });
  assert.deepStrictEqual(findWhen('ato neste sábado às 15h', '2026-11-17'), { data: '2026-11-21', hora: '15:00' });
  assert.deepStrictEqual(findWhen('ato amanhã às 9h30', '2026-11-17'), { data: '2026-11-18', hora: '09:30' });
  assert.deepStrictEqual(findWhen('ato marcado para 10 de janeiro', '2026-12-20'), { data: '2027-01-10' });
  assert.deepStrictEqual(findWhen('UNE convoca atos contra ajuste fiscal', '2026-11-17'), {});
});
check('filtro: ato de esquerda entra, direita e fora do Brasil saem', () => {
  const ok = toEvent(item('UNE convoca protesto na Faria Lima contra juros altos neste sábado'), NOW);
  assert.ok(ok);
  assert.strictEqual(ok.uf, 'SP');
  assert.strictEqual(ok.tipo, 'convocacao');
  assert.strictEqual(ok.data, '2026-11-21');
  assert.strictEqual(toEvent(item('Bolsonaristas convocam ato na Paulista pela anistia'), NOW), null);
  assert.strictEqual(toEvent(item('Movimento convoca manifestação pela habitação em Lisboa'), NOW), null);
  assert.strictEqual(toEvent(item('Sindicato convoca ato em Curitiba', { sourceUrl: 'https://sapo.pt' }), NOW), null);
  assert.strictEqual(toEvent(item('Dino pede manifestação de Congresso e PGR sobre escala 6x1'), NOW), null);
  assert.strictEqual(toEvent(item('Uso de centro cultural gera protesto e sindicância no Maranhão'), NOW), null);
  assert.strictEqual(toEvent(item('SEC prepara pontos de mobilização aos estudantes do Enem na Bahia'), NOW), null);
});
check('prazo: ato que já passou sai, convocação sem data dura 10 dias', () => {
  assert.strictEqual(toEvent(item('Professores fazem ato em Salvador nesta segunda (16)'), NOW), null);
  assert.ok(toEvent(item('MST convoca marcha em Goiânia', { published: '2026-11-10T12:00:00Z' }), NOW));
  assert.strictEqual(toEvent(item('MST convoca marcha em Goiânia', { published: '2026-11-01T12:00:00Z' }), NOW), null);
});
check('repetidos do mesmo ato viram um só, com as outras fontes', () => {
  const a = toEvent(item('UNE convoca protesto na Faria Lima contra juros altos neste sábado'), NOW);
  const b = toEvent(item('UNE marca protesto na Faria Lima contra juros altos neste sábado', { sourceName: 'Outro', published: '2026-11-16T18:00:00Z' }), NOW);
  const m = mergeEvents([a, b]);
  assert.strictEqual(m.length, 1);
  assert.strictEqual(m[0].outrasFontes.length, 1);
});
check('RSS do Google: tira o veículo do fim da manchete', () => {
  const xml = '<rss><channel><item><title>UNE convoca ato em BH - Brasil de Fato</title><link>https://news.google.com/rss/articles/abc</link>' +
    '<pubDate>Mon, 16 Nov 2026 12:00:00 GMT</pubDate><source url="https://www.brasildefato.com.br">Brasil de Fato</source></item></channel></rss>';
  const [it] = parseFeed(xml);
  assert.strictEqual(it.title, 'UNE convoca ato em BH');
  assert.strictEqual(it.sourceName, 'Brasil de Fato');
});
check('validador aceita o formato e recusa UF errada', () => {
  const ev = toEvent(item('UNE convoca protesto em Fortaleza amanhã'), NOW);
  assert.deepStrictEqual(validateOrganize({ updatedAt: new Date(NOW).toISOString(), eventos: [ev] }), []);
  assert.ok(validateOrganize({ updatedAt: new Date(NOW).toISOString(), eventos: [{ ...ev, uf: 'XX' }] }).length);
});

console.log(`\n${passed} ok, ${failed} falhou`);
process.exit(failed ? 1 : 0);
