/* DEDSEC - Fact Check: abas, aba LINK e "checar o assunto".
 * Carrega data/factcheck.json e avisa as outras abas (image/video/message) por window.FactCheckApp.
 */
(function () {
  'use strict';

  const L = window.FactCheckLink;
  const UI = window.FactCheckUI;
  const { el } = UI;
  const $ = id => document.getElementById(id);
  const RULES_URL = 'data/factcheck.json?v=2';

  const LINK_VERDICTS = {
    danger: { tag: 'ALERTA', text: 'Este link tem sinais fortes de golpe ou de site falso. Não abra e não repasse.' },
    warn: { tag: 'CUIDADO', text: 'Há sinais que pedem cuidado. Confira os pontos abaixo antes de abrir ou repassar.' },
    ok: { tag: 'SITE CONHECIDO', text: 'O endereço é de um site conhecido. Isso não prova que a notícia é verdadeira: confira a data e se outros veículos deram o mesmo.' },
    unknown: { tag: 'SEM ALERTAS NO ENDEREÇO', text: 'Não achei truques no endereço, mas também não conheço o site. Investigue quem está por trás e cheque o assunto.' }
  };

  /* ---------- estado compartilhado com as outras abas ---------- */
  let rules = null;
  const waiting = [];
  const App = {
    get rules() { return rules; },
    onRules(cb) { if (rules) cb(rules); else waiting.push(cb); },
    LINK_VERDICTS,
    /** Põe um assunto em "CHECAR O ASSUNTO" (se a pessoa ainda não escreveu nada) */
    suggestSubject(q, force) {
      const input = $('fc-subject-input');
      if (q && (force || !input.value.trim())) { input.value = q.slice(0, 160); updateSubject(); }
    },
    /** Abre a aba LINK já com este endereço analisado */
    openLink(url) {
      selectTab('link');
      $('fc-link-input').value = url;
      $('fc-link-form').requestSubmit();
    },
    selectTab
  };
  window.FactCheckApp = App;

  /* ---------- abas ---------- */
  const TABS = ['link', 'imagem', 'video', 'mensagem'];

  function selectTab(name, fromHash) {
    if (!TABS.includes(name)) name = 'link';
    for (const t of TABS) {
      const tab = $('fc-tab-' + t), panel = $('fc-panel-' + t);
      const on = t === name;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
      panel.hidden = !on;
    }
    if (!fromHash && location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
  }

  function initTabs() {
    for (const t of TABS) $('fc-tab-' + t).addEventListener('click', () => selectTab(t));
    $('fc-tabs').addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const cur = TABS.findIndex(t => $('fc-tab-' + t).classList.contains('is-active'));
      const next = TABS[(cur + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
      selectTab(next);
      $('fc-tab-' + next).focus();
    });
    window.addEventListener('hashchange', () => selectTab(location.hash.slice(1), true));
    selectTab(location.hash.slice(1), true);
  }

  /* ---------- aba LINK ---------- */
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
      UI.setStatus(status, r.error, true);
      return;
    }
    UI.setStatus(status, '');
    UI.setVerdict($('fc-verdict'), r.verdict, LINK_VERDICTS);
    renderHost(r);
    UI.renderSignals($('fc-signals'), r.signals);
    UI.fill($('fc-investigate'), L.investigateLinks(r));
    App.suggestSubject(r.query);
    $('fc-link-result').hidden = false;
    $('fc-link-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function clearLink() {
    $('fc-link-input').value = '';
    $('fc-link-result').hidden = true;
    $('fc-link-clear').hidden = true;
    UI.setStatus($('fc-link-status'), '');
    $('fc-link-input').focus();
  }

  /* ---------- assunto ---------- */
  function updateSubject() {
    const q = $('fc-subject-input').value.trim();
    const links = L.subjectLinks(q, rules ? rules.agencies : []);
    if (q.length < 3) {
      $('fc-subject-links').replaceChildren(el('p', 'fc-note', 'Escreva o assunto para liberar a busca.'));
      $('fc-agency-links').replaceChildren(el('p', 'fc-note', 'Escreva o assunto acima.'));
      return;
    }
    UI.fill($('fc-subject-links'), links.all);
    UI.fill($('fc-agency-links'), links.agencies, true);
  }

  /* ---------- início ---------- */
  async function init() {
    if (!L || !UI) return;
    initTabs();
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
      UI.setStatus(status, '');
      updateSubject();
      waiting.splice(0).forEach(cb => cb(rules));
    } catch (err) {
      UI.setStatus(status, 'Não consegui carregar as regras da análise. Recarregue a página.', true);
    }
  }

  init();
})();
