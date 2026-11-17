#!/usr/bin/env node
/* 2B - avisos no canal público do Telegram quando sai conteúdo novo no site.
 *
 * Olha os feeds em data/, compara com a lista do que já foi avisado (arquivo de estado) e manda
 * uma mensagem por novidade no canal: reflexão nova do W4K3, motivação nova, atos convocados no
 * Organize-se (uma mensagem por rodada, agrupada por estado) e checagens novas (resumo).
 *
 * Uso: node automation/notify.js --state caminho/notified.json [--dry-run]
 *   Env: TELEGRAM_2B_TOKEN (token do @BotFather) e TELEGRAM_2B_CHAT (ex.: @nome_do_canal).
 *   Sem token ou com --dry-run: só mostra as mensagens e não grava o estado.
 *
 * Primeira vez de cada feed (sem estado): marca tudo como já avisado e não manda nada,
 * para não despejar 180 checagens de uma vez no canal.
 * Se o envio de uma mensagem falhar, o que ela levaria não é marcado e vai na próxima rodada.
 * Roda no GitHub Actions: .github/workflows/notify.yml. Passo a passo em docs/NOTIFICACOES.md.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://alexandre-augusto-art.github.io/0FF-GR1D_WEB/';
const MAX_LEN = 3800;          // o Telegram aceita 4096; folga para as tags HTML
const MAX_FACTCHECKS = 10;     // checagens listadas por resumo

// Falas da 2B na abertura de cada aviso. Uma por mensagem, escolhida pelo id (sempre a mesma para o mesmo conteúdo).
const VOICE = {
  w4k3: ['2B online. Nova transmissão do W4K3.', 'Sinal captado. Leitura do dia liberada.', '2B aqui. Tem coisa que eles não querem que você leia.'],
  motivacao: ['2B: combustível do dia.', 'Para não esquecer por que a gente luta.', '2B online. Uma frase antes de sair.'],
  organize: ['2B: tem gente indo para a rua.', 'Convocação recebida. Confira antes de ir.', '2B online. Atos marcados no radar.'],
  factchecks: ['2B: mentira circulando. Checagens novas.', 'Antes de repassar, confere aqui.', '2B online. As agências desmentiram isto.'],
};

// ---------- util ----------
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const stripHtml = s => String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const ddmm = iso => (/^\d{4}-\d{2}-\d{2}/.test(iso || '') ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
const link = (url, text) => `<a href="${esc(url)}">${esc(text)}</a>`;
function pick(list, id) {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}
/** Data de hoje em Brasília (AAAA-MM-DD). */
const todayBR = now => new Date(now - 3 * 3600e3).toISOString().slice(0, 10);

/**
 * Junta pedaços { text, ids } em mensagens que cabem no limite, repetindo o cabeçalho e o rodapé em cada parte.
 * Cada mensagem leva os ids dos pedaços que entraram nela.
 */
function chunk(header, pieces, footer) {
  const parts = [];
  let cur = [];
  const size = arr => [header, ...arr.map(p => p.text), footer].join('\n').length;
  for (const piece of pieces) {
    if (cur.length && size([...cur, piece]) > MAX_LEN) { parts.push(cur); cur = []; }
    cur.push(piece);
  }
  if (cur.length) parts.push(cur);
  return parts.map(part => ({ text: [header, ...part.map(p => p.text), footer].join('\n'), ids: part.flatMap(p => p.ids) }));
}

// ---------- feeds ----------
// Cada feed: arquivo, como tirar a lista, o id de cada entrada, quais entram no aviso e como viram mensagens.
// format() devolve [{ text, ids, preview }]: ids são as entradas que a mensagem leva (marcadas só se ela for enviada).
const FEEDS = {
  w4k3: {
    file: 'data/reflections.json',
    list: d => (Array.isArray(d) ? d : []),
    id: e => e.id,
    format: entries => entries.map(e => {
      const r = e.reflection || {};
      const n = e.news || {};
      const text = [
        pick(VOICE.w4k3, e.id),
        `<b>W4K3 PR0T0C0L · ${ddmm(e.date)}</b>`,
        '',
        `<b>${esc(r.title)}</b>`,
        esc(cut(stripHtml(r.excerpt || r.content), 400)),
        '',
        n.link ? `📰 ${esc(n.source || 'Fonte')}: ${link(n.link, cut(n.title || n.link, 120))}` : '',
        `▶ ${link(SITE + 'w4k3-protocol.html', 'Ler a reflexão completa (com vídeo)')}`,
        '',
        '#w4k3',
      ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
      return { text, ids: [e.id], preview: true };
    }),
  },

  motivacao: {
    file: 'data/motivations.json',
    list: d => (Array.isArray(d) ? d : []),
    id: e => `${e.date}:${e.bankId || ''}`,
    format: (entries, feed) => entries.map(e => ({
      text: [
        pick(VOICE.motivacao, feed.id(e)),
        `<b>MOTIVAÇÃO DIÁRIA · ${ddmm(e.date)}</b>`,
        '',
        `<i>“${esc(e.content)}”</i>`,
        e.author ? `— ${esc(e.author)}` : '',
        '',
        `▶ ${link(SITE + 'motivacao.html', 'Ver no site')}`,
        '#motivacao',
      ].join('\n'),
      ids: [feed.id(e)],
      preview: false,
    })),
  },

  organize: {
    file: 'data/organize.json',
    list: d => (d && Array.isArray(d.eventos) ? d.eventos : []),
    id: e => e.id,
    // Só ato marcado (convocação) que ainda vai acontecer; cobertura de ato que já rolou não vira aviso.
    relevant: (e, now) => e.tipo === 'convocacao' && (!e.data || e.data >= todayBR(now)),
    format: (entries, feed) => {
      if (!entries.length) return [];
      const byUf = {};
      for (const e of entries) (byUf[e.uf] ||= []).push(e);
      const ufs = Object.keys(byUf).sort();
      const line = e => {
        const when = [ddmm(e.data) || 'data na fonte', e.hora].filter(Boolean).join(' ');
        const where = e.cidade ? `${esc(e.cidade)} · ` : e.estados?.length ? `${esc(e.estados.join(', '))} · ` : '';
        return `• ${where}${esc(when)} — ${link(e.fonte?.url || SITE + 'organize-se.html', cut(e.titulo || '', 140))}`;
      };
      // um pedaço por estado (um estado não se divide entre duas mensagens)
      const pieces = ufs.map(uf => {
        const list = byUf[uf].sort((a, b) => (a.data || '9').localeCompare(b.data || '9'));
        return { text: ['', `<b>${uf === 'BR' ? 'NACIONAL' : esc(uf)}</b>`, ...list.map(line)].join('\n'), ids: list.map(feed.id) };
      });
      const n = entries.length;
      const header = `${pick(VOICE.organize, entries[0].id)}\n<b>ORGANIZE-SE · ${n} ato${n > 1 ? 's' : ''} convocado${n > 1 ? 's' : ''}</b>`;
      const footer = `\n⚠ Confirme local e horário na fonte e leia os cuidados antes de ir.\n▶ ${link(SITE + 'organize-se.html', 'Todos os atos + checklist')}\n\n#organize ${ufs.map(u => (u === 'BR' ? '#nacional' : '#' + u)).join(' ')}`;
      return chunk(header, pieces, footer).map(m => ({ ...m, preview: false }));
    },
  },

  factchecks: {
    file: 'data/factchecks.json',
    list: d => (d && Array.isArray(d.items) ? d.items : []),
    id: e => e.link,
    format: (entries, feed) => {
      if (!entries.length) return [];
      const shown = entries.slice(-MAX_FACTCHECKS).reverse();   // as mais recentes primeiro
      const icon = r => ({ FALSO: '❌', GOLPE: '🚨', VERDADEIRO: '✅', CHECAGEM: '🔎' }[r] || '⚠️');
      const pieces = shown.map(e => ({ text: `${icon(e.rating)} <b>${esc(e.rating)}</b> · ${link(e.link, cut(e.title || '', 150))} <i>(${esc(e.source)})</i>`, ids: [] }));
      const rest = entries.length - shown.length;
      const n = entries.length;
      const header = `${pick(VOICE.factchecks, shown[0].link)}\n<b>FACT CHECK · ${n} checage${n > 1 ? 'ns novas' : 'm nova'}</b>\n`;
      const footer = `${rest > 0 ? `\n+ ${rest} no site.` : ''}\n▶ ${link(SITE + 'fact-check.html', 'Checar uma mensagem que você recebeu')}\n\n#factcheck`;
      // o resumo leva todas: as que não couberam na lista ficam no "+ N no site"
      return chunk(header, pieces, footer).map((m, i) => ({ text: m.text, ids: i === 0 ? entries.map(feed.id) : [], preview: false }));
    },
  },
};

/** Entradas novas de um feed (na ordem do mais antigo para o mais novo). seen = Set de ids já avisados. */
function newEntries(feed, data, seen, now = Date.now()) {
  const all = feed.list(data).filter(e => feed.id(e));
  const fresh = all.filter(e => !seen.has(feed.id(e)) && (!feed.relevant || feed.relevant(e, now)));
  const time = e => Date.parse(e.date || e.publicadoEm || '') || 0;
  return fresh.sort((a, b) => time(a) - time(b));
}

/**
 * Planeja a rodada. state = { feed: [ids] }. Devolve { messages: [{feed, text, ids, preview}], state }
 * onde state é o próximo estado se TODAS as mensagens forem enviadas (use markSent para o caso parcial).
 */
function plan(datas, state, now = Date.now()) {
  const messages = [];
  const next = {};
  const seeded = [];
  for (const [key, feed] of Object.entries(FEEDS)) {
    const data = datas[key];
    if (data === undefined) { if (state[key]) next[key] = state[key]; continue; }
    const current = feed.list(data).map(feed.id).filter(Boolean);
    if (!Array.isArray(state[key])) {          // primeira vez: só marca
      next[key] = current;
      seeded.push(key);
      continue;
    }
    const seen = new Set(state[key]);
    const entries = newEntries(feed, data, seen, now);
    for (const m of feed.format(entries, feed)) messages.push({ feed: key, ...m });
    // guarda só o que ainda está no feed (o estado não cresce para sempre); as novas entram em markSent
    const present = new Set(current);
    next[key] = state[key].filter(id => present.has(id));
    // entradas que não viram aviso (cobertura, ato passado) são marcadas já, para não reaparecerem depois
    const relevant = new Set(entries.map(feed.id));
    for (const id of current) if (!seen.has(id) && !relevant.has(id)) next[key].push(id);
  }
  return { messages, state: next, seeded };
}

function markSent(state, message) {
  const list = state[message.feed] || (state[message.feed] = []);
  for (const id of message.ids) if (!list.includes(id)) list.push(id);
}

// ---------- Telegram ----------
async function send(token, chat, message) {
  const body = {
    chat_id: chat,
    text: message.text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: !message.preview },
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (json.ok) return;
    const wait = json.parameters?.retry_after;
    if (res.status === 429 && wait) { await new Promise(r => setTimeout(r, (wait + 1) * 1000)); continue; }
    throw new Error(`Telegram ${res.status}: ${json.description || 'sem resposta'}`);
  }
  throw new Error('Telegram: limite de envio, tente depois');
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); }
  catch { return undefined; }
}

async function main() {
  const args = process.argv.slice(2);
  const statePath = args.includes('--state') ? args[args.indexOf('--state') + 1] : path.join(ROOT, '.notify-state.json');
  const token = process.env.TELEGRAM_2B_TOKEN;
  const chat = process.env.TELEGRAM_2B_CHAT;
  const dry = args.includes('--dry-run') || !token || !chat;
  if (!token || !chat) console.log('Sem TELEGRAM_2B_TOKEN/TELEGRAM_2B_CHAT: só mostrando, sem enviar e sem gravar o estado.');

  const datas = {};
  for (const [key, feed] of Object.entries(FEEDS)) {
    datas[key] = readJson(path.join(ROOT, feed.file));
    if (datas[key] === undefined) console.log(`-  ${feed.file}: não existe ou JSON inválido (ignorado)`);
  }
  const state = readJson(statePath) || {};
  const { messages, state: next, seeded } = plan(datas, state);
  for (const key of seeded) console.log(`•  ${key}: primeira vez, marcando ${next[key].length} entradas como já avisadas (nada enviado)`);
  console.log(`${messages.length} mensagem(ns) nova(s).`);

  let failed = 0;
  for (const m of messages) {
    if (dry) { console.log(`\n----- [${m.feed}] -----\n${m.text}`); continue; }
    try {
      await send(token, chat, m);
      markSent(next, m);
      console.log(`✓  ${m.feed}: enviada (${m.ids.length} entrada(s))`);
      await new Promise(r => setTimeout(r, 1500));   // canal aceita ~20 mensagens/min
    } catch (err) {
      failed++;
      console.log(`✗  ${m.feed}: ${err.message} (fica para a próxima rodada)`);
    }
  }
  if (!dry) fs.writeFileSync(statePath, JSON.stringify(next, null, 1) + '\n');
  if (failed) process.exit(1);
}

if (require.main === module) main().catch(err => { console.error(err); process.exit(1); });

module.exports = { FEEDS, newEntries, plan, markSent, chunk, esc, todayBR, MAX_LEN };
