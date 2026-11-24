#!/usr/bin/env node
/* Roda o bot.js de verdade contra um Telegram e um site de mentira, neste computador. Uso: node tests/bot-2b/run.test.js */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const BOT = path.join(__dirname, '../../automation/bot-2b/bot.js');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), '2b-'));
const TOKEN = '123:token-de-teste';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, what) {
  for (let i = 0; i < 100; i++) { if (fn()) return; await sleep(100); }
  throw new Error('não aconteceu: ' + what);
}

let updates = [], reflections = [{ id: 'a', date: '2026-11-16', reflection: { title: 'Velha', excerpt: 'x' } }];
const calls = [];
const refuse = new Set();       // conversas que "bloquearam" o bot
let limited = 1;                // o primeiro envio de aviso leva um 429
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', async () => {
    const reply = (status, obj) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.url.startsWith('/site/data/reflections.json')) return reply(200, reflections);
    if (req.url.startsWith('/site/')) return reply(404, {});
    const method = req.url.split('/').pop();
    const params = JSON.parse(body);
    if (method === 'getUpdates') {
      const list = updates.filter(u => u.update_id >= params.offset);
      if (!list.length) await sleep(150);
      return reply(200, { ok: true, result: list });
    }
    if (method === 'sendMessage' && params.text.includes('W4K3 PR0T0C0L ·')) {
      if (limited-- > 0) return reply(429, { ok: false, parameters: { retry_after: 1 } });
      if (refuse.has(params.chat_id)) return reply(403, { ok: false, description: 'Forbidden: bot was blocked by the user' });
    }
    calls.push({ method, ...params });
    reply(200, { ok: true, result: {} });
  });
});
const tap = (id, chat, data) => ({ update_id: id, callback_query: { id: String(id), data, message: { message_id: 1, chat: { id: chat, type: 'private' } } } });
const state = () => JSON.parse(fs.readFileSync(path.join(DIR, 'state.json'), 'utf8'));
const avisos = () => calls.filter(c => c.method === 'sendMessage' && c.text.includes('W4K3 PR0T0C0L ·'));

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  fs.writeFileSync(path.join(DIR, 'config.json'), '﻿' + JSON.stringify({ token: TOKEN }));
  const env = { ...process.env, BOT_2B_DIR: DIR, BOT_2B_API: url, BOT_2B_SITE: url + '/site/', BOT_2B_EVERY_MS: '300' };
  const start = () => spawn(process.execPath, [BOT], { env, stdio: 'pipe' });
  let bot = start();
  let code = 0;
  try {
    updates = [tap(1, 100, 't:w4k3'), tap(2, 200, 't:w4k3'), tap(3, 300, 't:motivacao')];
    await until(() => fs.existsSync(path.join(DIR, 'state.json')) && Object.keys(state().subs).length === 3 && state().seen.w4k3, 'três assinantes');
    assert.strictEqual(avisos().length, 0, 'o que já estava no site não é avisado');
    console.log('✓  escolhas gravadas, conteúdo antigo não avisado');

    const second = start();
    const out = await new Promise(r => { let s = ''; second.stdout.on('data', d => { s += d; }); second.on('exit', c => r(`${c} ${s}`)); });
    assert.ok(out.startsWith('0 A 2B já está rodando'), out);
    console.log('✓  o segundo bot sai sozinho');

    refuse.add('200');
    reflections = [{ id: 'b', date: '2026-11-17', reflection: { title: 'Nova', excerpt: 'x' } }, ...reflections];
    await until(() => avisos().length === 1 && !state().outbox.length, 'aviso entregue depois do 429');
    assert.strictEqual(avisos()[0].chat_id, '100');
    assert.deepStrictEqual(Object.keys(state().subs), ['100', '300'], 'quem bloqueou foi apagado');
    console.log('✓  aviso só para quem ligou, repete depois do 429, apaga quem bloqueou');

    bot.kill(); await new Promise(r => bot.on('exit', r));
    bot = start();
    await sleep(1500);
    assert.strictEqual(avisos().length, 1, 'reiniciar não repete o aviso');
    assert.deepStrictEqual(Object.keys(state().subs), ['100', '300'], 'reiniciar não aplica os toques de novo');
    console.log('✓  reiniciar não repete nada');

    const log = fs.readFileSync(path.join(DIR, 'bot.log'), 'utf8');
    assert.ok(!log.includes(TOKEN) && !/\b(100|200|300)\b/.test(log.replace(/^\S+/gm, '')), 'log sem token nem conversas');
    console.log('✓  log sem token nem número de conversa');
  } catch (err) {
    code = 1;
    console.log(`✗  ${err.message}`);
    try { console.log(fs.readFileSync(path.join(DIR, 'bot.log'), 'utf8')); } catch { /* sem log */ }
  }
  bot.kill();
  await sleep(200);
  server.close();
  fs.rmSync(DIR, { recursive: true, force: true });
  process.exit(code);
})();
