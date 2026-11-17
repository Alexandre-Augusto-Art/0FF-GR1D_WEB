/* DEDSEC - Fact Check: aba MENSAGEM.
 * Procura padrões de boato/golpe no texto (text.js), analisa os links dele (link.js) e compara com as
 * checagens recentes das agências (data/factchecks.json, atualizado pelo GitHub Actions).
 * A "busca inteligente" usa a IA local do assistente (js/chatbot.js), que roda no aparelho.
 */
(function () {
  'use strict';

  const T = window.FactCheckText;
  const L = window.FactCheckLink;
  const UI = window.FactCheckUI;
  const App = window.FactCheckApp;
  if (!T || !L || !UI || !App) return;
  const { el } = UI;
  const $ = id => document.getElementById(id);
  const BASE_URL = 'data/factchecks.json';
  const SEMANTIC_MIN = 0.55;

  const VERDICTS = {
    danger: { tag: 'ALERTA', text: 'Esta mensagem tem cara de golpe ou de boato. Não clique nos links, não responda e não repasse.' },
    warn: { tag: 'CUIDADO', text: 'A mensagem usa truques comuns de boato. Confira a fonte e veja se já checaram antes de repassar.' },
    unknown: { tag: 'SEM TRUQUES COMUNS', text: 'Não achei os padrões mais comuns de boato ou golpe. Isso não confirma o conteúdo: veja abaixo se já checaram.' }
  };
  const RATING_CLASS = {
    FALSO: 'danger', 'FEITO COM IA': 'danger', MONTAGEM: 'danger', GOLPE: 'danger',
    ENGANOSO: 'warn', ANTIGO: 'warn', 'FORA DE CONTEXTO': 'warn', VERDADEIRO: 'ok', CHECAGEM: 'info'
  };

  let base = null, basePromise = null, lastText = '';
  const vectors = new Map(); // link -> vetor (IA local)

  function loadBase() {
    if (!basePromise) {
      basePromise = fetch(BASE_URL, { cache: 'no-cache' })
        .then(r => (r.ok ? r.json() : null))
        .then(d => { base = d && Array.isArray(d.items) ? d : { items: [] }; return base; })
        .catch(() => { base = { items: [] }; return base; });
    }
    return basePromise;
  }

  const fmtDay = iso => new Date(iso).toLocaleDateString('pt-BR');

  function renderMatches(matches, how) {
    const list = $('fc-msg-matches');
    const note = $('fc-msg-matches-note');
    if (!matches.length) {
      list.replaceChildren();
      note.textContent = base && base.items.length
        ? `Nenhuma checagem parecida entre as ${base.items.length} mais recentes das agências. Isso não quer dizer que é verdade: busque o assunto abaixo.`
        : 'A base de checagens não carregou. Busque o assunto nas agências abaixo.';
      return;
    }
    note.textContent = how === 'ia'
      ? 'Ordenadas pela IA local, que entende o sentido além das palavras. Abra a checagem e confirme se é o mesmo caso.'
      : 'Checagens com palavras em comum com a mensagem. Abra e confirme se é o mesmo caso.';
    list.replaceChildren(...matches.map(({ item }) => {
      const li = el('li', 'fc-match');
      li.appendChild(el('span', 'fc-rating is-' + (RATING_CLASS[item.rating] || 'info'), item.rating));
      const a = el('a', 'fc-match-title', item.title + ' ↗');
      a.href = item.link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      li.appendChild(a);
      li.appendChild(el('span', 'fc-match-meta', `${item.source} · ${fmtDay(item.date)}`));
      return li;
    }));
  }

  function renderLinks(links) {
    const box = $('fc-msg-links-box');
    box.hidden = !links.length;
    $('fc-msg-links').replaceChildren(...links.map(({ url, result }) => {
      const li = el('li', 'fc-msg-link');
      if (result && result.ok) {
        const v = App.LINK_VERDICTS[result.verdict];
        li.appendChild(el('span', 'fc-rating is-' + ({ danger: 'danger', warn: 'warn', ok: 'ok' }[result.verdict] || 'info'), v.tag));
        li.appendChild(el('strong', 'fc-msg-link-domain', result.parts.domain));
      } else {
        li.appendChild(el('span', 'fc-rating is-info', 'LINK'));
        li.appendChild(el('strong', 'fc-msg-link-domain', url));
      }
      const btn = el('button', 'fc-btn fc-btn-small', 'VER ANÁLISE');
      btn.type = 'button';
      btn.addEventListener('click', () => App.openLink(url));
      li.appendChild(btn);
      return li;
    }));
  }

  async function analyze(ev) {
    ev.preventDefault();
    const status = $('fc-msg-status');
    const text = $('fc-msg-input').value;
    const rules = App.rules;
    const r = T.analyzeMessage(text, { analyzeLink: rules ? u => L.analyze(u, rules) : null });
    $('fc-msg-clear').hidden = false;
    if (!r.ok) { $('fc-msg-result').hidden = true; UI.setStatus(status, r.error, true); return; }
    UI.setStatus(status, '');
    lastText = text;

    UI.setVerdict($('fc-msg-verdict'), r.verdict, VERDICTS);
    UI.renderSignals($('fc-msg-signals'), r.signals.map(s => (s.quote ? Object.assign({}, s, { detail: s.detail + ` Trecho: "${s.quote}".` }) : s)));
    renderLinks(r.links);
    App.suggestSubject(r.subject, true);

    await loadBase();
    renderMatches(T.matchFactchecks(text, base.items, 5), 'palavras');
    $('fc-msg-smart').hidden = !window.DedsecAssist || !base.items.length;
    UI.setStatus($('fc-msg-smart-status'), '');

    $('fc-msg-result').hidden = false;
    $('fc-msg-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** Reordena pela IA local: as 40 melhores por palavra + as 300 checagens mais recentes. */
  async function smartSearch() {
    const btn = $('fc-msg-smart-btn');
    const status = $('fc-msg-smart-status');
    const AI = window.DedsecAssist;
    if (!AI || !lastText || !base) return;
    btn.disabled = true;
    const tick = setInterval(() => UI.setStatus(status, AI.statusText() || 'IA LOCAL: CARREGANDO...'), 300);
    try {
      const ok = await AI.ready();
      if (!ok) throw new Error('modelo');
      clearInterval(tick);
      UI.setStatus(status, 'COMPARANDO COM AS CHECAGENS...');
      const pool = new Map();
      for (const m of T.matchFactchecks(lastText, base.items, 40)) pool.set(m.item.link, m.item);
      for (const it of base.items.slice(0, 300)) if (!pool.has(it.link)) pool.set(it.link, it);
      const items = [...pool.values()];
      const missing = items.filter(it => !vectors.has(it.link));
      for (let i = 0; i < missing.length; i += 32) {
        const chunk = missing.slice(i, i + 32);
        const vecs = await AI.embed(chunk.map(it => it.title));
        chunk.forEach((it, k) => vectors.set(it.link, vecs[k]));
        UI.setStatus(status, `COMPARANDO... ${Math.min(100, Math.round(100 * (i + chunk.length) / missing.length))}%`);
      }
      const [q] = await AI.embed([lastText.slice(0, 600)]);
      const scored = items.map(it => {
        const v = vectors.get(it.link);
        let s = 0;
        for (let i = 0; i < q.length; i++) s += q[i] * v[i];
        return { item: it, score: s };
      }).filter(x => x.score >= SEMANTIC_MIN).sort((a, b) => b.score - a.score).slice(0, 5);
      renderMatches(scored, 'ia');
      UI.setStatus(status, scored.length ? 'PRONTO: RESULTADO DA IA LOCAL.' : 'A IA local não achou nada parecido.');
    } catch (e) {
      UI.setStatus(status, 'Não consegui carregar a IA local neste aparelho. A busca por palavras continua valendo.', true);
    } finally {
      clearInterval(tick);
      btn.disabled = false;
    }
  }

  function clear() {
    $('fc-msg-input').value = '';
    $('fc-msg-result').hidden = true;
    $('fc-msg-clear').hidden = true;
    UI.setStatus($('fc-msg-status'), '');
    $('fc-msg-input').focus();
  }

  $('fc-msg-form').addEventListener('submit', analyze);
  $('fc-msg-clear').addEventListener('click', clear);
  $('fc-msg-smart-btn').addEventListener('click', smartSearch);
  loadBase().then(b => {
    const info = $('fc-msg-base');
    if (b.items.length && b.updatedAt) info.textContent = `BASE: ${b.items.length} checagens das agências · atualizada em ${new Date(b.updatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`;
  });
})();
