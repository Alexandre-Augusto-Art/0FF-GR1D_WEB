/* DEDSEC - Fact Check: tela
 * Carrega data/factcheck.json, roda a análise de js/fact-check/link.js e monta o resultado.
 * Todo texto entra com textContent: nada do link colado vira HTML.
 */
(function () {
  'use strict';

  const L = window.FactCheckLink;
  const $ = id => document.getElementById(id);
  const RULES_URL = 'data/factcheck.json?v=1';

  const VERDICTS = {
    danger: { tag: 'ALERTA', text: 'Este link tem sinais fortes de golpe ou de site falso. Não abra e não repasse.' },
    warn: { tag: 'CUIDADO', text: 'Há sinais que pedem cuidado. Confira os pontos abaixo antes de abrir ou repassar.' },
    ok: { tag: 'SITE CONHECIDO', text: 'O endereço é de um site conhecido. Isso não prova que a notícia é verdadeira: confira a data e se outros veículos deram o mesmo.' },
    unknown: { tag: 'SEM ALERTAS NO ENDEREÇO', text: 'Não achei truques no endereço, mas também não conheço o site. Investigue quem está por trás e cheque o assunto.' }
  };
  const ICONS = { danger: '✖', warn: '!', ok: '✔', info: 'i' };

  let rules = null;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function linkButton(item, small) {
    const a = el('a', small ? 'fc-btn fc-btn-small' : 'fc-btn fc-btn-link');
    a.href = item.href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.appendChild(el('span', 'fc-btn-label', item.label + ' ↗'));
    if (item.note) a.appendChild(el('span', 'fc-btn-note', item.note));
    return a;
  }

  function fill(container, items, small) {
    container.replaceChildren(...items.map(i => linkButton(i, small)));
  }

  /* ---------- link ---------- */
  function renderHost(r) {
    const box = $('fc-host');
    box.replaceChildren();
    box.appendChild(el('span', 'fc-host-dim', r.url.protocol + '//'));
    if (r.url.username) box.appendChild(el('span', 'fc-host-fake', decodeURIComponent(r.url.username) + '@'));
    const shown = r.hostUnicode !== r.host ? r.hostUnicode : r.host;
    const domain = r.hostUnicode !== r.host ? L.hostToUnicode(r.parts.domain) : r.parts.domain;
    const before = shown.slice(0, shown.length - domain.length);
    if (before) box.appendChild(el('span', 'fc-host-dim', before));
    box.appendChild(el('strong', 'fc-host-domain', domain));
    const rest = r.url.pathname + r.url.search;
    if (rest && rest !== '/') box.appendChild(el('span', 'fc-host-dim', rest.length > 80 ? rest.slice(0, 80) + '…' : rest));
    if (r.hostUnicode !== r.host) box.appendChild(el('span', 'fc-host-real', 'nome real: ' + r.host));
  }

  function analyzeLink(ev) {
    ev.preventDefault();
    if (!rules) return;
    const status = $('fc-link-status');
    const r = L.analyze($('fc-link-input').value, rules);
    $('fc-link-clear').hidden = false;
    if (!r.ok) {
      $('fc-link-result').hidden = true;
      status.textContent = r.error;
      status.classList.add('is-error');
      return;
    }
    status.textContent = '';
    status.classList.remove('is-error');

    const v = VERDICTS[r.verdict];
    const verdict = $('fc-verdict');
    verdict.className = 'fc-verdict is-' + r.verdict;
    $('fc-verdict-tag').textContent = v.tag;
    $('fc-verdict-text').textContent = v.text;

    renderHost(r);

    const order = { danger: 0, warn: 1, ok: 2, info: 3 };
    const list = $('fc-signals');
    list.replaceChildren(...r.signals.slice().sort((a, b) => order[a.level] - order[b.level]).map(s => {
      const li = el('li', 'fc-signal is-' + s.level);
      li.appendChild(el('span', 'fc-signal-icon', ICONS[s.level]));
      const body = el('div', 'fc-signal-body');
      body.appendChild(el('strong', 'fc-signal-title', s.title));
      body.appendChild(el('p', 'fc-signal-detail', s.detail));
      li.appendChild(body);
      return li;
    }));

    fill($('fc-investigate'), L.investigateLinks(r));

    if (r.query && !$('fc-subject-input').value.trim()) {
      $('fc-subject-input').value = r.query;
      updateSubject();
    }

    $('fc-link-result').hidden = false;
    $('fc-link-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function clearLink() {
    $('fc-link-input').value = '';
    $('fc-link-result').hidden = true;
    $('fc-link-clear').hidden = true;
    $('fc-link-status').textContent = '';
    $('fc-link-status').classList.remove('is-error');
    $('fc-link-input').focus();
  }

  /* ---------- assunto ---------- */
  function updateSubject() {
    const q = $('fc-subject-input').value.trim();
    const links = L.subjectLinks(q, rules ? rules.agencies : []);
    const box = $('fc-subject-links');
    const agencies = $('fc-agency-links');
    if (q.length < 3) {
      box.replaceChildren(el('p', 'fc-note', 'Escreva o assunto para liberar a busca.'));
      agencies.replaceChildren(el('p', 'fc-note', 'Escreva o assunto acima.'));
      return;
    }
    fill(box, links.all);
    fill(agencies, links.agencies, true);
  }

  /* ---------- início ---------- */
  async function init() {
    if (!L) return;
    const status = $('fc-link-status');
    $('fc-link-form').addEventListener('submit', analyzeLink);
    $('fc-link-clear').addEventListener('click', clearLink);
    $('fc-link-input').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('fc-link-form').requestSubmit(); }
    });
    $('fc-subject-form').addEventListener('submit', e => e.preventDefault());
    $('fc-subject-input').addEventListener('input', updateSubject);
    updateSubject();

    try {
      const res = await fetch(RULES_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      rules = await res.json();
      $('fc-link-submit').disabled = false;
      status.textContent = '';
      updateSubject();
    } catch (err) {
      status.textContent = 'Não consegui carregar as regras da análise. Recarregue a página.';
      status.classList.add('is-error');
    }
  }

  init();
})();
