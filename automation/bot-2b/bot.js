#!/usr/bin/env node
/* 2B - bot do Telegram que avisa quando sai conteúdo novo no site. Cada pessoa escolhe os avisos na conversa.
 *
 * Roda neste PC por long polling (sem IP público nem webhook), como o bot do W4K3. Instalação: install.ps1.
 * Lê os feeds do site publicado a cada 5 min e manda no privado de quem ligou aquele assunto.
 * Com o PC dormindo, as mensagens das pessoas esperam no Telegram (até 24 h) e os avisos saem quando ele voltar.
 *
 * Arquivos em %USERPROFILE%\.w4k3\2b (fora do repositório, que é público):
 *   config.json  { token }     state.json  assinantes e avisos já feitos     bot.log
 *
 * Uso: node bot.js            roda o bot
 *      node bot.js --preview  mostra como ficam os avisos com o conteúdo de hoje, sem enviar nem gravar nada
 */
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { FEEDS, SITE } = require('./messages.js');
const { emptyState, handleUpdate, collect, deliveryOutcome, forget } = require('./core.js');

// As variáveis BOT_2B_* só existem para os testes (tests/bot-2b/run.test.js).
const DIR = process.env.BOT_2B_DIR || path.join(os.homedir(), '.w4k3', '2b');
const API = process.env.BOT_2B_API || 'https://api.telegram.org';
const DATA = process.env.BOT_2B_SITE || SITE;
const FEED_EVERY = Number(process.env.BOT_2B_EVERY_MS) || 5 * 60e3;
const STATE = path.join(DIR, 'state.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));

// O log não leva número de conversa, texto das pessoas nem o token.
let token = '';
function log(text) {
  const line = `${new Date().toISOString()} ${token ? String(text).split(token).join('***') : text}`;
  console.log(line);
  const file = path.join(DIR, 'bot.log');
  try {
    if (fs.existsSync(file) && fs.statSync(file).size > 1e6) fs.renameSync(file, file + '.old');
    fs.appendFileSync(file, line + '\n');
  } catch { /* sem log é melhor que sem bot */ }
}

// Arquivo de estado estragado derruba o bot: melhor que recomeçar do zero e perder os assinantes.
const loadState = () => (fs.existsSync(STATE) ? { ...emptyState(), ...readJson(STATE) } : emptyState());
function saveState(state) {
  fs.writeFileSync(STATE + '.tmp', JSON.stringify(state));
  fs.renameSync(STATE + '.tmp', STATE);
}

async function fetchFeeds() {
  const datas = {};
  await Promise.all(Object.entries(FEEDS).map(async ([key, feed]) => {
    try {
      const res = await fetch(`${DATA}${feed.file}?t=${Date.now()}`, { signal: AbortSignal.timeout(30e3) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      datas[key] = JSON.parse((await res.text()).replace(/^﻿/, ''));
    } catch (err) { log(`feed ${key}: ${err.message}`); }
  }));
  return datas;
}

async function call(method, params, timeout = 30e3) {
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(timeout),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function listen(state) {
  for (;;) {
    try {
      const { status, json } = await call('getUpdates', { offset: state.offset, timeout: 50, allowed_updates: ['message', 'callback_query'] }, 70e3);
      if (!json.ok) {
        log(`getUpdates ${status}: ${json.description || ''}`);
        await sleep((json.parameters?.retry_after || (status === 409 ? 30 : 10)) * 1000);
        continue;
      }
      for (const u of json.result) {
        state.offset = u.update_id + 1;
        let calls = [];
        try { calls = handleUpdate(state, u); } catch (err) { log(`atualização: ${err.message}`); }
        saveState(state);       // antes de responder: uma queda aqui não aplica a mesma escolha duas vezes
        for (const c of calls) {
          try {
            const r = await call(c.method, c.params);
            if (!r.json.ok && !/not modified|query is too old/.test(r.json.description || '')) log(`${c.method} ${r.status}: ${r.json.description || ''}`);
          } catch (err) { log(`${c.method}: ${err.message}`); }
        }
      }
    } catch (err) {
      log(`getUpdates: ${err.message}`);
      await sleep(10e3);
    }
  }
}

async function deliver(state) {
  while (state.outbox.length) {
    const m = state.outbox[0];
    let wait = 0;
    try {
      const { status, json } = await call('sendMessage', { chat_id: m.chat, text: m.text, parse_mode: 'HTML', link_preview_options: { is_disabled: !m.preview } });
      const outcome = deliveryOutcome(status, json);
      if (outcome === 'auth') { log(`token recusado (${status}): rode o install.ps1 de novo`); return; }
      if (outcome === 'wait') wait = (json.parameters?.retry_after || 30) * 1000;
      else {
        if (outcome === 'drop') log(`aviso ${m.feed} recusado: ${json.description}`);
        if (outcome === 'gone') forget(state, m.chat);
        state.outbox = state.outbox.filter(x => x !== m);   // a fila pode ter mudado enquanto enviava
        saveState(state);
      }
    } catch (err) { log(`envio: ${err.message}`); wait = 30e3; }
    await sleep(wait || 60);      // o Telegram aceita ~30 mensagens por segundo
  }
}

async function watch(state) {
  for (;;) {
    try {
      const queued = collect(state, await fetchFeeds());
      saveState(state);
      if (queued) log(`${queued} aviso(s) na fila`);
      await deliver(state);
    } catch (err) { log(`novidades: ${err.message}`); }
    await sleep(FEED_EVERY);
  }
}

/** Dois bots ao mesmo tempo mandariam tudo em dobro: o segundo sai. */
function onlyOne() {
  return new Promise(resolve => {
    const name = `2b-bot-${Buffer.from(DIR).toString('hex').slice(-40)}`;
    const server = net.createServer();
    server.once('error', () => { console.log('A 2B já está rodando.'); process.exit(0); });
    server.listen(process.platform === 'win32' ? `\\\\.\\pipe\\${name}` : `\0${name}`, resolve);
  });
}

async function main() {
  if (process.argv.includes('--preview')) {
    const datas = await fetchFeeds();
    for (const [key, feed] of Object.entries(FEEDS)) {
      const list = ((datas[key] && feed.list(datas[key], Date.now())) || []).filter(e => !feed.relevant || feed.relevant(e, Date.now()));
      for (const m of feed.format(list.slice(0, key === 'w4k3' || key === 'motivacao' ? 1 : 5))) console.log(`\n----- ${key} -----\n${m.text}`);
    }
    return;
  }
  fs.mkdirSync(DIR, { recursive: true });
  token = readJson(path.join(DIR, 'config.json')).token;
  if (!token) throw new Error('config.json sem token: rode o install.ps1');
  await onlyOne();
  const state = loadState();
  try {
    await call('setMyCommands', {
      commands: [
        { command: 'avisos', description: 'Escolher o que receber' },
        { command: 'parar', description: 'Desligar tudo e apagar meus dados' },
        { command: 'ajuda', description: 'Como funciona' },
      ],
    });
  } catch (err) { log(`setMyCommands: ${err.message}`); }
  log(`2B online: ${Object.keys(state.subs).length} assinante(s)`);
  await Promise.all([listen(state), watch(state)]);
}

main().catch(err => { log(`parou: ${err.message}`); process.exit(1); });
