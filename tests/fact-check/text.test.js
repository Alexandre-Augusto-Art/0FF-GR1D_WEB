#!/usr/bin/env node
/* Testes da análise de mensagens e da base de checagens. Uso: node tests/fact-check/text.test.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const T = require('../../js/fact-check/text.js');
const L = require('../../js/fact-check/link.js');
const { parseFeed, cleanLink } = require('../../automation/factchecks/fetch.js');
const { validateFactChecks } = require('../../automation/validators.js');

const rules = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/factcheck.json'), 'utf8'));
const analyzeLink = u => L.analyze(u, rules);
let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log(`✓  ${name}`); }
  catch (err) { failed++; console.log(`✗  ${name}\n     ${err.message}`); }
}
const ids = r => r.signals.map(s => s.id);

check('corrente de saúde: espalhar, esconder, fonte sem nome, saúde', () => {
  const r = T.analyzeMessage('URGENTE!!! Meu primo que é médico confirmou: a vacina altera o DNA. A mídia não mostra! ' +
    'Compartilhe antes que apaguem!!! 🚨🚨', { analyzeLink });
  assert.strictEqual(r.verdict, 'warn');
  for (const id of ['spread', 'hidden', 'vague', 'health', 'tone']) assert.ok(ids(r).includes(id), `faltou ${id}: ${ids(r)}`);
});

check('golpe do Pix é ALERTA', () => {
  const r = T.analyzeMessage('Oi mãe, troquei de número. Preciso que você faça um pix de 850 reais pra mim hoje, depois te explico');
  assert.strictEqual(r.verdict, 'danger');
  assert.ok(ids(r).includes('scam'));
});

check('saque liberado + link vira ALERTA, e o link é analisado', () => {
  const r = T.analyzeMessage('Seu saque do FGTS foi liberado! Resgate em até 24h: https://caixa-fgts.online/resgatar', { analyzeLink });
  assert.strictEqual(r.verdict, 'danger');
  assert.ok(ids(r).includes('bait') && ids(r).includes('link'), ids(r).join(','));
  assert.strictEqual(r.links[0].result.verdict, 'danger');
});

check('mensagem normal não tem alerta', () => {
  const r = T.analyzeMessage('Pessoal, a reunião do condomínio foi remarcada para quinta às 19h no salão de festas.');
  assert.strictEqual(r.verdict, 'unknown');
  assert.deepStrictEqual(ids(r), ['none']);
});

check('texto curto demais dá erro amigável', () => assert.ok(!T.analyzeMessage('oi').ok));

check('acha vários links, com e sem https', () => {
  assert.deepStrictEqual(T.urls('veja https://bit.ly/abc e também g1.globo.com/x, ok?'), ['https://bit.ly/abc', 'g1.globo.com/x']);
});

check('assunto sai da primeira frase útil', () => {
  const s = T.subjectOf('URGENTE!!! Compartilhe!\nGoverno vai confiscar a poupança de todos os brasileiros em dezembro. Repassem');
  assert.ok(/confiscar poupan/.test(s), s);
});

check('veredito pelo título da checagem', () => {
  const cases = [
    ['É falso que vacina contra covid altera o DNA', 'FALSO'],
    ['É #FAKE vídeo de homem que pede para voltar ao Brasil', 'FALSO'],
    ['Capa da revista chamando Moro de juiz ladrão é falsa', 'FALSO'],
    ['Vídeos que mostram descarte de tomates não são recentes', 'ANTIGO'],
    ['Vídeo que mostra Bolsonaro deixando hospital não é de novembro de 2026', 'ANTIGO'],
    ['É de 2016 vídeo sobre cobrança de valores de aposentados pelo INSS', 'ANTIGO'],
    ['Imagem de Lula com papa foi gerada por IA', 'FEITO COM IA'],
    ['Vídeo mostra fila para Fórmula 1, não saída de brasileiros do Paraguai', 'FORA DE CONTEXTO'],
    ['Comportamento de gráfico dos votos não indica fraude na eleição', 'ENGANOSO'],
    ['Site falso oferece Pix de R$ 500 em nome da Caixa; é golpe', 'GOLPE'],
    ['É #FATO: Foto mostra papa segurando carne em churrasco no Uruguai', 'VERDADEIRO'],
    ['O vídeo do cachorro lambendo um churrasquinho é real?', 'CHECAGEM'],
    ['Voto distrital misto: entenda a proposta', 'CHECAGEM']
  ];
  for (const [title, want] of cases) assert.strictEqual(T.ratingOf(title), want, title);
});

check('acha a checagem certa para uma mensagem', () => {
  const items = [
    { title: 'É falso que vacina contra covid altera o DNA humano', link: 'https://a/1', source: 'X', date: '2026-11-01T00:00:00Z', rating: 'FALSO' },
    { title: 'Vídeo de tornado foi gravado em 2024 nos EUA, não em Chapecó', link: 'https://a/2', source: 'X', date: '2026-11-01T00:00:00Z', rating: 'ANTIGO' },
    { title: 'Governo não vai confiscar a poupança em dezembro', link: 'https://a/3', source: 'X', date: '2026-11-01T00:00:00Z', rating: 'FALSO' },
    { title: 'Enem não excluiu matemática da prova', link: 'https://a/4', source: 'X', date: '2026-11-01T00:00:00Z', rating: 'FALSO' }
  ];
  const m = T.matchFactchecks('Atenção!!! O governo vai confiscar as poupanças de todo mundo no mês de dezembro. Saque já!', items);
  assert.strictEqual(m[0].item.link, 'https://a/3', JSON.stringify(m.map(x => [x.item.link, x.score])));
  assert.ok(T.matchFactchecks('vacinas mudam o nosso DNA', items)[0].item.link === 'https://a/1');
  assert.strictEqual(T.matchFactchecks('receita de bolo de cenoura com cobertura', items).length, 0);
});

check('leitor de RSS: CDATA, entidades, utm e idioma', () => {
  const xml = `<rss><channel>
    <item><title><![CDATA[É falso que &quot;chip&quot; está na vacina]]></title>
      <link>https://www.boatos.org/saude/chip.html?utm_source=rss&amp;utm_medium=feed</link>
      <pubDate>Mon, 16 Nov 2026 10:00:00 -0300</pubDate><description>&lt;p&gt;Texto &amp;amp; mais&lt;/p&gt;</description></item>
    <item><title>It is false that the vaccine has a chip</title><link>https://www.boatos.org/en/chip.html</link>
      <pubDate>Mon, 16 Nov 2026 10:00:00 -0300</pubDate></item>
    <item><title>Es falso que una vacuna tenga un chip</title><link>https://www.boatos.org/es/chip.html</link>
      <pubDate>Mon, 16 Nov 2026 10:00:00 -0300</pubDate></item>
  </channel></rss>`;
  const items = parseFeed(xml, 'Boatos.org');
  assert.strictEqual(items.length, 1, items.map(i => i.title).join(' | '));
  assert.strictEqual(items[0].title, 'É falso que "chip" está na vacina');
  assert.strictEqual(items[0].link, 'https://www.boatos.org/saude/chip.html');
  assert.strictEqual(items[0].rating, 'FALSO');
  assert.strictEqual(items[0].date, '2026-11-16T13:00:00.000Z');
  assert.strictEqual(cleanLink('https://x.org/a/?fbclid=1#top'), 'https://x.org/a');
});

check('data/factchecks.json do repositório é válido', () => {
  const f = path.join(__dirname, '../../data/factchecks.json');
  if (!fs.existsSync(f)) return;
  assert.deepStrictEqual(validateFactChecks(JSON.parse(fs.readFileSync(f, 'utf8'))), []);
});

console.log(`\n${passed} ok, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
