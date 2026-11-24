/* 2B - o que vira aviso e como fica o texto. Não envia nada: quem envia é o bot.js.
 * As falas de abertura da 2B ficam em VOICE; edite à vontade.
 */
const SITE = 'https://alexandre-augusto-art.github.io/0FF-GR1D_WEB/';
const MAX_LEN = 3800;          // o Telegram aceita 4096
const MAX_FACTCHECKS = 10;     // checagens listadas por resumo
const MAX_POSTS = 3;           // W4K3 e Motivação: se acumular (PC desligado vários dias), só os mais recentes
const ATOS_POR_BLOCO = 4;      // atos de um mesmo estado que ficam juntos na mesma mensagem

// Uma fala por mensagem, escolhida pelo id (sempre a mesma para o mesmo conteúdo).
const VOICE = {
  w4k3: ['2B online. Nova transmissão do W4K3.', 'Sinal captado. Leitura do dia liberada.', '2B aqui. Tem coisa que eles não querem que você leia.'],
  motivacao: ['2B: combustível do dia.', 'Para não esquecer por que a gente luta.', '2B online. Uma frase antes de sair.'],
  organize: ['2B: tem gente indo para a rua.', 'Convocação recebida. Confira antes de ir.', '2B online. Atos marcados no radar.'],
  factchecks: ['2B: checagens novas no sistema.', 'Antes de repassar, confere aqui.', '2B online. As agências checaram isto.'],
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
/** Junta linhas, sem as null e sem linhas vazias repetidas. */
const join = arr => arr.filter(l => l !== null).join('\n').replace(/\n{3,}/g, '\n\n');

/** Junta pedaços de texto em mensagens que cabem no limite, repetindo cabeçalho e rodapé em cada uma. */
function chunk(header, pieces, footer) {
  const all = part => [header, ...part, footer].join('\n');
  const parts = [];
  let cur = [];
  for (const piece of pieces) {
    if (cur.length && all([...cur, piece]).length > MAX_LEN) { parts.push(cur); cur = []; }
    cur.push(piece);
  }
  if (cur.length) parts.push(cur);
  return parts.map(all);
}

// ---------- feeds ----------
// label: nome no menu do bot; file: de onde vem; list: entradas (null = formato errado); id: id de cada uma;
// relevant: quais viram aviso; format(entradas): mensagens prontas para o Telegram, [{ text, preview }].
const FEEDS = {
  w4k3: {
    label: 'W4K3 PR0T0C0L (notícia do dia)',
    file: 'data/reflections.json',
    list: d => (Array.isArray(d) ? d : null),
    id: e => e.id,
    format: entries => entries.slice(-MAX_POSTS).map(e => {
      const r = e.reflection || {};
      const n = e.news || {};
      return {
        text: join([
          pick(VOICE.w4k3, e.id),
          `<b>W4K3 PR0T0C0L · ${ddmm(e.date)}</b>`,
          '',
          `<b>${esc(r.title)}</b>`,
          esc(cut(stripHtml(r.excerpt || r.content), 400)),
          '',
          n.link ? `📰 ${esc(n.source || 'Fonte')}: ${link(n.link, cut(n.title || n.link, 120))}` : null,
          `▶ ${link(SITE + 'w4k3-protocol.html', 'Ler a reflexão completa')}`,
        ]),
        preview: false,
      };
    }),
  },

  motivacao: {
    label: 'Motivação Diária',
    file: 'data/motivations.json',
    list: d => (Array.isArray(d) ? d : null),
    id: e => `${e.date}:${e.bankId || ''}`,
    format: entries => entries.slice(-MAX_POSTS).map(e => ({
      text: join([
        pick(VOICE.motivacao, `${e.date}:${e.bankId || ''}`),
        `<b>MOTIVAÇÃO DIÁRIA · ${ddmm(e.date)}</b>`,
        '',
        `<i>“${esc(e.content)}”</i>`,
        e.author ? `— ${esc(e.author)}` : null,
        '',
        `▶ ${link(SITE + 'motivacao.html', 'Ver no site')}`,
      ]),
      preview: false,
    })),
  },

  organize: {
    label: 'Organize-se (atos)',
    file: 'data/organize.json',
    list: d => (d && Array.isArray(d.eventos) ? d.eventos : null),
    id: e => e.id,
    // Só ato marcado (convocação) que ainda vai acontecer; cobertura de ato que já rolou não vira aviso.
    relevant: (e, now) => e.tipo === 'convocacao' && (!e.data || e.data >= todayBR(now)),
    format: entries => {
      if (!entries.length) return [];
      const byUf = {};
      for (const e of entries) (byUf[e.uf] ||= []).push(e);
      const line = e => {
        const when = [ddmm(e.data) || 'data na fonte', e.hora].filter(Boolean).join(' ');
        const where = e.cidade ? `${esc(e.cidade)} · ` : e.estados?.length ? `${esc(e.estados.join(', '))} · ` : '';
        return `• ${where}${esc(when)} — ${link(e.fonte?.url || SITE + 'organize-se.html', cut(e.titulo || '', 140))}`;
      };
      const pieces = [];
      for (const uf of Object.keys(byUf).sort()) {
        const list = byUf[uf].sort((a, b) => (a.data || '9').localeCompare(b.data || '9'));
        for (let i = 0; i < list.length; i += ATOS_POR_BLOCO) {
          const title = `${uf === 'BR' ? 'NACIONAL' : esc(uf)}${i ? ' (continuação)' : ''}`;
          pieces.push(['', `<b>${title}</b>`, ...list.slice(i, i + ATOS_POR_BLOCO).map(line)].join('\n'));
        }
      }
      const n = entries.length;
      const header = `${pick(VOICE.organize, entries[0].id)}\n<b>ORGANIZE-SE · ${n} ato${n > 1 ? 's' : ''} convocado${n > 1 ? 's' : ''}</b>`;
      const footer = `\n⚠ Confirme local e horário na fonte e leia os cuidados antes de ir.\n▶ ${link(SITE + 'organize-se.html', 'Todos os atos + checklist')}`;
      return chunk(header, pieces, footer).map(text => ({ text, preview: false }));
    },
  },

  factchecks: {
    label: 'Fact Check (checagens)',
    file: 'data/factchecks.json',
    list: d => (d && Array.isArray(d.items) ? d.items : null),
    id: e => e.link,
    format: entries => {
      if (!entries.length) return [];
      const shown = entries.slice(-MAX_FACTCHECKS).reverse();   // as mais recentes primeiro
      const icon = r => ({ FALSO: '❌', GOLPE: '🚨', VERDADEIRO: '✅', CHECAGEM: '🔎' }[r] || '⚠️');
      const pieces = shown.map(e => `${icon(e.rating)} <b>${esc(e.rating)}</b> · ${link(e.link, cut(e.title || '', 150))} <i>(${esc(e.source)})</i>`);
      const n = entries.length;
      const rest = n - shown.length;
      const header = `${pick(VOICE.factchecks, shown[0].link)}\n<b>FACT CHECK · ${n} checage${n > 1 ? 'ns novas' : 'm nova'}</b>\n`;
      const footer = `${rest > 0 ? `\n+ ${rest} no site.` : ''}\n▶ ${link(SITE + 'fact-check.html', 'Checar uma mensagem que você recebeu')}`;
      return chunk(header, pieces, footer).map(text => ({ text, preview: false }));
    },
  },
};

module.exports = { FEEDS, SITE, MAX_LEN, esc };
