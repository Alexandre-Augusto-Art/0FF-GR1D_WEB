/* DEDSEC - Fact Check: análise de links
 *
 * Olha só o ENDEREÇO: o site nunca é aberto nem baixado, e nada sai do aparelho.
 * Funções puras, sem DOM: o navegador usa window.FactCheckLink e os testes usam require().
 * As listas (sites oficiais, encurtadores, palavras de golpe...) vêm de data/factcheck.json.
 */
(function (root) {
  'use strict';

  // Finais de domínio com duas partes: em "noticias.uol.com.br" o site é "uol.com.br".
  const MULTI_SUFFIXES = new Set([
    'com.br', 'gov.br', 'org.br', 'net.br', 'edu.br', 'art.br', 'blog.br', 'jus.br', 'leg.br', 'mp.br',
    'mil.br', 'ind.br', 'inf.br', 'tv.br', 'eco.br', 'app.br', 'dev.br', 'log.br', 'nom.br', 'emp.br',
    'co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'com.ar', 'com.pt', 'com.mx', 'com.au', 'co.jp', 'co.in', 'com.co'
  ]);

  /* ---------- Punycode (RFC 3492): mostra "xn--pple-43d" como "аpple" ---------- */
  function punyDecode(input) {
    const base = 36, tMin = 1, tMax = 26, skew = 38, damp = 700;
    const out = [];
    let i = 0, n = 128, bias = 72;
    let b = input.lastIndexOf('-');
    if (b < 0) b = 0;
    for (let j = 0; j < b; j++) out.push(input.charCodeAt(j));
    const adapt = (delta, numPoints, first) => {
      delta = first ? Math.floor(delta / damp) : delta >> 1;
      delta += Math.floor(delta / numPoints);
      let k = 0;
      while (delta > ((base - tMin) * tMax) >> 1) { delta = Math.floor(delta / (base - tMin)); k += base; }
      return k + Math.floor(((base - tMin + 1) * delta) / (delta + skew));
    };
    for (let idx = b > 0 ? b + 1 : 0; idx < input.length;) {
      const oldi = i;
      for (let w = 1, k = base; ; k += base) {
        if (idx >= input.length) throw new Error('punycode inválido');
        const c = input.charCodeAt(idx++);
        const digit = c - 48 < 10 ? c - 22 : c - 65 < 26 ? c - 65 : c - 97 < 26 ? c - 97 : base;
        if (digit >= base) throw new Error('punycode inválido');
        i += digit * w;
        const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
        if (digit < t) break;
        w *= base - t;
      }
      bias = adapt(i - oldi, out.length + 1, oldi === 0);
      n += Math.floor(i / (out.length + 1));
      i %= out.length + 1;
      out.splice(i++, 0, n);
    }
    return String.fromCodePoint(...out);
  }

  function hostToUnicode(host) {
    return host.split('.').map(l => {
      if (!l.startsWith('xn--')) return l;
      try { return punyDecode(l.slice(4)); } catch (e) { return l; }
    }).join('.');
  }

  /* ---------- utilidades ---------- */
  function stripAccents(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

  function levenshtein(a, b) {
    if (a === b) return 0;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  /** Desfaz trocas visuais e letras dobradas: "g1obo" e "gloobo" viram "globo". */
  function confusable(s) {
    return s.replace(/rn/g, 'm').replace(/vv/g, 'w').replace(/cl/g, 'd')
      .replace(/[0]/g, 'o').replace(/[1i|]/g, 'l').replace(/3/g, 'e').replace(/4/g, 'a')
      .replace(/5/g, 's').replace(/7/g, 't').replace(/(.)\1+/g, '$1');
  }

  function isIp(host) { return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('['); }

  /** "noticias.g1.globo.com" -> { domain: "globo.com", label: "globo", suffix: "com", sub: "noticias.g1" } */
  function splitHost(host) {
    if (isIp(host)) return { domain: host, label: host, suffix: '', sub: '' };
    const parts = host.split('.');
    const two = parts.slice(-2).join('.');
    const suffixLen = parts.length > 2 && MULTI_SUFFIXES.has(two) ? 2 : 1;
    const suffix = parts.slice(-suffixLen).join('.');
    const label = parts[parts.length - suffixLen - 1] || '';
    return {
      domain: parts.slice(-suffixLen - 1).join('.'),
      label,
      suffix,
      sub: parts.slice(0, Math.max(0, parts.length - suffixLen - 1)).join('.')
    };
  }

  /** Acha o primeiro link num texto (dá para colar a mensagem inteira do WhatsApp). */
  function extractUrl(text) {
    const s = String(text || '').trim();
    if (!s) return '';
    const full = s.match(/\bhttps?:\/\/[^\s<>"'`]+/i);
    let found = full ? full[0] : '';
    if (!found) {
      const bare = s.match(/(?:^|[\s(<])((?:[a-z0-9¡-￿-]+\.)+[a-z¡-￿]{2,}(?::\d+)?(?:[/?#][^\s<>"'`]*)?)/i);
      found = bare ? bare[1] : '';
    }
    return found.replace(/[).,;:!?\]}>»"']+$/, '');
  }

  /** Tenta tirar o assunto do endereço: ".../2026/11/lula-anuncia-novo-programa.html" -> "lula anuncia novo programa" */
  function slugToQuery(url) {
    const segs = url.pathname.split('/').map(s => {
      try { return decodeURIComponent(s); } catch (e) { return s; }
    });
    let best = '';
    for (const seg of segs) {
      const words = seg.replace(/\.[a-z0-9]{2,5}$/i, '').split(/[-_+]+/)
        .filter(w => w && !/^\d+$/.test(w) && !/^(noticia|noticias|html|amp|index|post|artigo)$/i.test(w));
      const q = words.join(' ');
      if (words.length >= 3 && q.length > best.length) best = q;
    }
    return best.slice(0, 120);
  }

  /* ---------- análise ---------- */
  const LEVEL_RANK = { info: 0, ok: 0, warn: 1, danger: 2 };

  /**
   * @param {string} input  link ou texto com um link
   * @param {object} cfg    conteúdo de data/factcheck.json
   * @returns {{ ok:boolean, error?:string, url?:URL, host?:string, hostUnicode?:string, parts?:object,
   *             trusted?:object|null, signals?:Array<{level,title,detail}>, verdict?:string, query?:string }}
   */
  function analyze(input, cfg) {
    const raw = extractUrl(input);
    if (!raw) return { ok: false, error: 'Não encontrei um link. Cole o endereço completo (ex.: https://site.com/noticia).' };

    let url;
    try {
      url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^[^:/]+\.[^:/]+:\d/.test(raw) ? raw : 'https://' + raw);
    } catch (e) {
      return { ok: false, error: 'Esse endereço não parece um link válido.' };
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { ok: false, error: 'Só analiso links http:// ou https://. Links "javascript:" ou "data:" nunca devem ser abertos.' };
    }

    const host = url.hostname.replace(/\.$/, '').toLowerCase();
    const hostUnicode = hostToUnicode(host);
    const parts = splitHost(host);
    const signals = [];
    const add = (level, title, detail) => signals.push({ level, title, detail });

    const trustedList = Array.isArray(cfg && cfg.trusted) ? cfg.trusted : [];
    const trusted = trustedList.find(t => t.domains.some(d => host === d || host.endsWith('.' + d))) || null;

    const pathTokens = stripAccents(url.pathname + ' ' + url.search).split(/[^a-z0-9]+/).filter(Boolean);
    const hostTokens = host.split(/[.-]/).filter(Boolean);
    const riskyTld = (cfg.riskyTlds || []).includes(parts.suffix.split('.').pop());
    const scamHits = [...new Set((cfg.scamWords || []).filter(w => hostTokens.includes(w) || pathTokens.includes(w)))];

    // 1. Disfarces no próprio endereço
    if (url.username || url.password) {
      add('danger', 'ENDEREÇO DISFARÇADO',
        `Tudo antes do "@" é ignorado pelo navegador. Este link leva para ${host}, e não para "${decodeURIComponent(url.username)}".`);
    }
    if (isIp(host)) {
      add('danger', 'SEM NOME DE SITE',
        'O link usa só números (endereço IP) no lugar do nome do site. Sites de notícia e bancos não fazem isso.');
    }
    if (host.split('.').some(l => l.startsWith('xn--'))) {
      add('danger', 'LETRAS DISFARÇADAS',
        `O nome usa letras de outros alfabetos que parecem iguais às nossas. Aparece como "${hostUnicode}", mas é outro site: ${host}.`);
    }

    // 2. Site conhecido ou imitação
    if (trusted && trusted.type === 'plataforma') {
      add('info', 'REDE SOCIAL: QUEM POSTOU?',
        `${parts.domain} é mesmo o ${trusted.name}, mas qualquer pessoa publica lá. O site ser verdadeiro não diz nada ` +
        'sobre o conteúdo: veja quem é o perfil, desde quando existe e se a informação aparece em veículos de imprensa.');
    } else if (trusted) {
      const what = {
        imprensa: 'veículo de imprensa', checagem: 'agência de checagem', governo: 'site do governo', servico: 'serviço'
      }[trusted.type] || 'site';
      add('ok', 'SITE OFICIAL', `${parts.domain} é o endereço oficial de ${trusted.name} (${what}).`);
    } else if (!isIp(host)) {
      const labelFlat = parts.label.replace(/-/g, '');
      let imitated = null;
      for (const t of trustedList) {
        for (const d of t.domains) {
          const off = splitHost(d);
          const offFlat = off.label.replace(/-/g, '');
          if (offFlat.length < 3) continue;
          if (labelFlat === offFlat) {
            if (parts.domain !== off.domain) imitated = { t, why: `tem o mesmo nome de ${d}, mas termina em ".${parts.suffix}"` };
          } else if (offFlat.length >= 4 && confusable(labelFlat) === confusable(offFlat)) {
            imitated = { t, why: `troca letras parecidas (0 por o, 1 por l, rn por m...) para parecer ${d}` };
          } else if (offFlat.length >= 8) {
            // Nomes curtos ficam de fora: "baixa" está a uma letra de "caixa" e não é golpe.
            const dist = levenshtein(labelFlat, offFlat);
            if (dist <= 2) imitated = { t, why: `é quase igual a ${d}, com ${dist === 1 ? 'uma letra' : 'duas letras'} de diferença` };
          }
          if (imitated) break;
        }
        if (imitated) break;
      }
      if (imitated) {
        add('danger', `IMITA ${imitated.t.name.toUpperCase()}`,
          `"${parts.domain}" ${imitated.why}. É um truque comum para parecer o site verdadeiro.`);
      } else {
        const flatHost = hostTokens.join('');
        // Sites de governo de outros países (nasa.gov, gov.uk) não fingem ser o gov.br.
        const foreignGov = /^(gov|mil)(\.|$)/.test(parts.suffix);
        const brandHit = trustedList.find(t => !(foreignGov && t.type === 'governo') && (t.brands || []).some(b =>
          hostTokens.includes(b) || (b.length >= 6 && flatHost.includes(b))));
        if (brandHit) {
          const serious = brandHit.type === 'governo' || ((brandHit.type === 'servico' || brandHit.type === 'imprensa') && (riskyTld || scamHits.length));
          add(serious ? 'danger' : 'warn', `USA O NOME DE ${brandHit.name.toUpperCase()}`,
            `O endereço tem o nome "${brandHit.name}", mas o site de verdade é ${parts.domain}, que não é o oficial ` +
            `(${brandHit.domains.join(', ')}).`);
        }
      }
    }

    // 3. Outros sinais
    if ((cfg.shorteners || []).some(d => host === d || host.endsWith('.' + d))) {
      add('warn', 'LINK ENCURTADO',
        'Não dá para saber para onde ele leva sem abrir. Peça o link completo a quem mandou ou procure a notícia pelo título.');
    }
    if (url.protocol === 'http:') {
      add('warn', 'SEM CADEADO (HTTP)', 'A conexão não é protegida. Nunca digite senha, CPF ou dados de cartão num site assim.');
    }
    if (riskyTld && !trusted) {
      add('warn', `FINAL ".${parts.suffix.toUpperCase()}"`, 'Esse final de endereço é barato e muito usado em golpes e sites de boato. Não é prova, mas pede cuidado.');
    }
    const lastSeg = url.pathname.split('/').pop().toLowerCase();
    const ext = (lastSeg.match(/\.([a-z0-9]{1,4})$/) || [])[1];
    if (ext && (cfg.dangerousExtensions || []).includes(ext)) {
      add('danger', `BAIXA UM ARQUIVO .${ext.toUpperCase()}`,
        'Este link não é uma notícia: ele baixa um arquivo que pode instalar um programa no seu aparelho. Não abra.');
    }
    if (scamHits.length && !trusted) {
      add('warn', 'PALAVRAS DE GOLPE', `O endereço tem ${scamHits.map(w => `"${w}"`).join(', ')}. Golpes de Pix, prêmio e "regularize seu cadastro" usam essas palavras.`);
    }
    if (parts.sub.split('.').filter(Boolean).length >= 3) {
      add('warn', 'ENDEREÇO COMPRIDO DEMAIS', `Muitas partes antes do site de verdade (${parts.domain}). Isso costuma servir para esconder o nome real.`);
    }
    if (/\d{4,}/.test(parts.label) || parts.label.length > 30) {
      add('warn', 'NOME ESQUISITO', `"${parts.label}" não parece o nome de um site sério: muitos números ou letras.`);
    }
    if (url.port) add('warn', 'PORTA INCOMUM', `O link usa a porta ${url.port}. Sites comuns não aparecem assim.`);

    if (!trusted && !signals.some(s => s.level !== 'info')) {
      add('info', 'SITE DESCONHECIDO',
        `Não temos ${parts.domain} na nossa lista. Isso não é ruim por si só: veja quem é o dono do site e se outros veículos dão a mesma notícia.`);
    }

    const top = signals.reduce((m, s) => Math.max(m, LEVEL_RANK[s.level]), 0);
    const verdict = top === 2 ? 'danger' : top === 1 ? 'warn' : trusted && trusted.type !== 'plataforma' ? 'ok' : 'unknown';

    return { ok: true, url, host, hostUnicode, parts, trusted, signals, verdict, query: slugToQuery(url) };
  }

  /* ---------- links das ferramentas externas (só abrem se a pessoa clicar) ---------- */
  function investigateLinks(result) {
    const href = result.url.href;
    const domain = result.parts.domain;
    const whois = /\.br$/.test(domain)
      ? `https://registro.br/tecnologia/ferramentas/whois/?search=${encodeURIComponent(domain)}`
      : `https://lookup.icann.org/pt/lookup?name=${encodeURIComponent(domain)}`;
    return [
      { label: 'QUEM É O DONO DO SITE', note: 'consulta o registro do domínio', href: whois },
      { label: 'HISTÓRICO NO WAYBACK MACHINE', note: 'versões antigas da página', href: `https://web.archive.org/web/*/${href}` },
      { label: 'SITE PERIGOSO? (GOOGLE)', note: 'lista de sites de golpe e vírus', href: `https://transparencyreport.google.com/safe-browsing/search?url=${encodeURIComponent(href)}` }
    ];
  }

  function subjectLinks(query, agencies) {
    const q = String(query || '').trim();
    const sites = (agencies || []).map(a => 'site:' + a.site).join(' OR ');
    return {
      all: [
        { label: 'GOOGLE FACT CHECK EXPLORER', note: 'checagens do mundo todo', href: `https://toolbox.google.com/factcheck/explorer/search/${encodeURIComponent(q)};hl=pt-BR` },
        { label: 'TODAS AS AGÊNCIAS BR', note: 'busca no Google só nas agências', href: `https://www.google.com/search?q=${encodeURIComponent(`${q} (${sites})`)}` },
        { label: 'OUTROS VEÍCULOS DERAM?', note: 'Google Notícias', href: `https://news.google.com/search?q=${encodeURIComponent(q)}&hl=pt-BR&gl=BR&ceid=BR:pt-419` }
      ],
      agencies: (agencies || []).map(a => ({
        label: a.name.toUpperCase(),
        href: `https://www.google.com/search?q=${encodeURIComponent(`${q} site:${a.site}`)}`
      }))
    };
  }

  const api = { analyze, extractUrl, splitHost, hostToUnicode, slugToQuery, levenshtein, investigateLinks, subjectLinks };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FactCheckLink = api;
})(typeof window !== 'undefined' ? window : globalThis);
