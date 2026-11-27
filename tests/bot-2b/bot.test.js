#!/usr/bin/env node
/* Testes da 2B: escolhas de cada pessoa, o que vira aviso e o texto. Uso: node tests/bot-2b/bot.test.js */
const assert = require('assert');
const { emptyState, handleUpdate, collect, deliveryOutcome, forget } = require('../../automation/bot-2b/core.js');
const { MAX_LEN, esc } = require('../../automation/bot-2b/messages.js');

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log(`✓  ${name}`); }
  catch (err) { failed++; console.log(`✗  ${name}\n     ${err.message}`); }
}
const NOW = Date.parse('2026-11-17T12:00:00-03:00');
const refl = id => ({ id, date: id, news: { title: 'Notícia', link: 'https://x.com/n', source: 'Nexo' }, reflection: { title: `Título <${id}>`, excerpt: 'Resumo & mais' } });
const ato = (id, extra = {}) => ({ id, titulo: `Ato ${id}.`, tipo: 'convocacao', uf: 'SP', cidade: 'São Paulo', data: '2026-11-18', publicadoEm: '2026-11-17T10:00:00Z', fonte: { nome: 'J', url: 'https://j.com/' + id }, ...extra });
const fc = n => ({ title: `Checagem ${n}.`, link: `https://agencia.com/${n}`, source: 'Lupa', date: `2026-11-17T${String(n % 24).padStart(2, '0')}:00:00Z`, rating: 'FALSO' });

const ev = (id, extra = {}) => ({ id, titulo: `Evento ${id}`, data: '2026-11-25', hora: '19:00', local: 'Casa <X>', cidade: 'São Paulo', uf: 'SP', papel: 'Palestra', ...extra });
const evs = list => ({ eventos: list });
const say = (text, id = 10, type = 'private') => ({ update_id: 1, message: { text, chat: { id, type } } });
const tap = (data, id = 10, type = 'private') => ({ update_id: 1, callback_query: { id: 'q', data, message: { message_id: 5, chat: { id, type } } } });
const withSubs = (subs, seen) => ({ ...emptyState(), subs, seen });
const keys = calls => calls.at(-1).params.reply_markup.inline_keyboard.flat();

// ---------- escolhas ----------
check('/start mostra o menu e não guarda nada', () => {
  const s = emptyState();
  const calls = handleUpdate(s, say('/start site'));
  assert.strictEqual(calls[0].method, 'sendMessage');
  assert.deepStrictEqual(keys(calls).map(k => k.callback_data), ['t:w4k3', 't:motivacao', 't:organize', 't:factchecks', 't:eventos']);
  assert.ok(keys(calls).every(k => k.text.startsWith('⬜')));
  assert.deepStrictEqual(s.subs, {});
});
check('tocar liga e desliga; sem nenhum aviso a pessoa é apagada', () => {
  const s = emptyState();
  const calls = handleUpdate(s, tap('t:w4k3'));
  assert.deepStrictEqual(calls.map(c => c.method), ['answerCallbackQuery', 'editMessageText']);
  assert.ok(keys(calls)[0].text.startsWith('✅'));
  assert.deepStrictEqual(s.subs, { 10: { topics: ['w4k3'], ufs: [] } });
  handleUpdate(s, tap('t:w4k3'));
  assert.deepStrictEqual(s.subs, {});
});
check('Organize-se abre a escolha de estados', () => {
  const s = emptyState();
  assert.ok(keys(handleUpdate(s, tap('t:organize'))).some(k => k.callback_data === 'ufs' && k.text.includes('todos')));
  assert.strictEqual(keys(handleUpdate(s, tap('ufs'))).filter(k => /^u:[A-Z]{2}$/.test(k.callback_data)).length, 27);
  handleUpdate(s, tap('u:SP'));
  handleUpdate(s, tap('u:RJ'));
  assert.deepStrictEqual(s.subs[10].ufs, ['SP', 'RJ']);
  handleUpdate(s, tap('u:*'));
  assert.deepStrictEqual(s.subs[10].ufs, []);
  handleUpdate(s, tap('u:SP'));
  handleUpdate(s, tap('t:organize'));
  assert.deepStrictEqual(s.subs, {});
});
check('escolhas inválidas não mudam nada', () => {
  const s = emptyState();
  for (const d of ['t:nada', 't:constructor', 't:__proto__', 'u:SP', 'u:XX', 'ufs', '', 'x:y:z']) handleUpdate(s, tap(d));
  assert.deepStrictEqual(s.subs, {});
});
check('cada pessoa tem as suas escolhas', () => {
  const s = emptyState();
  handleUpdate(s, tap('t:w4k3', 1));
  handleUpdate(s, tap('t:factchecks', 2));
  assert.deepStrictEqual([s.subs[1].topics, s.subs[2].topics], [['w4k3'], ['factchecks']]);
});
check('/parar apaga a pessoa e os avisos que ainda não saíram', () => {
  const s = withSubs({ 10: { topics: ['w4k3'], ufs: [] }, 11: { topics: ['w4k3'], ufs: [] } }, {});
  s.outbox = [{ chat: '10', feed: 'w4k3', text: 'a' }, { chat: '11', feed: 'w4k3', text: 'b' }];
  handleUpdate(s, say('/parar'));
  assert.deepStrictEqual(Object.keys(s.subs), ['11']);
  assert.deepStrictEqual(s.outbox.map(m => m.chat), ['11']);
});
check('desligar um aviso tira da fila só ele', () => {
  const s = withSubs({ 10: { topics: ['w4k3', 'motivacao'], ufs: [] } }, {});
  s.outbox = [{ chat: '10', feed: 'w4k3', text: 'a' }, { chat: '10', feed: 'motivacao', text: 'b' }];
  handleUpdate(s, tap('t:w4k3'));
  assert.deepStrictEqual(s.outbox.map(m => m.feed), ['motivacao']);
});
check('em grupo a 2B não responde nem guarda', () => {
  const s = emptyState();
  assert.deepStrictEqual(handleUpdate(s, say('/start', -5, 'group')), []);
  assert.deepStrictEqual(handleUpdate(s, tap('t:w4k3', -5, 'supergroup')).map(c => c.method), ['answerCallbackQuery']);
  assert.deepStrictEqual(s.subs, {});
});

// ---------- novidades ----------
check('primeira vez de um feed: só marca', () => {
  const s = withSubs({ 1: { topics: ['w4k3'], ufs: [] } }, {});
  assert.strictEqual(collect(s, { w4k3: [refl('2026-11-16')] }, NOW), 0);
  assert.deepStrictEqual(s.seen.w4k3, ['2026-11-16']);
});
check('só recebe quem ligou aquele aviso, uma vez só', () => {
  const s = withSubs({ 1: { topics: ['w4k3'], ufs: [] }, 2: { topics: ['motivacao'], ufs: [] } }, { w4k3: ['2026-11-16'] });
  const d = { w4k3: [refl('2026-11-17'), refl('2026-11-16')] };
  assert.strictEqual(collect(s, d, NOW), 1);
  assert.strictEqual(s.outbox[0].chat, '1');
  assert.ok(s.outbox[0].text.includes('Título &lt;2026-11-17&gt;') && s.outbox[0].text.includes('Resumo &amp; mais'));
  assert.strictEqual(collect(s, d, NOW), 0);
});
check('feed fora do ar, vazio ou estragado não reenvia tudo depois', () => {
  const s = withSubs({ 1: { topics: ['w4k3'], ufs: [] } }, { w4k3: ['2026-11-16'] });
  for (const bad of [undefined, null, [], {}, 'x', [null]]) collect(s, { w4k3: bad }, NOW);
  assert.strictEqual(collect(s, { w4k3: [refl('2026-11-16')] }, NOW), 0);
});
check('W4K3 acumulado: só os 3 mais recentes', () => {
  const s = withSubs({ 1: { topics: ['w4k3'], ufs: [] } }, { w4k3: ['x'] });
  collect(s, { w4k3: ['2026-11-12', '2026-11-15', '2026-11-13', '2026-11-14'].map(refl) }, NOW);
  assert.deepStrictEqual(s.outbox.map(m => /· (\d\d)\/11/.exec(m.text)[1]), ['13', '14', '15']);
});
check('Motivação: frase e autor', () => {
  const s = withSubs({ 1: { topics: ['motivacao'], ufs: [] } }, { motivacao: ['x'] });
  collect(s, { motivacao: [{ date: '2026-11-17', content: 'Frase', author: 'Autor', bankId: 'a' }] }, NOW);
  assert.ok(s.outbox[0].text.includes('“Frase”') && s.outbox[0].text.includes('— Autor'));
});
check('Organize-se: só convocação que ainda vai acontecer', () => {
  const s = withSubs({ 1: { topics: ['organize'], ufs: [] } }, { organize: ['x'] });
  collect(s, { organize: { eventos: [ato('a'), ato('c', { tipo: 'cobertura' }), ato('d', { data: '2026-11-16' }), ato('e', { data: undefined })] } }, NOW);
  assert.strictEqual(s.outbox.length, 1);
  const t = s.outbox[0].text;
  assert.ok(t.includes('2 atos convocados') && t.includes('Ato a.') && t.includes('Ato e.') && t.includes('data na fonte'));
  assert.ok(!t.includes('Ato c.') && !t.includes('Ato d.'));
});
check('Organize-se: cada um recebe os seus estados, e os nacionais', () => {
  const s = withSubs({ 1: { topics: ['organize'], ufs: ['RJ'] }, 2: { topics: ['organize'], ufs: ['AC'] }, 3: { topics: ['organize'], ufs: [] } }, { organize: ['x'] });
  collect(s, { organize: { eventos: [ato('sp'), ato('rj', { uf: 'RJ' }), ato('varios', { uf: 'BR', cidade: undefined, estados: ['RJ', 'MG'] })] } }, NOW);
  assert.deepStrictEqual(s.outbox.map(m => m.chat), ['1', '3']);      // AC não tem nada hoje
  assert.ok(!s.outbox[0].text.includes('Ato sp.') && s.outbox[0].text.includes('Ato rj.') && s.outbox[0].text.includes('<b>NACIONAL</b>'));
  assert.ok(s.outbox[1].text.includes('3 atos'));
  collect(s, { organize: { eventos: [ato('br', { uf: 'BR', cidade: undefined })] } }, NOW);
  assert.strictEqual(s.outbox.filter(m => m.text.includes('Ato br.')).length, 3);
});
check('Organize-se: 60 atos no mesmo estado cabem no limite, sem perder nenhum', () => {
  const s = withSubs({ 1: { topics: ['organize'], ufs: [] } }, { organize: ['x'] });
  const eventos = [];
  for (let i = 0; i < 60; i++) eventos.push(ato('n' + i, { titulo: `T${i}. ` + 'longo '.repeat(40), fonte: { url: 'https://news.google.com/' + 'x'.repeat(400) } }));
  collect(s, { organize: { eventos } }, NOW);
  for (const m of s.outbox) assert.ok(m.text.length <= MAX_LEN, `${m.text.length} caracteres`);
  for (let i = 0; i < 60; i++) assert.strictEqual(s.outbox.filter(m => m.text.includes(`>T${i}. `)).length, 1);
});
check('Fact Check: resumo com as 10 mais recentes', () => {
  const s = withSubs({ 1: { topics: ['factchecks'], ufs: [] } }, { factchecks: ['x'] });
  collect(s, { factchecks: { items: Array.from({ length: 14 }, (_, i) => fc(i + 1)) } }, NOW);
  assert.strictEqual(s.outbox.length, 1);
  const t = s.outbox[0].text;
  assert.ok(t.includes('14 checagens novas') && t.includes('+ 4 no site') && !t.includes('Checagem 4.'));
  assert.ok(t.indexOf('Checagem 14.') < t.indexOf('Checagem 13.'), 'mais recente primeiro');
});

check('Eventos: agenda vazia no começo, o primeiro evento já é avisado', () => {
  const s = withSubs({ 1: { topics: ['eventos'], ufs: [] } }, {});
  assert.strictEqual(collect(s, { eventos: evs([]) }, NOW), 0);
  assert.deepStrictEqual(s.seen.eventos, []);
  assert.strictEqual(collect(s, { eventos: evs([ev('a')]) }, NOW), 1);
  const t = s.outbox[0].text;
  assert.ok(t.includes('EVENTO NOVO') && t.includes('Evento a') && t.includes('qua 25/11 · 19:00') && t.includes('Casa &lt;X&gt; · São Paulo/SP') && t.includes('🎤 Palestra'), t);
  assert.strictEqual(collect(s, { eventos: evs([ev('a')]) }, NOW), 0);
});
check('Eventos: evento que já passou não vira aviso', () => {
  const s = withSubs({ 1: { topics: ['eventos'], ufs: [] } }, { eventos: [] });
  assert.strictEqual(collect(s, { eventos: evs([ev('velho', { data: '2026-11-10' }), ev('longo', { data: '2026-11-15', fim: '2026-11-18' })]) }, NOW), 1);
  assert.ok(s.outbox[0].text.includes('Evento longo') && s.outbox[0].text.includes('15/11 a 18/11'));
});
check('Eventos: lembrete na véspera, uma vez só', () => {
  const s = withSubs({ 1: { topics: ['eventos'], ufs: [] } }, { eventos: [] });
  const d = { eventos: evs([ev('a', { data: '2026-11-20' })]) };
  collect(s, d, NOW);
  assert.strictEqual(s.outbox.length, 1);
  assert.strictEqual(collect(s, d, Date.parse('2026-11-19T09:00:00-03:00')), 1);
  assert.ok(s.outbox[1].text.includes('EVENTO AMANHÃ'));
  assert.strictEqual(collect(s, d, Date.parse('2026-11-20T09:00:00-03:00')), 0, 'no dia não repete');
});
check('Eventos: PC desligado na véspera, lembrete sai no dia', () => {
  const s = withSubs({ 1: { topics: ['eventos'], ufs: [] } }, { eventos: ['a'] });
  assert.strictEqual(collect(s, { eventos: evs([ev('a', { data: '2026-11-17' })]) }, NOW), 1);
  assert.ok(s.outbox[0].text.includes('EVENTO HOJE'));
});
check('Eventos: novo para amanhã manda só um aviso', () => {
  const s = withSubs({ 1: { topics: ['eventos'], ufs: [] } }, { eventos: [] });
  assert.strictEqual(collect(s, { eventos: evs([ev('b', { data: '2026-11-18' })]) }, NOW), 1);
  assert.ok(s.outbox[0].text.includes('EVENTO NOVO'));
  assert.strictEqual(collect(s, { eventos: evs([ev('b', { data: '2026-11-18' })]) }, NOW), 0);
});

// ---------- entrega ----------
check('resposta do Telegram', () => {
  assert.strictEqual(deliveryOutcome(200, { ok: true }), 'sent');
  assert.strictEqual(deliveryOutcome(403, { description: 'Forbidden: bot was blocked by the user' }), 'gone');
  assert.strictEqual(deliveryOutcome(400, { description: 'Bad Request: chat not found' }), 'gone');
  assert.strictEqual(deliveryOutcome(400, { description: "Bad Request: can't parse entities" }), 'drop');
  assert.strictEqual(deliveryOutcome(401, {}), 'auth');
  assert.strictEqual(deliveryOutcome(429, { parameters: { retry_after: 5 } }), 'wait');
  assert.strictEqual(deliveryOutcome(502, {}), 'wait');
});
check('quem bloqueou o bot é apagado', () => {
  const s = withSubs({ 1: { topics: ['w4k3'], ufs: [] } }, {});
  s.outbox = [{ chat: '1', feed: 'w4k3' }];
  forget(s, '1');
  assert.deepStrictEqual([s.subs, s.outbox], [{}, []]);
});
check('esc: aspas e sinais', () => assert.strictEqual(esc('a<b>&"c"'), 'a&lt;b&gt;&amp;&quot;c&quot;'));

console.log(`\n${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
