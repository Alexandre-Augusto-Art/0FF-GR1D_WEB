/* DEDSEC ASSIST - chatbot local
 * Busca semântica no navegador com Transformers.js. Nada é enviado a servidores:
 * o modelo é baixado uma vez (fica em cache) e as perguntas são processadas no aparelho.
 * Enquanto o modelo carrega (ou se falhar), usa busca por palavras-chave.
 * Uso: <script src="js/chatbot.js" defer></script>
 */
(function () {
  'use strict';

  const SCRIPT_URL = document.currentScript ? document.currentScript.src : location.href;
  const KB_URL = new URL('../data/chatbot.json', SCRIPT_URL).href;
  const CSS_URL = new URL('../css/chatbot.css', SCRIPT_URL).href;
  const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2/dist/transformers.min.js';
  const MODEL_ID = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
  const SEMANTIC_THRESHOLD = 0.5;
  const KEYWORD_BONUS = 0.08;

  const STOPWORDS = new Set(('a o as os um uma uns umas de do da dos das em no na nos nas por para pra com sem e ou que ' +
    'se me te eu voce voces ele ela isso isto esse essa este esta aqui ai la como qual quais quando onde ' +
    'quero queria tem ter tenho sobre mais muito pouco ja nao sim e eh ser sao estou esta meu minha seu sua ' +
    'algum alguma coisa favor oi ola fala explica explicar saber').split(' '));

  let kb = null;
  let extractor = null;       // pipeline do Transformers.js
  let kbVectors = null;       // [{entry, vec}]
  let modelState = 'idle';    // idle | loading | ready | error
  let els = {};

  // ---------- util ----------
  function normalize(text) {
    return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function tokens(text) {
    return normalize(text).split(' ').filter(t => t.length > 1 && !STOPWORDS.has(t));
  }
  function dot(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }

  // ---------- busca por palavras-chave (fallback) ----------
  function keywordScore(entry, q) {
    if (!entry._kw) {
      entry._kw = new Set(entry.keywords.map(normalize));
      entry._ex = new Set(entry.examples.flatMap(tokens));
    }
    let score = 0;
    for (const t of q) {
      if (entry._kw.has(t)) score += 2;
      else if (entry._ex.has(t)) score += 1;
      else if (t.length > 4 && [...entry._kw].some(k => k.startsWith(t.slice(0, 5)))) score += 1;
    }
    return score;
  }

  function keywordMatch(query) {
    const q = tokens(query);
    if (!q.length) return null;
    let best = null;
    let bestScore = 0;
    for (const entry of kb.entries) {
      const score = keywordScore(entry, q);
      if (score > bestScore) { bestScore = score; best = entry; }
    }
    return bestScore >= 2 ? best : null;
  }

  // ---------- busca semântica ----------
  async function embed(texts) {
    const out = await extractor(texts, { pooling: 'mean', normalize: true });
    return out.tolist();
  }

  async function loadModel() {
    if (modelState !== 'idle') return;
    modelState = 'loading';
    setStatus('IA LOCAL: CARREGANDO...');
    try {
      const { pipeline, env } = await import(TRANSFORMERS_URL);
      env.allowLocalModels = false;
      const files = {};
      extractor = await pipeline('feature-extraction', MODEL_ID, {
        progress_callback: (p) => {
          if (p.status === 'progress' && p.total) {
            files[p.file] = { loaded: p.loaded, total: p.total };
            const all = Object.values(files);
            const pct = Math.round(100 * all.reduce((s, f) => s + f.loaded, 0) / all.reduce((s, f) => s + f.total, 0));
            setStatus('IA LOCAL: BAIXANDO ' + pct + '%');
          }
        }
      });
      setStatus('IA LOCAL: INDEXANDO...');
      const items = [];
      for (const entry of kb.entries) {
        for (const ex of [entry.title, ...entry.examples]) items.push({ entry, text: ex });
      }
      const vecs = await embed(items.map(i => i.text));
      kbVectors = items.map((it, i) => ({ entry: it.entry, vec: vecs[i] }));
      modelState = 'ready';
      setStatus('IA LOCAL: ATIVA', 'ok');
    } catch (err) {
      console.warn('[DEDSEC ASSIST] IA local indisponível, usando modo básico.', err);
      modelState = 'error';
      setStatus('MODO BÁSICO', 'warn');
    }
  }

  // Nota final = similaridade semântica (melhor exemplo da entrada) + bônus por palavra-chave.
  async function semanticMatch(query) {
    const [qv] = await embed([query]);
    const q = tokens(query);
    const sem = new Map();
    for (const item of kbVectors) {
      const s = dot(qv, item.vec);
      if (s > (sem.get(item.entry) ?? -1)) sem.set(item.entry, s);
    }
    let best = null;
    let bestScore = -1;
    for (const [entry, s] of sem) {
      const score = s + KEYWORD_BONUS * Math.min(keywordScore(entry, q), 4);
      if (score > bestScore) { bestScore = score; best = entry; }
    }
    return { entry: best, score: bestScore };
  }

  async function findAnswer(query) {
    if (modelState === 'ready') {
      try {
        const { entry, score } = await semanticMatch(query);
        if (score >= SEMANTIC_THRESHOLD) return entry;
      } catch (err) {
        console.warn('[DEDSEC ASSIST] erro na busca semântica', err);
      }
    }
    return keywordMatch(query);
  }

  // ---------- UI ----------
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function setStatus(text, kind) {
    if (!els.status) return;
    els.status.textContent = text;
    els.status.dataset.kind = kind || '';
  }

  function scrollDown() {
    els.log.scrollTop = els.log.scrollHeight;
  }

  function addMessage(who, text) {
    const msg = el('div', 'dsa-msg dsa-' + who);
    msg.appendChild(el('span', 'dsa-prefix', who === 'bot' ? 'DEDSEC>' : 'VOCÊ>'));
    msg.appendChild(el('p', 'dsa-text', text));
    els.log.appendChild(msg);
    scrollDown();
    return msg;
  }

  function addAnswer(entry) {
    const msg = addMessage('bot', entry.answer);
    if (entry.soon) {
      msg.appendChild(el('span', 'dsa-soon', 'EM BREVE'));
    } else if (entry.link) {
      const target = new URL(entry.link, new URL('../', SCRIPT_URL));
      const clean = (p) => p.replace(/index\.html$/, '');
      const here = clean(target.pathname) === clean(location.pathname);
      if (!here) {
        const a = el('a', 'dsa-link', entry.linkLabel || ('ABRIR ' + entry.title.toUpperCase() + ' →'));
        a.href = target.href;
        if (/^https?:/.test(entry.link)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
        msg.appendChild(a);
      }
    }
    scrollDown();
  }

  function addChips() {
    const wrap = el('div', 'dsa-chips');
    for (const entry of kb.entries) {
      if (entry.id === 'jogos') continue;
      const b = el('button', 'dsa-chip', entry.title);
      b.type = 'button';
      b.addEventListener('click', () => {
        wrap.remove();
        addMessage('user', entry.title);
        addAnswer(entry);
      });
      wrap.appendChild(b);
    }
    els.log.appendChild(wrap);
    scrollDown();
  }

  async function handleQuestion(text) {
    const q = text.trim();
    if (!q) return;
    els.log.querySelectorAll('.dsa-chips').forEach(c => c.remove());
    addMessage('user', q);
    els.input.disabled = true;
    const typing = addMessage('bot', '...');
    typing.classList.add('dsa-typing');
    const entry = await findAnswer(q);
    typing.remove();
    els.input.disabled = false;
    els.input.focus();
    if (entry) {
      addAnswer(entry);
    } else {
      addMessage('bot', kb.fallback);
      addChips();
    }
  }

  function build() {
    const css = el('link');
    css.rel = 'stylesheet';
    css.href = CSS_URL;
    document.head.appendChild(css);

    const toggle = el('button', 'dsa-toggle', '>_');
    toggle.type = 'button';
    toggle.setAttribute('aria-label', 'Abrir assistente DEDSEC');
    toggle.setAttribute('aria-expanded', 'false');

    const panel = el('section', 'dsa-panel');
    panel.setAttribute('aria-label', 'Assistente DEDSEC');
    panel.hidden = true;

    const head = el('header', 'dsa-head');
    const titles = el('div');
    titles.appendChild(el('strong', 'dsa-title', 'DEDSEC://ASSIST'));
    els.status = el('span', 'dsa-status', 'IA LOCAL: EM ESPERA');
    titles.appendChild(els.status);
    const close = el('button', 'dsa-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Fechar assistente');
    head.append(titles, close);

    els.log = el('div', 'dsa-log');
    els.log.setAttribute('aria-live', 'polite');

    const form = el('form', 'dsa-form');
    els.input = el('input', 'dsa-input');
    els.input.type = 'text';
    els.input.placeholder = 'Pergunte sobre o site...';
    els.input.maxLength = 200;
    els.input.setAttribute('aria-label', 'Sua pergunta');
    const send = el('button', 'dsa-send', 'ENVIAR');
    send.type = 'submit';
    form.append(els.input, send);

    panel.append(head, els.log, form);
    document.body.append(panel, toggle);

    let started = false;
    function open(state) {
      panel.hidden = !state;
      toggle.setAttribute('aria-expanded', String(state));
      toggle.classList.toggle('dsa-active', state);
      if (state) {
        if (!started) {
          started = true;
          addMessage('bot', kb.greeting);
          addChips();
          loadModel();
        }
        els.input.focus();
      }
    }
    toggle.addEventListener('click', () => open(panel.hidden));
    close.addEventListener('click', () => open(false));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) open(false); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = els.input.value;
      els.input.value = '';
      handleQuestion(v);
    });
  }

  async function init() {
    try {
      const res = await fetch(KB_URL);
      kb = await res.json();
    } catch (err) {
      console.warn('[DEDSEC ASSIST] não foi possível carregar data/chatbot.json', err);
      return;
    }
    build();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
