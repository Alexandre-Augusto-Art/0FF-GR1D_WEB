#!/usr/bin/env node
/* Coleta as checagens recentes das agências (RSS) e grava data/factchecks.json.
 * Roda sozinho no GitHub Actions (.github/workflows/factchecks.yml), sem IA e sem o PC de casa.
 * Uso local: node automation/factchecks/fetch.js [--dry-run]
 *
 * O site usa o arquivo na aba MENSAGEM do Fact Check: a mensagem colada é comparada com os títulos.
 */
const fs = require('fs');
const path = require('path');
const { validateFactChecks } = require('../validators.js');
const { ratingOf } = require('../../js/fact-check/text.js');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'data', 'factchecks.json');
const DRY = process.argv.includes('--dry-run');
const KEEP_DAYS = 180;
const MAX_ITEMS = 2000;

// AFP Checamos e Projeto Comprova não têm RSS funcionando (testado em 2026-11-17): ficam só na busca do site.
const FEEDS = [
  { source: 'Aos Fatos', url: 'https://www.aosfatos.org/noticias/feed/' },
  { source: 'Agência Lupa', url: 'https://www.agencialupa.org/feed/' },
  { source: 'Boatos.org', url: 'https://www.boatos.org/feed' },
  { source: 'E-farsas', url: 'https://www.e-farsas.com/feed' },
  { source: 'Fato ou Fake (g1)', url: 'https://g1.globo.com/rss/g1/fato-ou-fake/' },
  { source: 'Estadão Verifica', url: 'https://www.estadao.com.br/arc/outboundfeeds/feeds/rss/sections/estadao-verifica/' }
];

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—', laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’' };
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

function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : '';
}

/** Tira utm_* e afins, para a mesma checagem não entrar duas vezes. */
function cleanLink(u) {
  try {
    const url = new URL(decode(u));
    for (const k of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid|amp$)/i.test(k)) url.searchParams.delete(k);
    url.hash = '';
    return url.href.replace(/\/$/, '');
  } catch (e) { return ''; }
}

function notPortuguese(title) {
  const words = title.toLowerCase().split(/[^a-záéíóúâêôãõçñü]+/);
  const count = set => words.filter(w => set.has(w)).length;
  const en = count(new Set(['the', 'is', 'was', 'it', 'that', 'of', 'and', 'showing', 'shows', 'false', 'by', 'were', 'after', 'an']));
  const es = count(new Set(['el', 'los', 'las', 'es', 'fue', 'muestra', 'creado', 'una', 'un', 'del', 'y', 'haya', 'hayan', 'sido', 'tras', 'luego', 'hombre', 'falla']));
  const pt = count(new Set(['o', 'os', 'as', 'é', 'não', 'em', 'foi', 'vídeo', 'um', 'uma', 'do', 'da', 'com', 'ao', 'na', 'no', 'mostra', 'imagem']));
  return Math.max(en, es) >= 2 && Math.max(en, es) > pt;
}

function parseFeed(xml, source) {
  const items = [];
  for (const block of xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || []) {
    const title = decode(tag(block, 'title'));
    const link = cleanLink(tag(block, 'link') || (block.match(/<guid[^>]*>(https?:[^<]+)<\/guid>/i) || [])[1]);
    const when = new Date(decode(tag(block, 'pubDate') || tag(block, 'dc:date')));
    if (!title || !link || isNaN(when)) continue;
    if (notPortuguese(title)) continue; // o Boatos.org publica traduções em inglês e espanhol no mesmo feed
    let summary = decode(tag(block, 'description'));
    if (summary.length > 280) summary = summary.slice(0, 277).replace(/\s+\S*$/, '') + '…';
    const item = { title, link, source, date: when.toISOString(), rating: ratingOf(title) };
    if (summary && summary !== title) item.summary = summary;
    items.push(item);
  }
  return items;
}

async function getFeed(feed) {
  const res = await fetch(feed.url, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; DEDSEC-FactCheck/1.0; leitor de RSS)', accept: 'application/rss+xml, application/xml, text/xml' },
    redirect: 'follow',
    signal: AbortSignal.timeout(30000)
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return parseFeed(await res.text(), feed.source);
}

async function main() {
  let old = { items: [] };
  try { old = JSON.parse(fs.readFileSync(OUT, 'utf8').replace(/^﻿/, '')); } catch (e) { /* primeira vez */ }

  const results = await Promise.allSettled(FEEDS.map(getFeed));
  const sources = [];
  const fresh = [];
  results.forEach((r, i) => {
    const name = FEEDS[i].source;
    if (r.status === 'fulfilled') { fresh.push(...r.value); sources.push({ name, ok: true, count: r.value.length }); }
    else sources.push({ name, ok: false, count: 0, error: String(r.reason && r.reason.message || r.reason).slice(0, 120) });
    console.log(`${r.status === 'fulfilled' ? '✓' : '✗'}  ${name}: ${r.status === 'fulfilled' ? r.value.length + ' itens' : sources[i].error}`);
  });
  if (!sources.some(s => s.ok)) { console.log('Nenhum feed respondeu: mantendo o arquivo como está.'); process.exit(1); }

  // novas primeiro (atualizam título e veredito), depois as antigas que ainda não saíram do prazo
  const cutoff = Date.now() - KEEP_DAYS * 86400000;
  const byLink = new Map();
  for (const it of [...fresh, ...(Array.isArray(old.items) ? old.items : [])]) {
    if (!it || !it.link || byLink.has(it.link)) continue;
    const t = Date.parse(it.date);
    if (isNaN(t) || t < cutoff || t > Date.now() + 86400000) continue;
    byLink.set(it.link, it);
  }
  const items = [...byLink.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, MAX_ITEMS);
  const data = { updatedAt: new Date().toISOString(), sources, items };

  const errors = validateFactChecks(data);
  if (errors.length) { console.log('✗  arquivo inválido:\n   ' + errors.slice(0, 20).join('\n   ')); process.exit(1); }

  const same = JSON.stringify(old.items) === JSON.stringify(items);
  console.log(`\n${items.length} checagens (${fresh.length} nos feeds agora)${same ? ', nada novo' : ''}.`);
  if (same && old.updatedAt) return;
  if (DRY) { console.log('--dry-run: arquivo não gravado.'); return; }
  fs.writeFileSync(OUT, JSON.stringify(data, null, 1) + '\n');
  console.log('Gravado: data/factchecks.json');
}

if (require.main === module) main().catch(err => { console.error(err); process.exit(1); });
module.exports = { parseFeed, cleanLink, decode };
