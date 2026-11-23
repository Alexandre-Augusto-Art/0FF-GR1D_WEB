/* 2B - regras do bot, sem rede nem disco (testado em tests/bot-2b/bot.test.js).
 *
 * state = {
 *   offset,                                  próxima atualização do Telegram a ler
 *   seen:   { feed: [ids já tratados] },
 *   subs:   { chatId: { topics: [feed], ufs: [UF] } },   ufs vazio = todos os estados
 *   outbox: [{ chat, feed, text, preview }]  avisos prontos, ainda não entregues
 * }
 * Só existe entrada em subs para quem tem algum aviso ligado. Nada além disso é guardado sobre a pessoa.
 */
const { FEEDS } = require('./messages.js');

const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];
const MAX_SEEN = 3000;

const emptyState = () => ({ offset: 0, seen: {}, subs: {}, outbox: [] });

// ---------- assinaturas ----------
const prefs = (state, chat) => state.subs[chat] || { topics: [], ufs: [] };
const toggle = (list, x) => (list.includes(x) ? list.filter(v => v !== x) : [...list, x]);
function setPrefs(state, chat, p) {
  if (p.topics.length) state.subs[chat] = p;
  else delete state.subs[chat];
  // o que foi desligado e ainda não saiu não deve sair
  state.outbox = state.outbox.filter(m => m.chat !== chat || p.topics.includes(m.feed));
}
function forget(state, chat) { setPrefs(state, chat, { topics: [], ufs: [] }); }

// ---------- menus ----------
const ufsLabel = p => (p.ufs.length ? [...p.ufs].sort().join(', ') : 'todos os estados');
function mainMenu(p) {
  const rows = Object.entries(FEEDS).map(([key, f]) => [{ text: `${p.topics.includes(key) ? '✅' : '⬜'} ${f.label}`, callback_data: `t:${key}` }]);
  if (p.topics.includes('organize')) rows.push([{ text: `📍 Estados: ${p.ufs.length > 6 ? p.ufs.length + ' escolhidos' : ufsLabel(p)}`, callback_data: 'ufs' }]);
  const text = [
    '<b>2B online.</b> Escolha o que você quer receber. Toque para ligar ou desligar.',
    '',
    p.topics.length ? 'Pronto: aviso você aqui quando sair algo novo.' : 'Nenhum aviso ligado por enquanto.',
    '',
    '/avisos muda as escolhas · /parar desliga tudo e apaga seus dados',
  ].join('\n');
  return { text, keyboard: rows };
}
function ufMenu(p) {
  const rows = [];
  for (let i = 0; i < UFS.length; i += 5) {
    rows.push(UFS.slice(i, i + 5).map(uf => ({ text: `${p.ufs.includes(uf) ? '✅' : ''}${uf}`, callback_data: `u:${uf}` })));
  }
  rows.push([{ text: `${p.ufs.length ? '⬜' : '✅'} Todos os estados`, callback_data: 'u:*' }]);
  rows.push([{ text: '← Voltar', callback_data: 'menu' }]);
  return { text: `<b>Organize-se:</b> de quais estados?\nAgora: ${ufsLabel(p)}.\n\nAtos nacionais também chegam.`, keyboard: rows };
}
const HELP = [
  '<b>2B</b>, do 0FF-GR1D / DEDSEC. Aviso quando sai conteúdo novo no site.',
  '',
  '/avisos escolher o que receber',
  '/parar desligar tudo e apagar seus dados',
  '',
  'Guardo só o número desta conversa e as suas escolhas, e só enquanto houver um aviso ligado.',
].join('\n');

/**
 * Trata uma atualização do Telegram: muda state e devolve as chamadas a fazer, [{ method, params }].
 * Só conversa privada: em grupo a 2B não responde.
 */
function handleUpdate(state, u) {
  const q = u.callback_query;
  if (q) {
    const calls = [{ method: 'answerCallbackQuery', params: { callback_query_id: q.id } }];
    const chatObj = q.message?.chat;
    if (!chatObj || chatObj.type !== 'private') return calls;
    const chat = String(chatObj.id);
    const p = prefs(state, chat);
    const [cmd, arg] = String(q.data || '').split(':');
    let view = mainMenu;
    if (cmd === 't' && Object.hasOwn(FEEDS, arg)) {
      const topics = toggle(p.topics, arg);
      setPrefs(state, chat, { topics, ufs: topics.includes('organize') ? p.ufs : [] });
    } else if (cmd === 'u' && p.topics.includes('organize') && (arg === '*' || UFS.includes(arg))) {
      setPrefs(state, chat, { ...p, ufs: arg === '*' ? [] : toggle(p.ufs, arg) });
      view = ufMenu;
    } else if (cmd === 'ufs' && p.topics.includes('organize')) {
      view = ufMenu;
    }
    const m = view(prefs(state, chat));
    calls.push({ method: 'editMessageText', params: { chat_id: chat, message_id: q.message.message_id, text: m.text, parse_mode: 'HTML', reply_markup: { inline_keyboard: m.keyboard } } });
    return calls;
  }

  const msg = u.message;
  if (!msg || msg.chat?.type !== 'private') return [];
  const chat = String(msg.chat.id);
  const say = (text, keyboard) => [{
    method: 'sendMessage',
    params: { chat_id: chat, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}) },
  }];
  const command = String(msg.text || '').trim().split(/[\s@]/)[0].toLowerCase();
  if (command === '/parar' || command === '/stop') {
    forget(state, chat);
    return say('Avisos desligados e dados apagados. Se quiser voltar: /avisos');
  }
  if (command === '/ajuda' || command === '/help') return say(HELP);
  const m = mainMenu(prefs(state, chat));      // /start, /avisos e qualquer outra coisa
  return say(command === '/start' ? `${m.text}\n\n<i>Guardo só o número desta conversa e as suas escolhas.</i>` : m.text, m.keyboard);
}

// ---------- novidades ----------
/**
 * Compara os feeds com o que já foi tratado e põe os avisos na fila (state.outbox), um conjunto por assinante.
 * Primeira vez de um feed: só marca, sem avisar. Feed que não carregou ou veio no formato errado é ignorado.
 */
function collect(state, datas, now = Date.now()) {
  let queued = 0;
  for (const [key, feed] of Object.entries(FEEDS)) {
    const list = datas[key] === undefined ? null : feed.list(datas[key]);
    if (!list) continue;
    const entries = list.filter(e => e && feed.id(e));
    if (!state.seen[key]) {
      if (entries.length) state.seen[key] = entries.map(feed.id).slice(0, MAX_SEEN);
      continue;
    }
    const seen = new Set(state.seen[key]);
    const fresh = entries.filter(e => !seen.has(feed.id(e)));
    if (!fresh.length) continue;
    // O state é gravado inteiro (com a fila) de uma vez, então nada se perde no meio.
    // Os ids que saíram do feed continuam aqui: uma notícia que some e volta não é avisada de novo.
    state.seen[key] = [...fresh.map(feed.id), ...state.seen[key]].slice(0, MAX_SEEN);
    const time = e => Date.parse(e.date || e.publicadoEm || '') || 0;
    const notify = fresh.filter(e => !feed.relevant || feed.relevant(e, now)).sort((a, b) => time(a) - time(b));
    if (!notify.length) continue;
    for (const [chat, p] of Object.entries(state.subs)) {
      if (!p.topics.includes(key)) continue;
      const mine = key === 'organize' && p.ufs.length
        ? notify.filter(e => p.ufs.includes(e.uf) || (e.uf === 'BR' && (!e.estados?.length || e.estados.some(uf => p.ufs.includes(uf)))))
        : notify;
      for (const m of feed.format([...mine])) { state.outbox.push({ chat, feed: key, ...m }); queued++; }
    }
  }
  return queued;
}

/**
 * O que a resposta do Telegram a um aviso quer dizer: 'sent'; 'gone' (a pessoa bloqueou o bot ou a conta não existe
 * mais: apaga tudo dela); 'drop' (mensagem recusada, não adianta repetir); 'auth' (token errado: não descartar nada);
 * 'wait' (tentar de novo depois).
 */
function deliveryOutcome(status, json) {
  if (json?.ok) return 'sent';
  const d = String(json?.description || '').toLowerCase();
  if (status === 401 || status === 404) return 'auth';
  if (status === 403 || /chat not found|user is deactivated/.test(d)) return 'gone';
  if (status === 400) return 'drop';
  return 'wait';
}

module.exports = { UFS, emptyState, handleUpdate, collect, deliveryOutcome, forget, mainMenu, ufMenu };
