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
  eventos: ['2B: agenda nova. Vai ter gente nossa lá.', 'Coordenadas recebidas. Encontro marcado.', '2B online. Ponto de encontro no radar.'],
  lembrete: ['2B: lembrete de encontro.', 'Não esquece: é logo ali.', '2B online. Contagem regressiva.'],
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

/** Dia de AAAA-MM-DD + n dias. */
const addDays = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const WEEKDAY = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const weekday = iso => WEEKDAY[new Date(iso + 'T12:00:00Z').getUTCDay()];

// ---------- feeds ----------
// label: nome no menu do bot; file: de onde vem; list(dados, agora): entradas (null = formato errado); id: id de cada uma;
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

  // Agenda presencial (data/eventos.json, editado à mão). Dois avisos por evento: quando ele entra na agenda e um
  // lembrete na véspera (ou no dia, se o PC estava desligado na véspera). Cada um sai uma vez só.
  eventos: {
    label: 'Eventos (onde vou estar)',
    file: 'data/eventos.json',
    emptyOk: true,     // a agenda pode começar vazia: o primeiro evento já é avisado
    list: (d, now = Date.now()) => {
      if (!d || !Array.isArray(d.eventos)) return null;
      const today = todayBR(now);
      const out = [];
      for (const e of d.eventos) {
        if (!e || !e.id || !e.data) continue;
        out.push({ ...e, aviso: 'novo' });
        if (e.data === today || e.data === addDays(today, 1)) out.push({ ...e, id: `lembrete:${e.id}`, aviso: 'lembrete', quando: e.data === today ? 'HOJE' : 'AMANHÃ' });
      }
      return out;
    },
    id: e => e.id,
    relevant: (e, now) => (e.fim || e.data) >= todayBR(now),
    format: entries => {
      // Evento novo que já é amanhã: o aviso de novo basta.
      const novos = new Set(entries.filter(e => e.aviso === 'novo').map(e => e.id));
      const list = entries.filter(e => e.aviso === 'novo' || !novos.has(e.id.slice('lembrete:'.length)))
        .sort((a, b) => (a.data + (a.hora || '')).localeCompare(b.data + (b.hora || '')));
      return list.map(e => {
        const lembrete = e.aviso === 'lembrete';
        const dia = `${weekday(e.data)} ${ddmm(e.data)}${e.fim && e.fim !== e.data ? ` a ${ddmm(e.fim)}` : ''}`;
        const hora = e.hora ? ` · ${e.hora}${e.horaFim ? `–${e.horaFim}` : ''}` : '';
        const onde = [e.local, [e.cidade, e.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ');
        return {
          text: join([
            pick(lembrete ? VOICE.lembrete : VOICE.eventos, e.id),
            `<b>${lembrete ? `EVENTO ${e.quando}` : 'EVENTO NOVO NA AGENDA'}</b>`,
            '',
            `<b>${esc(e.titulo)}</b>`,
            e.papel ? `🎤 ${esc(e.papel)}` : null,
            `🗓 ${esc(dia + hora)}`,
            onde ? `📍 ${esc(onde)}` : null,
            e.descricao && !lembrete ? '' : null,
            e.descricao && !lembrete ? esc(cut(stripHtml(e.descricao), 400)) : null,
            '',
            e.link ? `🔗 ${link(e.link, 'Mais informações / inscrição')}` : null,
            `▶ ${link(SITE + 'eventos.html', 'Agenda completa')}`,
          ]),
          preview: false,
        };
      });
    },
  },
};

module.exports = { FEEDS, SITE, MAX_LEN, esc };
