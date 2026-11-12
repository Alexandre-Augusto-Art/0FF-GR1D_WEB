/**
 * Content Loader - mostra os feeds gerados pelo n8n.
 *   W4K3 PR0T0C0L  -> data/reflections.json  (#w4k3-feed)
 *   Motivação      -> data/motivations.json  (#motivacao-feed)
 * Cada página ganha um selo "ATUALIZADO EM" e um aviso se o conteúdo estiver velho.
 * Conteúdo de IA é tratado como não confiável: só passam tags HTML simples.
 */
(function () {
  'use strict';

  const STALE_DAYS = 2;
  const ALLOWED_TAGS = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'A', 'H3', 'H4']);

  // ---------- util ----------
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function safeUrl(url) {
    return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null;
  }

  function externalLink(url, text, cls) {
    const href = safeUrl(url);
    if (!href) return el('span', cls, text);
    const a = el('a', cls, text);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }

  /** Converte HTML da IA em nós seguros: mantém tags simples, remove o resto (scripts, estilos, eventos). */
  function safeHtml(html) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    const frag = document.createDocumentFragment();
    (function walk(from, to) {
      for (const node of Array.from(from.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE) {
          to.appendChild(document.createTextNode(node.textContent));
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'TEMPLATE'].includes(node.tagName)) continue;
          if (ALLOWED_TAGS.has(node.tagName)) {
            const clean = document.createElement(node.tagName);
            if (node.tagName === 'A') {
              const href = safeUrl(node.getAttribute('href'));
              if (href) { clean.href = href; clean.target = '_blank'; clean.rel = 'noopener noreferrer'; }
            }
            walk(node, clean);
            to.appendChild(clean);
          } else {
            walk(node, to);
          }
        }
      }
    })(doc.body, frag);
    return frag;
  }

  function plainText(html) {
    return new DOMParser().parseFromString(String(html || ''), 'text/html').body.textContent.trim();
  }

  function parseDate(str) {
    if (!str) return null;
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(str) ? str + 'T00:00:00' : str);
    return isNaN(d) ? null : d;
  }

  function formatDate(str) {
    const d = parseDate(str);
    return d ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
  }

  /** Selo "ATUALIZADO EM ..." + aviso quando passou de STALE_DAYS sem atualização. */
  function freshnessBadge(dateStr) {
    const wrap = el('div', 'feed-meta');
    const d = parseDate(dateStr);
    if (!d) {
      wrap.appendChild(el('span', 'feed-badge feed-stale', 'DATA DE ATUALIZAÇÃO DESCONHECIDA'));
      return wrap;
    }
    wrap.appendChild(el('span', 'feed-badge', 'ATUALIZADO EM ' + formatDate(dateStr)));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = new Date(d);
    day.setHours(0, 0, 0, 0);
    const days = Math.round((today - day) / 86400000);
    if (days > STALE_DAYS) {
      wrap.appendChild(el('span', 'feed-badge feed-stale', 'SEM ATUALIZAÇÃO HÁ ' + days + ' DIAS'));
    }
    return wrap;
  }

  function messageBox(title, text) {
    const box = el('div', 'content-section');
    box.appendChild(el('h2', 'feed-title', title));
    box.appendChild(el('p', 'feed-text', text));
    return box;
  }

  async function loadJson(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  // ---------- W4K3 PR0T0C0L ----------
  function renderW4K3(container, list) {
    container.replaceChildren();
    const entries = Array.isArray(list) ? list.filter(e => e && e.reflection && e.reflection.content) : [];
    if (!entries.length) {
      container.appendChild(messageBox('NENHUMA ATUALIZAÇÃO DISPONÍVEL', 'O protocolo será atualizado em breve. Volte mais tarde.'));
      return;
    }
    const latest = entries[0];
    container.appendChild(freshnessBadge(latest.date));

    const main = el('article', 'content-section reflection-main');
    main.appendChild(el('div', 'feed-date', formatDate(latest.date)));
    main.appendChild(el('h2', 'feed-title', plainText(latest.reflection.title) || 'Reflexão do dia'));

    const news = latest.news;
    if (news && news.title && plainText(news.title) !== plainText(latest.reflection.title)) {
      const base = el('div', 'news-base');
      base.appendChild(el('div', 'news-base-label', 'NOTÍCIA BASE'));
      base.appendChild(externalLink(news.link, plainText(news.title), 'news-base-title'));
      const meta = [news.source, formatDate(news.publishedDate)].filter(Boolean).join(' | ');
      if (meta) base.appendChild(el('div', 'news-base-meta', 'Fonte: ' + meta));
      main.appendChild(base);
    }

    const body = el('div', 'reflection-body');
    body.appendChild(safeHtml(latest.reflection.content));
    main.appendChild(body);

    if (Array.isArray(latest.tags) && latest.tags.length) {
      const tags = el('div', 'feed-tags');
      latest.tags.forEach(t => tags.appendChild(el('span', 'feed-tag', '#' + t)));
      main.appendChild(tags);
    }
    container.appendChild(main);

    const sources = (latest.sources || []).filter(s => s && s.title && safeUrl(s.link));
    if (sources.length) {
      const sec = el('section', 'content-section');
      sec.appendChild(el('h2', 'feed-title', 'FONTES'));
      const ul = el('ul', 'source-list');
      sources.forEach(s => {
        const li = el('li');
        li.appendChild(externalLink(s.link, plainText(s.title), 'source-title'));
        const meta = [s.source, formatDate(s.date)].filter(Boolean).join(' | ');
        if (meta) li.appendChild(el('div', 'source-meta', meta));
        ul.appendChild(li);
      });
      sec.appendChild(ul);
      container.appendChild(sec);
    }

    if (entries.length > 1) {
      const sec = el('section', 'content-section');
      sec.appendChild(el('h2', 'feed-title', 'HISTÓRICO'));
      entries.slice(1, 11).forEach(e => {
        const item = el('div', 'history-item');
        item.appendChild(el('div', 'feed-date', formatDate(e.date)));
        item.appendChild(el('h3', 'history-title', plainText(e.reflection.title) || 'Reflexão'));
        const excerpt = plainText(e.reflection.excerpt || e.reflection.content);
        item.appendChild(el('p', 'feed-text', excerpt.length > 220 ? excerpt.slice(0, 220) + '...' : excerpt));
        sec.appendChild(item);
      });
      container.appendChild(sec);
    }
  }

  // ---------- Motivação Diária ----------
  function renderMotivacao(container, list) {
    container.replaceChildren();
    const entries = Array.isArray(list) ? list.filter(e => e && typeof e.content === 'string' && e.content.trim()) : [];
    if (!entries.length) {
      container.appendChild(messageBox('MENSAGEM DO DIA', 'A mensagem de hoje ainda não chegou. Volte mais tarde.'));
      return;
    }
    const latest = entries[0];
    container.appendChild(freshnessBadge(latest.date));

    const main = el('section', 'content-section');
    main.appendChild(el('h2', 'feed-title feed-title-green', 'MENSAGEM DO DIA'));
    main.appendChild(el('blockquote', 'motivation-quote', '"' + latest.content.trim() + '"'));
    if (latest.author) main.appendChild(el('div', 'motivation-author', '— ' + latest.author));
    container.appendChild(main);

    if (entries.length > 1) {
      const sec = el('section', 'content-section');
      sec.appendChild(el('h2', 'feed-title feed-title-green', 'FRASES ANTERIORES'));
      entries.slice(1, 21).forEach(e => {
        const item = el('div', 'history-item');
        item.appendChild(el('div', 'feed-date', formatDate(e.date)));
        item.appendChild(el('p', 'feed-text feed-italic', '"' + e.content.trim() + '"'));
        sec.appendChild(item);
      });
      container.appendChild(sec);
    }
  }

  // ---------- init ----------
  const FEEDS = [
    { id: 'w4k3-feed', url: 'data/reflections.json', render: renderW4K3, error: 'ERRO AO CARREGAR O PROTOCOLO' },
    { id: 'motivacao-feed', url: 'data/motivations.json', render: renderMotivacao, error: 'ERRO AO CARREGAR A MENSAGEM' }
  ];

  async function init() {
    for (const feed of FEEDS) {
      const container = document.getElementById(feed.id);
      if (!container) continue;
      try {
        feed.render(container, await loadJson(feed.url));
      } catch (err) {
        console.error('[feeds] ' + feed.url, err);
        container.replaceChildren(messageBox(feed.error, 'Não foi possível carregar o conteúdo agora. Tente recarregar a página.'));
      }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
