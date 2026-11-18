#!/usr/bin/env node
/* Reels → lista de temas do W4K3 PR0T0C0L (tudo neste PC).
 *
 *   node reel-tema.js add <url> [comentário]       põe o reel na fila e acorda o trabalhador
 *   node reel-tema.js add-arquivo <file_id> [com.]   vídeo mandado direto no Telegram (até 20 MB)
 *   node reel-tema.js trabalhar                      processa a fila (o "add" já chama sozinho)
 *   node reel-tema.js listar                         texto da lista para o bot
 *   node reel-tema.js pegar [id]                     TEMA|id|busca|direção (sem id: o próximo da fila)
 *   node reel-tema.js usado <id> | devolver <id> | apagar <id>
 *
 * Cada reel: yt-dlp (sem login) → faster-whisper (transcrição) → Ollama (mecanismo, obra, busca)
 * → junta com um tema parecido ou cria um novo em %USERPROFILE%\.w4k3\temas.json → avisa no Telegram.
 * O vídeo baixado é apagado depois: só ficam o link, a legenda, um trecho da transcrição e a análise.
 * Reel não é fonte: o tema serve para buscar uma notícia real (pauta com -Tema), não para publicar.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const BASE = path.join(os.homedir(), '.w4k3');
const DIR = path.join(BASE, 'reels');
const PY = path.join(DIR, 'venv', 'Scripts', 'python.exe');
const FILA = path.join(DIR, 'fila.json');
const PID = path.join(DIR, 'trabalhador.pid');
// W4K3_TESTE=1: lista separada e mensagens no console, sem tocar no Telegram nem nos temas de verdade
const TESTE = process.env.W4K3_TESTE === '1';
const TEMAS = path.join(BASE, TESTE ? 'temas-teste.json' : 'temas.json');
const LOG = path.join(BASE, 'logs', 'reels.log');
const OLLAMA = 'http://127.0.0.1:11434/api/chat';
const MODELO = 'qwen2.5:14b';
const WHISPER = process.env.W4K3_WHISPER || 'small';   // com a 3090: medium ou large-v3

const ler = (f, padrao) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch { return padrao; } };
const gravar = (f, v) => { const t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(v, null, 1)); fs.renameSync(t, f); };
const log = (m) => { fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.appendFileSync(LOG, `${new Date().toISOString()} ${m}\n`); };
const semAcento = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const raizes = (t) => new Set((semAcento(t).match(/[a-z0-9]{5,}/g) || []).map((w) => w.slice(0, 6)));
const vivo = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const hoje = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

// fichas das obras: as mesmas do nó "Escrever (espelho direto)" (uma fonte só)
function fichas() {
  for (const f of [path.join(__dirname, '..', 'n8n', 'code', 'escrever-espelho.js')]) {
    try {
      const s = fs.readFileSync(f, 'utf8');
      const a = s.indexOf('const FICHAS = ['), b = s.indexOf('\n];', a);
      return new Function(s.slice(a, b + 3) + '; return FICHAS;')();
    } catch {}
  }
  return [];
}

// ---------- Telegram ----------
async function tg(metodo, corpo) {
  if (TESTE && metodo === 'sendMessage') { console.log('[telegram]', corpo.text, corpo.reply_markup ? JSON.stringify(corpo.reply_markup) : ''); return { ok: true }; }
  const cfg = ler(path.join(BASE, 'telegram.json'), {});
  if (!cfg.token || !cfg.chatId) return null;
  const r = await fetch(`https://api.telegram.org/bot${cfg.token}/${metodo}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: cfg.chatId, ...corpo }),
  });
  return r.json();
}
const avisar = (text, botoes) => tg('sendMessage', { text: text.slice(0, 4000), disable_web_page_preview: true, ...(botoes ? { reply_markup: { inline_keyboard: botoes } } : {}) });

// ---------- fila ----------
function enfileirar(job) {
  const fila = ler(FILA, []);
  fila.push({ ...job, quando: new Date().toISOString() });
  fs.mkdirSync(DIR, { recursive: true });
  gravar(FILA, fila);
  const pid = Number(ler(PID, 0));
  if (!pid || !vivo(pid)) {
    const p = spawn(process.execPath, [__filename, 'trabalhar'], { detached: true, stdio: 'ignore', windowsHide: true });
    p.unref();
  }
  return fila.length;
}

async function trabalhar() {
  const pid = Number(ler(PID, 0));
  if (pid && pid !== process.pid && vivo(pid)) return;
  gravar(PID, process.pid);
  try {
    for (;;) {
      const fila = ler(FILA, []);
      if (!fila.length) break;
      const job = fila[0];
      try { await processar(job); }
      catch (e) {
        log('ERRO ' + (job.url || job.fileId) + ': ' + e.message);
        await avisar(`⚠️ Não consegui transformar o reel em tema.\n${job.url || 'vídeo enviado'}\n${e.message.split('\n')[0].slice(0, 300)}`);
      }
      const resto = ler(FILA, []);
      resto.shift();
      gravar(FILA, resto);
    }
  } finally { try { fs.rmSync(PID); } catch {} }
}

// ---------- um reel ----------
async function processar(job) {
  const t0 = Date.now();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w4k3-reel-'));
  try {
    let video, info = {};
    if (job.url) {
      // sem login/cookies de propósito: usar a sua conta do Instagram no download é o que leva a bloqueio
      execFileSync(PY, ['-m', 'yt_dlp', '--no-playlist', '--no-progress', '-q', '-f', 'b[height<=720]/b', '--max-filesize', '200M',
        '--write-info-json', '-o', path.join(tmp, 'r.%(ext)s'), job.url], { windowsHide: true, timeout: 300000, maxBuffer: 1 << 26 });
      video = fs.readdirSync(tmp).map((f) => path.join(tmp, f)).find((f) => /\.(mp4|webm|mkv|mov)$/i.test(f));
      info = ler(path.join(tmp, 'r.info.json'), {});
    } else {
      const f = await tg('getFile', { file_id: job.fileId });
      if (!f || !f.ok) throw new Error('o Telegram não entregou o vídeo (bots só baixam até 20 MB)');
      const cfg = ler(path.join(BASE, 'telegram.json'), {});
      const r = await fetch(`https://api.telegram.org/file/bot${cfg.token}/${f.result.file_path}`);
      video = path.join(tmp, 'r.mp4');
      fs.writeFileSync(video, Buffer.from(await r.arrayBuffer()));
    }
    if (!video) throw new Error('o vídeo não baixou (reel privado, apagado ou de conta fechada?). Mande o arquivo do vídeo direto aqui.');

    const tj = path.join(tmp, 't.json');
    execFileSync(PY, [path.join(__dirname, 'transcrever.py'), video, tj, WHISPER], { windowsHide: true, timeout: 1800000, maxBuffer: 1 << 26 });
    const tr = ler(tj, { texto: '', idioma: '?' });
    const legenda = String(info.description || job.legenda || '').trim();
    const autor = info.channel || info.uploader || '';
    if (!tr.texto && !legenda) throw new Error('o vídeo não tem fala nem legenda para analisar');

    const a = await analisar({ legenda, transcricao: tr.texto, idioma: tr.idioma, comentario: job.comentario, autor });
    const fonte = {
      url: job.url || null, autor, comentario: job.comentario || '', legenda: legenda.slice(0, 400),
      transcricao: tr.texto.slice(0, 800), idioma: tr.idioma, afirmacoes: a.afirmacoes, quando: new Date().toISOString(),
    };
    const { tema, juntou } = guardar(a, fonte);
    log(`ok ${job.url || 'arquivo'} → tema ${tema.id} (${juntou ? 'juntou' : 'novo'}) em ${Math.round((Date.now() - t0) / 1000)} s`);

    const msg = [
      `🎞️ ${juntou ? `Juntei ao tema #${tema.id} (agora ${tema.fontes.length} reels)` : `Tema novo #${tema.id}`}: ${tema.titulo}`,
      '', tema.mecanismo,
      tema.quem_ganha ? `• ganha: ${tema.quem_ganha}` : '', tema.quem_paga ? `• paga: ${tema.quem_paga}` : '',
      tema.obra ? `• espelho sugerido: ${tema.obra}${tema.por_que ? ' (' + tema.por_que + ')' : ''}` : '',
      `• busca de notícias: ${tema.busca}`,
      a.afirmacoes.length ? '\n🔎 O reel afirma (checar antes de usar):\n' + a.afirmacoes.map((x) => '- ' + x).join('\n') : '',
      `\n${tr.idioma === 'pt' ? '' : `(reel em ${tr.idioma}) `}/temas mostra a lista. A pauta das 09h usa o primeiro da fila.`,
    ].filter((x) => x !== '').join('\n');
    await avisar(msg, [[{ text: '✍️ Escrever agora', callback_data: `tema_usar_${tema.id}` }, { text: '🗑 Apagar tema', callback_data: `tema_apagar_${tema.id}` }]]);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

async function ia(sistema, pedido, maxTok = 900) {
  const r = await fetch(OLLAMA, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODELO, stream: false, format: 'json', keep_alive: '10m',
      options: { temperature: 0.3, num_ctx: 8192, num_predict: maxTok },
      messages: [{ role: 'system', content: sistema }, { role: 'user', content: pedido }],
    }),
    signal: AbortSignal.timeout(1200000),
  });
  if (!r.ok) throw new Error('Ollama respondeu ' + r.status + ' (ele está rodando?)');
  const txt = ((await r.json()).message || {}).content || '';
  try { return JSON.parse(txt); } catch { const m = txt.match(/\{[\s\S]*\}/); if (m) return JSON.parse(m[0]); throw new Error('A IA não devolveu JSON'); }
}

async function analisar({ legenda, transcricao, idioma, comentario, autor }) {
  const fx = fichas();
  const o = await ia(
    'Você é o editor de pautas do W4K3 PR0T0C0L, um site brasileiro que compara notícias reais de tecnologia e poder com obras de ficção distópica. Responda só em JSON, em português do Brasil.',
    `Um leitor mandou este vídeo curto (reel). Transforme-o num TEMA para uma edição futura.

AUTOR DO REEL: ${autor || '?'}
LEGENDA DO POST:
${legenda.slice(0, 1500) || '(sem legenda)'}

TRANSCRIÇÃO (idioma: ${idioma}):
${transcricao.slice(0, 6000) || '(sem fala)'}
${comentario ? '\nCOMENTÁRIO DO EDITOR (prioridade): ' + comentario : ''}

OBRAS DISPONÍVEIS PARA O ESPELHO: ${fx.map((f) => `${f.obra} (${String(f.temas || '').slice(0, 80)})`).join('; ')}

Regras:
- O tema é o MECANISMO REAL por trás do vídeo (quem faz o quê com quem), não a piada nem a obra citada. Se o vídeo só fala da ficção, diga qual coisa do mundo real ela espelha.
- "busca": de 3 a 6 palavras-chave para achar notícias sobre isso em jornais (misture português e inglês, ex.: "Amazon monopólio vendedores marketplace antitrust").
- "afirmacoes": até 4 afirmações sobre o MUNDO REAL que o vídeo faz (ou insinua pela sátira) e que precisam ser checadas antes de virar texto. Nomeie a empresa, pessoa ou governo real, nunca o da ficção (ex.: "A Amazon pressiona vendedores a baixar preços pela buy box", não "A Arasaka..."). Vazio se não houver.
- "obra": uma das obras disponíveis, a que tem a mesma engrenagem.
{"titulo": "até 10 palavras", "resumo": "1 ou 2 frases do que o vídeo mostra", "mecanismo": "1 frase", "quem_ganha": "...", "quem_paga": "...", "obra": "...", "por_que": "até 12 palavras", "busca": "...", "afirmacoes": ["..."]}`);
  const s = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const obra = fx.find((f) => semAcento(o.obra).includes(semAcento(f.obra.split(':')[0])));
  return {
    titulo: s(o.titulo, 90) || s(legenda, 60) || 'Tema sem título', resumo: s(o.resumo, 400), mecanismo: s(o.mecanismo, 300),
    quem_ganha: s(o.quem_ganha, 120), quem_paga: s(o.quem_paga, 120), obra: obra ? obra.obra : '', por_que: s(o.por_que, 120),
    busca: s(o.busca, 120) || s(o.titulo, 60),
    afirmacoes: (Array.isArray(o.afirmacoes) ? o.afirmacoes : []).map((x) => s(x, 200)).filter(Boolean).slice(0, 4),
  };
}

// ---------- lista ----------
const carregar = () => { const d = ler(TEMAS, null); return d && Array.isArray(d.temas) ? d : { proximoId: 1, temas: [] }; };
function guardar(a, fonte) {
  const d = carregar();
  const assinatura = (t) => raizes([t.titulo, t.mecanismo, t.busca].join(' '));
  const nova = assinatura(a);
  const parecido = (t) => {
    const r = assinatura(t); let k = 0; for (const x of nova) if (r.has(x)) k++;
    const j = k / Math.max(1, new Set([...nova, ...r]).size);
    return j + (a.obra && a.obra === t.obra ? 0.08 : 0);
  };
  // mesmo link de novo: só atualiza
  let tema = d.temas.find((t) => fonte.url && t.fontes.some((f) => f.url === fonte.url));
  let juntou = !!tema;
  if (!tema) {
    const cand = d.temas.filter((t) => t.status === 'novo').map((t) => [t, parecido(t)]).sort((x, y) => y[1] - x[1])[0];
    if (cand && cand[1] >= 0.3) { tema = cand[0]; juntou = true; }
  }
  if (tema) {
    tema.fontes = tema.fontes.filter((f) => !fonte.url || f.url !== fonte.url).concat(fonte);
    if (!tema.obra && a.obra) tema.obra = a.obra;
  } else {
    tema = { id: d.proximoId++, ...a, status: 'novo', criado: new Date().toISOString(), fontes: [fonte] };
    delete tema.afirmacoes;
    d.temas.push(tema);
  }
  gravar(TEMAS, d);
  return { tema, juntou };
}

// fila de pautas: mais reels sobre o mesmo assunto primeiro, depois o mais antigo
const fila = (d) => d.temas.filter((t) => t.status === 'novo').sort((a, b) => b.fontes.length - a.fontes.length || a.criado.localeCompare(b.criado));

function listar() {
  const d = carregar();
  const nov = fila(d), usados = d.temas.filter((t) => t.status === 'usado').slice(-5).reverse();
  if (!nov.length && !usados.length) return 'Nenhum tema ainda. Mande o link de um reel (Instagram, TikTok ou Shorts) e, se quiser, um comentário junto.';
  const l = ['🗂️ TEMAS PARA AS PRÓXIMAS EDIÇÕES (a pauta das 09h usa o 1º)', ''];
  nov.forEach((t, i) => l.push(`${i + 1}. #${t.id} ${t.titulo}${t.fontes.length > 1 ? ` (${t.fontes.length} reels)` : ''}${t.obra ? ' · ' + t.obra : ''}\n   busca: ${t.busca}`));
  if (usados.length) l.push('', 'Já usados: ' + usados.map((t) => `#${t.id} ${t.titulo} (${t.usadoEm || ''})`).join('; '));
  l.push('', 'usar 3  escreve a análise do tema #3 agora · apagar 3  tira da lista');
  return l.join('\n');
}

function pegar(id) {
  const d = carregar();
  const t = id ? d.temas.find((x) => x.id === Number(id)) : fila(d)[0];
  if (!t) return '';
  const coment = t.fontes.map((f) => f.comentario).filter(Boolean).join(' / ');
  const direcao = [`Tema vindo de reels: ${t.mecanismo || t.resumo}`, t.obra ? `Espelho sugerido: ${t.obra}.` : '', coment ? `Pedido do editor: ${coment}` : '']
    .filter(Boolean).join(' ').replace(/[|\r\n]+/g, ' ');
  return `TEMA|${t.id}|${t.busca.replace(/[|\r\n]+/g, ' ')}|${direcao}`;
}

function marcar(id, status) {
  const d = carregar();
  const t = d.temas.find((x) => x.id === Number(id));
  if (!t) return `Não achei o tema #${id}.`;
  if (status === 'apagar') { d.temas = d.temas.filter((x) => x !== t); gravar(TEMAS, d); return `🗑 Tema #${id} apagado: ${t.titulo}`; }
  t.status = status;
  if (status === 'usado') t.usadoEm = hoje(); else delete t.usadoEm;
  gravar(TEMAS, d);
  return `ok #${id} ${status}`;
}

// ---------- linha de comando ----------
(async () => {
  const [cmd, a1, ...resto] = process.argv.slice(2);
  const comentario = resto.join(' ').trim();
  try {
    if (cmd === 'add' && a1) console.log(`FILA|${enfileirar({ url: a1, comentario })}`);
    else if (cmd === 'add-arquivo' && a1) console.log(`FILA|${enfileirar({ fileId: a1, comentario })}`);
    else if (cmd === 'trabalhar') await trabalhar();
    else if (cmd === 'testar' && a1) await processar({ url: a1, comentario });   // direto, sem fila (com W4K3_TESTE=1)
    else if (cmd === 'listar') console.log(listar());
    else if (cmd === 'pegar') console.log(pegar(a1));
    else if (cmd === 'usado' || cmd === 'devolver' || cmd === 'apagar') console.log(marcar(a1, cmd === 'devolver' ? 'novo' : cmd));
    else { console.error('uso: reel-tema.js add <url> [comentário] | add-arquivo <file_id> | trabalhar | listar | pegar [id] | usado|devolver|apagar <id>'); process.exit(2); }
  } catch (e) { console.error(e.message); process.exit(1); }
})();
