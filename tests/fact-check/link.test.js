#!/usr/bin/env node
/* Testes da análise de links do Fact Check. Uso: node tests/fact-check/link.test.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const L = require('../../js/fact-check/link.js');

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/factcheck.json'), 'utf8'));
let passed = 0, failed = 0;

function check(name, fn) {
  try { fn(); passed++; console.log(`✓  ${name}`); }
  catch (err) { failed++; console.log(`✗  ${name}\n     ${err.message}`); }
}
const run = input => L.analyze(input, cfg);
const titles = r => r.signals.map(s => s.title);
const has = (r, prefix) => titles(r).some(t => t.startsWith(prefix));

// Verdito por caso: [entrada, verdito esperado, sinal esperado (opcional)]
const cases = [
  ['https://g1.globo.com/politica/noticia/2026/11/17/governo-anuncia-novo-programa.ghtml', 'ok', 'SITE OFICIAL'],
  ['folha.uol.com.br/mercado/2026/11/dolar-cai.shtml', 'ok', 'SITE OFICIAL'],
  ['https://www.gov.br/saude/pt-br', 'ok', 'SITE OFICIAL'],
  ['https://www.nasa.gov/news', 'unknown', 'SITE DESCONHECIDO'],
  ['https://g1-globo.com/noticia/urgente', 'warn', 'USA O NOME DE G1'],
  ['https://g1obo.com/noticia', 'danger', 'IMITA G1'],
  ['https://nubank.com/pix', 'danger', 'IMITA NUBANK'],
  ['https://caixa-auxilio.online/resgatar', 'danger', 'USA O NOME DE CAIXA'],
  ['https://govbr-regularizar.com/cpf', 'danger', 'USA O NOME DE GOVERNO FEDERAL'],
  ['https://estadaoo.com.br/x', 'danger', 'IMITA ESTADÃO'],
  ['https://metropolles.com/x', 'danger', 'IMITA METRÓPOLES'],
  ['https://baixa-receitas.com.br/bolo', 'unknown', 'SITE DESCONHECIDO'],
  ['https://serra.com.br', 'unknown', 'SITE DESCONHECIDO'],
  ['https://bit.ly/3abcXYZ', 'warn', 'LINK ENCURTADO'],
  ['http://exemplo.com.br/noticia', 'warn', 'SEM CADEADO'],
  ['https://g1.globo.com@golpe.xyz/noticia', 'danger', 'ENDEREÇO DISFARÇADO'],
  ['http://192.168.0.10/login', 'danger', 'SEM NOME DE SITE'],
  ['https://xn--nbank-kva.com.br', 'danger', 'LETRAS DISFARÇADAS'],
  ['https://atualiza-app.com/whatsapp.apk', 'danger', 'BAIXA UM ARQUIVO .APK'],
  ['https://www.youtube.com/watch?v=abc', 'unknown', 'REDE SOCIAL'],
  ['https://a.b.c.d.exemplo.com/', 'warn', 'ENDEREÇO COMPRIDO'],
  ['https://premio-123456.top/', 'warn', 'FINAL ".TOP"']
];

for (const [input, verdict, signal] of cases) {
  check(`${input} -> ${verdict}`, () => {
    const r = run(input);
    assert.ok(r.ok, r.error);
    assert.strictEqual(r.verdict, verdict, `verdito ${r.verdict}; sinais: ${titles(r).join(' | ')}`);
    if (signal) assert.ok(has(r, signal), `faltou "${signal}"; sinais: ${titles(r).join(' | ')}`);
  });
}

check('acha o link no meio de uma mensagem do WhatsApp', () => {
  const r = run('URGENTE!!! veja antes que apaguem: https://bit.ly/xyz123. Compartilhe!');
  assert.strictEqual(r.url.href, 'https://bit.ly/xyz123');
});

check('aceita link sem https://', () => assert.strictEqual(run('www.estadao.com.br/politica').host, 'www.estadao.com.br'));

check('texto sem link dá erro amigável', () => assert.ok(!run('isso é verdade?').ok));

check('mostra o domínio de verdade', () => {
  const p = L.splitHost('noticias.uol.com.br');
  assert.deepStrictEqual([p.domain, p.label, p.suffix, p.sub], ['uol.com.br', 'uol', 'com.br', 'noticias']);
});

check('punycode vira letras legíveis', () => assert.strictEqual(L.hostToUnicode('xn--nbank-kva.com.br'), 'nübank.com.br'));

check('tira o assunto do endereço', () => {
  const r = run('https://g1.globo.com/politica/noticia/2026/11/17/governo-anuncia-novo-programa.ghtml');
  assert.strictEqual(r.query, 'governo anuncia novo programa');
});

check('links de consulta levam o domínio .br ao Registro.br', () => {
  const links = L.investigateLinks(run('https://exemplo.com.br/a'));
  assert.ok(links[0].href.startsWith('https://registro.br/'));
});

console.log(`\n${passed} ok, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
