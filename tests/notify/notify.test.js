#!/usr/bin/env node
/* Testes dos avisos da 2B no Telegram (o que é novo, o que vira mensagem, tamanho). Uso: node tests/notify/notify.test.js */
const assert = require('assert');
const { plan, markSent, esc, MAX_LEN } = require('../../automation/notify.js');

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log(`✓  ${name}`); }
  catch (err) { failed++; console.log(`✗  ${name}\n     ${err.message}`); }
}
const NOW = Date.parse('2026-11-17T12:00:00-03:00');
const refl = id => ({ id, date: id, news: { title: 'Notícia', link: 'https://x.com/n', source: 'Nexo' }, reflection: { title: `Título <${id}>`, excerpt: 'Resumo & mais' } });
const ato = (id, extra = {}) => ({ id, titulo: `Ato ${id}`, tipo: 'convocacao', uf: 'SP', cidade: 'São Paulo', data: '2026-11-18', publicadoEm: '2026-11-17T10:00:00Z', fonte: { nome: 'J', url: 'https://j.com/' + id }, ...extra });
const fc = (n, extra = {}) => ({ title: `Checagem ${n}`, link: `https://agencia.com/${n}`, source: 'Lupa', date: `2026-11-17T${String(n % 24).padStart(2, '0')}:00:00Z`, rating: 'FALSO', ...extra });

check('primeira vez: marca tudo e não manda nada', () => {
  const r = plan({ w4k3: [refl('2026-11-16')], factchecks: { items: [fc(1), fc(2)] } }, {}, NOW);
  assert.strictEqual(r.messages.length, 0);
  assert.deepStrictEqual(r.state.w4k3, ['2026-11-16']);
  assert.strictEqual(r.state.factchecks.length, 2);
  assert.deepStrictEqual(r.seeded.sort(), ['factchecks', 'w4k3']);
});

check('W4K3: só a reflexão nova vira mensagem, com HTML escapado', () => {
  const r = plan({ w4k3: [refl('2026-11-17'), refl('2026-11-16')] }, { w4k3: ['2026-11-16'] }, NOW);
  assert.strictEqual(r.messages.length, 1);
  const m = r.messages[0];
  assert.deepStrictEqual(m.ids, ['2026-11-17']);
  assert.ok(m.text.includes('Título &lt;2026-11-17&gt;'));
  assert.ok(m.text.includes('Resumo &amp; mais'));
  assert.ok(m.text.includes('#w4k3'));
  assert.ok(!m.text.includes('\n\n\n'), 'sem linhas em branco duplas');
});

check('estado só é atualizado com o que foi enviado', () => {
  const r = plan({ w4k3: [refl('2026-11-17'), refl('2026-11-16')] }, { w4k3: ['2026-11-16'] }, NOW);
  assert.deepStrictEqual(r.state.w4k3, ['2026-11-16']);        // falhou o envio: continua de fora
  markSent(r.state, r.messages[0]);
  assert.deepStrictEqual(r.state.w4k3, ['2026-11-16', '2026-11-17']);
  const again = plan({ w4k3: [refl('2026-11-17'), refl('2026-11-16')] }, r.state, NOW);
  assert.strictEqual(again.messages.length, 0);
});

check('estado esquece o que saiu do feed', () => {
  const r = plan({ w4k3: [refl('2026-11-17')] }, { w4k3: ['2026-11-10', '2026-11-17'] }, NOW);
  assert.deepStrictEqual(r.state.w4k3, ['2026-11-17']);
});

check('feed que não carregou mantém o estado', () => {
  const r = plan({ w4k3: undefined }, { w4k3: ['a'] }, NOW);
  assert.deepStrictEqual(r.state.w4k3, ['a']);
});

check('Motivação: id por data + frase', () => {
  const r = plan({ motivacao: [{ date: '2026-11-17', content: 'Frase', author: 'Autor', bankId: 'x' }] }, { motivacao: [] }, NOW);
  assert.strictEqual(r.messages.length, 1);
  assert.deepStrictEqual(r.messages[0].ids, ['2026-11-17:x']);
  assert.ok(r.messages[0].text.includes('“Frase”'));
});

check('Organize-se: só convocação futura, uma mensagem agrupada por estado', () => {
  const eventos = [
    ato('a'), ato('b', { uf: 'RJ', cidade: 'Rio de Janeiro' }),
    ato('c', { tipo: 'cobertura' }), ato('d', { data: '2026-11-16' }), ato('e', { data: undefined }),
  ];
  const r = plan({ organize: { eventos } }, { organize: [] }, NOW);
  assert.strictEqual(r.messages.length, 1);
  const m = r.messages[0];
  assert.deepStrictEqual(m.ids.sort(), ['a', 'b', 'e']);
  assert.ok(m.text.includes('3 atos convocados'));
  assert.ok(m.text.indexOf('<b>RJ</b>') < m.text.indexOf('<b>SP</b>'));
  assert.ok(m.text.includes('#organize #RJ #SP'));
  assert.ok(m.text.includes('data na fonte'));
  // cobertura e ato passado já entram no estado para não voltarem depois
  assert.ok(r.state.organize.includes('c') && r.state.organize.includes('d'));
});

check('Organize-se: ato nacional aparece como NACIONAL', () => {
  const r = plan({ organize: { eventos: [ato('n', { uf: 'BR', cidade: undefined, estados: ['SP', 'RJ'] })] } }, { organize: [] }, NOW);
  const m = r.messages[0];
  assert.ok(m.text.includes('<b>NACIONAL</b>'));
  assert.ok(m.text.includes('SP, RJ · '));
  assert.ok(m.text.includes('#organize #nacional'));
});

check('Organize-se: muitos atos viram várias mensagens dentro do limite, sem perder nenhum', () => {
  const ufs = ['AC', 'BA', 'CE', 'DF', 'MG', 'PE', 'PR', 'RJ', 'RS', 'SP'];
  const eventos = [];
  for (let i = 0; i < 80; i++) eventos.push(ato('id' + i, { uf: ufs[i % ufs.length], titulo: 'Convocação muito longa '.repeat(8) + i }));
  const r = plan({ organize: { eventos } }, { organize: [] }, NOW);
  assert.ok(r.messages.length > 1);
  for (const m of r.messages) assert.ok(m.text.length <= MAX_LEN, `mensagem com ${m.text.length} caracteres`);
  assert.strictEqual(r.messages.flatMap(m => m.ids).length, 80);
});

check('Fact Check: um resumo com as 10 mais recentes, marcando todas', () => {
  const items = [];
  for (let i = 1; i <= 14; i++) items.push(fc(i));
  const r = plan({ factchecks: { items } }, { factchecks: [] }, NOW);
  assert.strictEqual(r.messages.length, 1);
  const m = r.messages[0];
  assert.strictEqual(m.ids.length, 14);
  assert.ok(m.text.includes('14 checagens novas'));
  assert.ok(m.text.includes('+ 4 no site'));
  assert.ok(m.text.indexOf('Checagem 14') < m.text.indexOf('Checagem 13'), 'mais recente primeiro');
  assert.ok(!m.text.includes('Checagem 4<'), 'as antigas ficam de fora da lista');
});

check('Fact Check: uma só usa singular', () => {
  const r = plan({ factchecks: { items: [fc(1)] } }, { factchecks: [] }, NOW);
  assert.ok(r.messages[0].text.includes('1 checagem nova'));
});

check('esc: aspas e sinais', () => {
  assert.strictEqual(esc('a<b>&"c"'), 'a&lt;b&gt;&amp;&quot;c&quot;');
});

console.log(`\n${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
