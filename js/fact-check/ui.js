/* DEDSEC - Fact Check: peças de tela usadas por todas as abas.
 * Todo texto entra com textContent: nada do que a pessoa cola ou envia vira HTML.
 */
(function () {
  'use strict';

  const ICONS = { danger: '✖', warn: '!', ok: '✔', info: 'i' };
  const ORDER = { danger: 0, warn: 1, ok: 2, info: 3 };

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  /** Botão que abre um site externo numa nova aba, sem mandar de onde veio. */
  function linkButton(item, small) {
    const a = el('a', small ? 'fc-btn fc-btn-small' : 'fc-btn fc-btn-link');
    a.href = item.href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.appendChild(el('span', 'fc-btn-label', item.label + (/↗$/.test(item.label) ? '' : ' ↗')));
    if (item.note) a.appendChild(el('span', 'fc-btn-note', item.note));
    return a;
  }

  function fill(container, items, small) {
    container.replaceChildren(...items.map(i => linkButton(i, small)));
  }

  /** Caixa do veredito: { tag, text } por nível. */
  function setVerdict(box, verdict, texts) {
    const v = texts[verdict] || texts.unknown;
    box.className = 'fc-verdict is-' + verdict;
    box.replaceChildren(el('span', 'fc-verdict-tag', v.tag), el('p', 'fc-verdict-text', v.text));
  }

  function renderSignals(list, signals) {
    list.replaceChildren(...signals.slice().sort((a, b) => ORDER[a.level] - ORDER[b.level]).map(s => {
      const li = el('li', 'fc-signal is-' + s.level);
      li.appendChild(el('span', 'fc-signal-icon', ICONS[s.level]));
      const body = el('div', 'fc-signal-body');
      body.appendChild(el('strong', 'fc-signal-title', s.title));
      body.appendChild(el('p', 'fc-signal-detail', s.detail));
      if (s.link) {
        const a = linkButton(s.link, true);
        a.classList.add('fc-signal-link');
        body.appendChild(a);
      }
      li.appendChild(body);
      return li;
    }));
  }

  function setStatus(node, text, isError) {
    node.textContent = text || '';
    node.classList.toggle('is-error', !!isError);
  }

  /** Busca reversa: os sites recebem o arquivo só se a pessoa enviar por lá. */
  const REVERSE_SEARCH = [
    { label: 'GOOGLE LENS', note: 'mais completo; envie a imagem por lá', href: 'https://lens.google.com/' },
    { label: 'TINEYE', note: 'mostra a cópia mais antiga', href: 'https://tineye.com/' },
    { label: 'BING VISUAL', note: 'outra base de imagens', href: 'https://www.bing.com/visualsearch' },
    { label: 'YANDEX IMAGENS', note: 'bom para rostos e lugares', href: 'https://yandex.com/images/' },
    { label: 'FACT CHECK EXPLORER', note: 'aceita imagem: já checaram?', href: 'https://toolbox.google.com/factcheck/explorer/search/list:recent;hl=pt-BR' }
  ];

  window.FactCheckUI = { el, linkButton, fill, setVerdict, renderSignals, setStatus, REVERSE_SEARCH };
})();
