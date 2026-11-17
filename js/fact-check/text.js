/* DEDSEC - Fact Check: mensagens (WhatsApp, Telegram...) e base de checagens
 *
 * analyzeMessage: procura padrões de boato e de golpe no texto colado.
 * matchFactchecks: procura checagens parecidas em data/factchecks.json (busca por palavras;
 *   a tela pode reordenar com a IA local do assistente).
 * ratingOf: tira o veredito do título da checagem ("É falso que...", "#FAKE", "É antigo...").
 * Funções puras: o navegador usa window.FactCheckText; os testes e automation/factchecks usam require().
 */
(function (root) {
  'use strict';

  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  const STOP = new Set(('a o as os um uma uns umas de do da dos das em no na nos nas por pelo pela pelos pelas para pra pro ' +
    'com sem e ou que se me te lhe eu voce voces ele ela eles elas isso isto esse essa esses essas este esta estes estas ' +
    'aquele aquela aqui ai la como qual quais quando onde quem cujo mais menos muito muita muitos muitas pouco ja nao sim ' +
    'ser sao foi era sera estao esta estou tem ter tinha teve ha havia vai vao seu sua seus suas meu minha nosso nossa ' +
    'olha olhem veja vejam midia info mas porem entao tambem so ate apos sobre entre todo toda todos todas outro outra mesmo mesma ao aos at the of and ' +
    'e eh diz dizem disse afirma mostra mostram video foto imagem post publicacao texto mensagem verdade falso fake ' +
    'boato checagem checado enganoso antigo noticia noticias brasil hoje agora urgente compartilhe').split(' '));

  /** Palavras "fortes" do texto: sem acento, sem stopword, cortadas em 6 letras ("vacinas" e "vacinação" -> "vacina"). */
  function terms(text) {
    return norm(text).replace(/https?:\/\/\S+/g, ' ').split(/[^a-z0-9]+/)
      .filter(w => w.length > 2 && !STOP.has(w) && !/^\d{1,2}$/.test(w))
      .map(w => (w.length > 6 ? w.slice(0, 6) : w.replace(/s$/, '')));
  }

  /* ---------- veredito da checagem pelo título ---------- */
  const RATINGS = [
    [/\b(gerad[oa]s?|feit[oa]s?|criad[oa]s?|produzid[oa]s?) (com|por) (uso de )?(ia|inteligencia artificial)|\bdeepfake|\bia\b.{0,20}(manipul|ger)|com ia\b/, 'FEITO COM IA'],
    [/montage|manipulad|editad[oa]|adulterad|photoshop/, 'MONTAGEM'],
    [/fora de contexto|tirad[oa] de contexto|descontextualizad|\bnao mostra|^(video|foto|imagem|audio)s? (mostra|e de|registra).*, nao \w+/, 'FORA DE CONTEXTO'],
    [/\be antig[oa]|\bsao antig[oa]s|nao (e|sao) (recente|atual|de hoje)|de \d{4},? (e nao|nao)|nao (e|sao|foi gravad[oa]) de (\w+ de )?\d{4}|nao e de (janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)|(gravad[oa]|feit[oa]|registrad[oa]) em \d{4}|^e de (19|20)\d\d\b/, 'ANTIGO'],
    [/enganos|distorc|exager|impreciso|sem provas|nao ha provas|nao ha evidencia|sem evidencia|insustentavel|nao (demonstra|comprova|prova|indica|se referia|tem relacao)/, 'ENGANOSO'],
    [/golpe|fraude|phishing|site falso|perfil falso/, 'GOLPE'],
    [/#fake|\be (falso|falsa)\b|\bsao (falsos|falsas)\b|(falso|falsa) que|nao e verdade|mentira|nao (disse|fez|anunciou|aprovou|existe)|e inventad|e boato|\bfake\b|\bnao [a-z]+(ou|eu|iu)\b/, 'FALSO'],
    [/#fato|\be verdade|\bverdadeir|\be real\b|\bconfirmad|\brealmente\b/, 'VERDADEIRO']
  ];

  function ratingOf(title) {
    const t = norm(title);
    for (const [re, label] of RATINGS) {
      // "O vídeo ... é real?" é pergunta, não veredito
      if (re.test(t)) return label === 'VERDADEIRO' && /\?\s*$/.test(t) ? 'CHECAGEM' : label;
    }
    return 'CHECAGEM';
  }

  /* ---------- padrões de boato e golpe ---------- */
  const PATTERNS = [
    {
      id: 'spread', level: 'warn', title: 'PEDE PARA ESPALHAR',
      re: /compartilh|repass(e|em|ar)|envie (para|pra) (todos|seus|\d+)|mand(e|a) (para|pra) (todos|seus|\d+)|divulgu?(e|ar|em)|antes que (apaguem|tirem|derrubem|censurem|bloqueiem)|vao (apagar|tirar do ar|derrubar)|nao deixe de (ver|ler|repassar)|todo mundo precisa (ver|saber)/,
      detail: 'Pedir para repassar rápido é o motor dos boatos: a pressa faz a gente pular a checagem. Notícia de verdade não precisa de corrente.'
    },
    {
      id: 'hidden', level: 'warn', title: 'DIZ QUE ESTÃO ESCONDENDO',
      re: /(a )?(midia|imprensa|globo|tv|jornal|grande midia) (nao|nunca) (mostra|fala|vai (mostrar|falar)|divulga)|ninguem (esta|ta) falando|estao escondendo|querem esconder|o que (eles )?nao querem que (voce|vc) saiba|a verdade (que|sobre)|censurad|foi (apagad|removid|derrubad)[oa] (da|do|das|dos)/,
      detail: '"A mídia não mostra" é um jeito de vacinar o texto contra checagem. Se fosse verdade e importante, outros veículos estariam falando.'
    },
    {
      id: 'vague', level: 'warn', title: 'FONTE SEM NOME',
      re: /(um|uma|meu|minha) (amig[oa]|prim[oa]|ti[oa]|conhecid[oa]|parente|cunhad[oa]|vizinh[oa]).{0,40}(medic|policia|enfermeir|advogad|militar|delegad|juiz|funcionari|servidor|trabalha)|fonte (segura|confiavel|de dentro)|segundo (especialistas|cientistas|medicos)\b(?! d[aoe])|(cientistas|medicos|especialistas) (afirmam|comprovam|confirmam|alertam)|estudo (comprova|prova|revela) que|pesquisa (comprova|prova) que|um audio de/,
      detail: 'Quem disse? "Um amigo médico" ou "especialistas afirmam" sem nome, instituição ou link não dá para conferir.'
    },
    {
      id: 'health', level: 'warn', title: 'PROMESSA DE SAÚDE',
      re: /\bcura (do|da|o|a|para|pra)|curou|remedio caseiro|receita caseira|milagr|(medicos|industria farmaceutica) (odeiam|nao querem)|vacina.{0,40}(mata|chip|dna|autismo|magnet|grafeno|esteril)|\bchip\b.{0,30}vacina|ivermectina|cloroquina|limao.{0,20}(cura|mata)|bicarbonato.{0,20}(cura|cancer)/,
      detail: 'Cura milagrosa e vacina com chip são temas campeões de boato. Confirme com o SUS, a Anvisa ou o seu médico antes de seguir qualquer receita.'
    },
    {
      id: 'scam', level: 'danger', title: 'PEDE PIX, SENHA OU CÓDIGO',
      re: /\b(faca|faz|mande|manda|envie|envia|transfira|pague|paga)\b.{0,30}\bpix\b|\bchave pix\b|\b(sua|a) senha\b|codigo de (verificacao|seguranca|confirmacao|6 digitos)|\bcodigo que (chegou|voce recebeu|recebeu)|informe (seu|o) (cpf|cartao|numero do cartao)|dados do cartao|\btoken\b.{0,20}(banco|app)/,
      detail: 'Banco, governo, loja ou parente "com número novo" não pedem Pix, senha ou código por mensagem. Isso é golpe: não responda e ligue para a pessoa ou o banco pelo número de sempre.'
    },
    {
      id: 'bait', level: 'warn', title: 'ISCA DE DINHEIRO',
      re: /voce (foi|esta) (sorteado|selecionado|aprovado)|(ganhou|ganhe) (um|uma|r\$|\d)|premio|resgat(e|ar)|saque (liberado|disponivel|ja)|valores a receber|dinheiro esquecido|auxilio (liberado|novo|de r\$)|bolsa (liberada|de r\$)|indenizacao|restituicao|taxa de (liberacao|entrega|desbloqueio)|(conta|cpf|cnh|titulo).{0,15}(sera |vai ser )?(bloquead|suspens|cancelad)|regularize|ultimas vagas|so hoje|promocao relampago/,
      detail: 'Prêmio, saque liberado ou "seu CPF será bloqueado" servem para fazer você clicar com pressa. Confira só pelo app ou site oficial, digitando o endereço você mesmo.'
    },
    {
      id: 'forward', level: 'info', title: 'ENCAMINHADA MUITAS VEZES',
      re: /encaminhada com frequencia|forwarded many times/,
      detail: 'O WhatsApp marca assim mensagens que passaram por 5 ou mais pessoas. Quanto mais longe da fonte, maior a chance de distorção.'
    }
  ];

  function urls(text) {
    const out = [];
    const re = /\bhttps?:\/\/[^\s<>"'`]+|(?:^|[\s(<])((?:[a-z0-9-]+\.)+(?:com|br|net|org|info|xyz|top|online|site|ly|me|io|app|link|click|live|shop)(?:\.br)?(?:\/[^\s<>"'`]*)?)/gi;
    let m;
    while ((m = re.exec(text)) && out.length < 8) {
      const u = (m[1] || m[0]).trim().replace(/[).,;:!?\]}>»"']+$/, '');
      if (u && !out.includes(u)) out.push(u);
    }
    return out;
  }

  /** Assunto para buscar nas agências: as palavras mais fortes da primeira frase útil. */
  function subjectOf(text) {
    const clean = String(text || '').replace(/https?:\/\/\S+/g, ' ')
      .replace(/[*_~]/g, ' ').replace(/[\u{1F000}-\u{1FFFF}☀-➿️]/gu, ' ');
    const sentences = clean.split(/[.!?\n]+/).map(s => s.trim()).filter(Boolean);
    const skip = /urgente|compartilh|repass|antes que|aten[cç][aã]o|bom dia|boa tarde|boa noite|gente|pessoal|leiam|vejam|encaminhada/i;
    const s = sentences.find(x => x.split(/\s+/).length >= 4 && !skip.test(x)) || sentences[0] || '';
    const words = s.split(/\s+/).filter(w => w.length > 1 && !STOP.has(norm(w).replace(/[^a-z0-9]/g, '')));
    return words.slice(0, 10).join(' ').replace(/[,:;"“”]/g, '').slice(0, 120);
  }

  /**
   * @param {string} text
   * @param {{ analyzeLink?: (url:string)=>object }} opts  análise de link (FactCheckLink.analyze já com as regras)
   */
  function analyzeMessage(text, opts = {}) {
    const raw = String(text || '');
    if (raw.trim().length < 15) return { ok: false, error: 'Cole a mensagem inteira (pelo menos uma frase).' };
    const t = norm(raw);
    const signals = [];
    for (const p of PATTERNS) {
      const m = t.match(p.re);
      if (m) signals.push({ level: p.level, title: p.title, detail: p.detail, id: p.id, quote: m[0] });
    }

    const letters = raw.replace(/[^A-Za-zÀ-ÿ]/g, '');
    const upper = raw.replace(/[^A-ZÀ-Þ]/g, '').length;
    const alarms = (raw.match(/!{2,}|[\u{1F6A8}⚠‼❗\u{1F534}\u{1F525}]/gu) || []).length;
    if ((letters.length > 40 && upper / letters.length > 0.45) || alarms >= 3) {
      signals.push({ level: 'info', title: 'TOM ALARMISTA', id: 'tone',
        detail: 'Muita letra maiúscula, sirene e exclamação: o texto quer provocar medo ou raiva antes de você pensar.' });
    }

    const links = urls(raw).map(u => ({ url: u, result: opts.analyzeLink ? opts.analyzeLink(u) : null }));
    const badLink = links.find(l => l.result && l.result.ok && l.result.verdict === 'danger');
    if (badLink) {
      signals.push({ level: 'danger', title: 'LINK SUSPEITO', id: 'link',
        detail: `O link ${badLink.result.parts.domain} tem sinais fortes de golpe ou site falso. Veja a análise dele abaixo.` });
    }
    if (signals.some(s => s.id === 'bait') && links.length && !signals.some(s => s.id === 'scam')) {
      const s = signals.find(x => x.id === 'bait');
      s.level = 'danger';
      s.detail += ' Com um link junto, é o formato clássico de golpe.';
    }
    if (!signals.length) {
      signals.push({ level: 'info', title: 'SEM PADRÕES DE BOATO', id: 'none',
        detail: 'Não achei os truques mais comuns de boato ou golpe no texto. Isso não confirma nada: veja se já checaram o assunto e quem é a fonte.' });
    }

    const rank = { danger: 2, warn: 1 };
    const top = signals.reduce((a, s) => Math.max(a, rank[s.level] || 0), 0);
    return { ok: true, signals, links, verdict: top === 2 ? 'danger' : top === 1 ? 'warn' : 'unknown', subject: subjectOf(raw) };
  }

  /* ---------- busca nas checagens ---------- */
  /**
   * @param {string} text
   * @param {Array<{title,link,source,date,rating?,summary?}>} items
   * @returns {Array<{item, score, shared:string[]}>} melhores primeiro
   */
  function matchFactchecks(text, items, limit = 5) {
    const q = [...new Set(terms(text))];
    if (!q.length || !Array.isArray(items) || !items.length) return [];
    const docs = items.map(it => new Set(terms(it.title + ' ' + (it.summary || ''))));
    const df = new Map();
    for (const d of docs) for (const w of d) df.set(w, (df.get(w) || 0) + 1);
    const N = docs.length;
    const idf = w => Math.log(1 + N / (1 + (df.get(w) || 0)));
    const qWeight = q.reduce((s, w) => s + idf(w), 0) || 1;
    const out = [];
    docs.forEach((d, i) => {
      const shared = q.filter(w => d.has(w));
      if (shared.length < 2) return;
      const score = shared.reduce((s, w) => s + idf(w), 0) / Math.sqrt(qWeight * Math.max(4, d.size) / 4);
      out.push({ item: items[i], score, shared });
    });
    return out.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  const api = { analyzeMessage, matchFactchecks, ratingOf, terms, urls, subjectOf, norm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FactCheckText = api;
})(typeof window !== 'undefined' ? window : globalThis);
