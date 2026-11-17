// Gera o vídeo da análise do W4K3 a partir de um rascunho (draft.json), tudo neste PC:
//   Piper (voz) → FFmpeg (efeito de voz, volume por quadro) → Remotion (colagem/ASCII/glitch) → MP4
//   e, com --telegram, manda o vídeo para o dono do bot.
//
// uso: node scripts/gerar.js <draft.json> [--telegram] [--so-props <saida.json>] [--saida <arquivo.mp4>]
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const BASE = path.join(os.homedir(), '.w4k3');
const PROJ = path.join(__dirname, '..');
const TTS = path.join(BASE, 'tts');
const PY = path.join(TTS, 'venv', 'Scripts', 'python.exe');
const MODELO = path.join(TTS, 'pt_BR-faber-medium.onnx');
const JOB = path.join(BASE, 'video-job');
const VIDEOS = path.join(BASE, 'videos');
const PIDFILE = path.join(BASE, 'video.pid');
const FPS = 30, FINAL = 3.2, INICIO = 0.3, PAUSA_FRASE = 0.35, PAUSA_PARAGRAFO = 0.7;

const args = process.argv.slice(2);
const draftPath = args[0];
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const log = (m) => console.log(`${new Date().toISOString()} ${m}`);
const hash = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
const run = (cmd, a, o = {}) => execFileSync(cmd, a, { maxBuffer: 1 << 29, windowsHide: true, ...o });

// ---------- texto ----------
const limpar = (html) => String(html || '')
  .replace(/<\/p>\s*/gi, '\n\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
// o que a voz lê mal: siglas viram palavras (a legenda mostra o mesmo texto falado)
const falavel = (s) => s.replace(/\bIAs\b/g, 'inteligências artificiais').replace(/\bIA\b/g, 'inteligência artificial')
  .replace(/\s+/g, ' ').trim();
const frasesDe = (p) => p.split(/(?<=[.!?…])\s+(?=["“(]?[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9])/).map((s) => s.trim()).filter(Boolean);

const PARADAS = new Set(('a o os as um uma uns umas de da do das dos em na no nas nos por para pela pelo pelas pelos com sem ' +
  'que quem qual quais como quando onde porque porém mas e ou se seu sua seus suas nosso nossa este esta isso isto esse essa ' +
  'ele ela eles elas nós você vocês mais menos muito muita muitos muitas já ainda também entre sobre até após cada todo toda ' +
  'todos todas outro outra outros outras mesmo mesma ser estar ter fazer pode podem está estão são foi era há não sim nem ' +
  'enquanto então assim apenas cada vez sendo segundo diante desse dessa deste desta nesse nessa neste nesta').split(' '));
// até 2 palavras-chave por frase para os rótulos na tela: nomes próprios (juntos: "Watch Dogs"),
// "I.A." e palavras longas; sem repetir rótulo já usado no vídeo
const sem = (w) => w.replace(/[^\p{L}\d%-]/gu, '');
function chaves(frase, usados) {
  const ws = frase.split(/\s+/), itens = [];
  for (let i = 0; i < ws.length; i++) {
    const w = sem(ws[i]);
    if (!w) continue;
    if (w.toLowerCase() === 'inteligência' && /^artificia/i.test(ws[i + 1] || '')) { itens.push({ txt: 'I.A.', i, nota: 9 }); i++; continue; }
    if (i > 0 && /^\p{Lu}/u.test(w) && !PARADAS.has(w.toLowerCase())) {
      const nome = [w];
      let j = i;
      while (!/[.,;:!?]$/.test(ws[j]) && j + 1 < ws.length && /^\p{Lu}/u.test(sem(ws[j + 1]))) nome.push(sem(ws[++j]));
      itens.push({ txt: nome.join(' '), i, nota: 12 + nome.length });
      i = j; continue;
    }
    if (w.length < 7 || PARADAS.has(w.toLowerCase())) continue;
    itens.push({ txt: w, i, nota: w.length + (/\d/.test(w) ? 5 : 0) });
  }
  return itens.sort((a, b) => b.nota - a.nota).filter((x) => {
    const k = x.txt.toLowerCase(); if (usados.has(k)) return false; usados.add(k); return true;
  }).slice(0, 2).sort((a, b) => a.i - b.i);
}

// ---------- cenas por parte da análise (O FATO, A LEITURA, O ESPELHO DA FICÇÃO, O CHAMADO) ----------
const ROTEIRO = [['manchete', 'plataforma'], ['marionete', 'vigilancia'], ['obra', 'vigilancia'], ['pergunta']];
const TODAS = ['plataforma', 'marionete', 'vigilancia', 'obra', 'pergunta'];

async function main() {
  if (!draftPath || !fs.existsSync(draftPath)) throw new Error('rascunho não encontrado: ' + draftPath);
  fs.mkdirSync(JOB, { recursive: true }); fs.mkdirSync(VIDEOS, { recursive: true });
  fs.writeFileSync(PIDFILE, String(process.pid));
  const hash0 = hash(draftPath);
  // vídeo desta versão vai ser refeito: tira do índice até o novo ficar pronto (o publicar espera)
  registra(hash0, null);
  const snap = path.join(JOB, 'draft.json');
  fs.copyFileSync(draftPath, snap);
  const d = JSON.parse(fs.readFileSync(snap, 'utf8').replace(/^﻿/, ''));
  const titulo = limpar(d.reflection.title);
  const paragrafos = limpar(d.reflection.content).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const refs = (d.tags || []).filter((t) => !['reflexão', 'notícia', 'antisistema', 'crítica', 'notícia-do-dia', 'link-enviado'].includes(t));

  // frases: título + (batidas do roteiro "espelho direto", ou cada frase de cada parágrafo nos textos antigos).
  // seg = cena a que a frase pertence (uma batida inteira fica numa cena só)
  const beats = Array.isArray(d.reflection.beats) && d.reflection.beats.length ? d.reflection.beats : null;
  const frases = [{ txt: falavel(titulo.replace(/[.!?]*$/, '.')), par: -1, seg: 0 }];
  if (beats) beats.forEach((b, i) => frasesDe(b.fala).forEach((f) => frases.push({ txt: falavel(f), par: 0, seg: i + 1, beat: b })));
  else paragrafos.forEach((p, i) => frasesDe(p).forEach((f) => frases.push({ txt: falavel(f), par: i, seg: frases.length })));
  log(`"${titulo}": ${beats ? beats.length + ' batidas' : paragrafos.length + ' parágrafos'}, ${frases.length} frases`);

  // 1) voz, frase por frase
  const wavs = path.join(JOB, 'frases');
  fs.rmSync(wavs, { recursive: true, force: true });
  const fjson = path.join(JOB, 'frases.json');
  fs.writeFileSync(fjson, JSON.stringify(frases.map((f) => f.txt)));
  const dur = JSON.parse(run(PY, [path.join(__dirname, 'tts.py'), MODELO, fjson, wavs, '0.95']).toString().trim().split('\n').pop());
  let t = INICIO;
  frases.forEach((f, i) => {
    if (i > 0) {
      const a = frases[i - 1];
      t += a.seg === f.seg ? 0.22 : beats ? (a.par < 0 ? 0.6 : 0.35) : (a.par === f.par ? PAUSA_FRASE : PAUSA_PARAGRAFO);
    }
    f.ini = t; f.fim = t + dur[i]; t = f.fim;
  });
  const fimFala = t + 0.4, total = fimFala + FINAL;

  // 2) junta as frases e aplica o efeito "hacker" (mais grave sem mudar a duração, crush, flanger, rádio, eco)
  const sr = JSON.parse(fs.readFileSync(MODELO + '.json', 'utf8')).audio.sample_rate;
  const pub = path.join(PROJ, 'public', 'job');
  fs.mkdirSync(pub, { recursive: true });
  const voz = path.join(pub, 'voz.wav');
  const ent = [], fil = [];
  frases.forEach((f, i) => { ent.push('-i', path.join(wavs, `f${String(i).padStart(2, '0')}.wav`)); fil.push(`[${i}]adelay=${Math.round(f.ini * 1000)}:all=1[a${i}]`); });
  const fx = `asetrate=${sr}*0.86,aresample=${sr},atempo=${(1 / 0.86).toFixed(4)},acrusher=bits=10:mix=0.25:samples=2,` +
    'flanger=delay=2:depth=3:speed=0.4:width=60,highpass=f=120,lowpass=f=6500,aecho=0.8:0.4:35:0.25,' +
    `acompressor=threshold=0.1:ratio=4,loudnorm=I=-15:TP=-1.5,apad=whole_dur=${total.toFixed(2)},atrim=0:${total.toFixed(2)}`;
  const mix = frases.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${frases.length}:normalize=0:duration=longest,${fx}`;
  run('ffmpeg', ['-y', '-v', 'error', ...ent, '-filter_complex', fil.join(';') + ';' + mix, '-ar', '48000', '-ac', '2', voz]);

  // 3) volume da voz por quadro (anima boca, olhos e glitch)
  const pcm = run('ffmpeg', ['-v', 'error', '-i', voz, '-ac', '1', '-ar', '48000', '-f', 's16le', 'pipe:1']);
  const am = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
  const nq = Math.ceil(total * FPS), per = 48000 / FPS, vol = [];
  for (let q = 0; q < nq; q++) {
    let s = 0, n = 0;
    for (let i = Math.floor(q * per); i < Math.min(am.length, (q + 1) * per); i++) { s += (am[i] / 32768) ** 2; n++; }
    vol.push(n ? Math.sqrt(s / n) : 0);
  }
  const vmax = Math.max(...vol) || 1;

  // 4) palavras (tempo proporcional ao tamanho, dentro do tempo exato da frase) e cenas
  const palavras = [];
  frases.forEach((f, s) => {
    const ws = f.txt.split(/\s+/), pesos = ws.map((w) => w.replace(/[^\p{L}\d]/gu, '').length + 2);
    const tot = pesos.reduce((a, b) => a + b, 0);
    let x = f.ini;
    ws.forEach((w, j) => { const dd = (f.fim - f.ini) * pesos[j] / tot; palavras.push({ w, s, ini: +x.toFixed(3), fim: +(x + dd).toFixed(3) }); x += dd; });
  });
  const contPar = {}, usados = new Set(), grupos = [];
  frases.forEach((f, i) => { const g = grupos[grupos.length - 1]; if (g && g.seg === f.seg) g.fr.push(i); else grupos.push({ seg: f.seg, fr: [i] }); });
  const segmentos = grupos.map((g, k) => {
    const s = g.fr[0], f = frases[s];
    const ini = k === 0 ? 0 : Math.round(((frases[s - 1].fim + f.ini) / 2) * FPS);
    if (f.par < 0) return { cena: 'abertura', ini, par: -1, chaves: [] };
    if (beats) {
      // a cena e a legenda de impacto vêm do roteiro escrito pela IA
      const b = f.beat;
      const ch = b.legenda ? [{ txt: String(b.legenda).toUpperCase().slice(0, 30), ini: Math.round(f.ini * FPS) + 3 }] : [];
      return { cena: b.cena || 'manchete', ini, par: 0, chaves: ch, lado: b.lado, legenda: b.legenda || '' };
    }
    const kk = (contPar[f.par] = (contPar[f.par] ?? -1) + 1);
    const lista = ROTEIRO[f.par] || TODAS;
    const cena = f.par >= ROTEIRO.length ? TODAS[(s + kk) % TODAS.length] : lista[kk % lista.length];
    const ch = chaves(f.txt, usados).map((c) => {
      const p = palavras.filter((pp) => pp.s === s)[c.i];
      return { txt: c.txt.toUpperCase().slice(0, 22), ini: Math.round(p.ini * FPS) };
    });
    return { cena, ini, par: f.par, chaves: ch };
  });
  segmentos.forEach((g, i) => { g.fim = i + 1 < segmentos.length ? segmentos[i + 1].ini : Math.round(fimFala * FPS); });

  const props = {
    fps: FPS, duracao: nq, audio: 'job/voz.wav', vol: vol.map((v) => +(v / vmax).toFixed(3)), palavras, segmentos,
    titulo, fonte: d.news && d.news.source || '', noticia: d.news && d.news.title || '', refs, data: d.date || '',
    final: Math.round(fimFala * FPS), espelho: d.reflection.espelho || null,
  };
  const propsPath = opt('--so-props') || path.join(JOB, 'props.json');
  fs.writeFileSync(propsPath, JSON.stringify(props));
  log(`roteiro: ${segmentos.map((g) => g.cena).join(' > ')} (${total.toFixed(1)} s)`);
  if (args.includes('--so-props')) return;

  // 5) render (só CPU) e compressão para caber no Telegram (limite de 50 MB para bots).
  // Primeiro o vertical (Reels/Shorts), que vai para o Telegram; depois o horizontal, que fica guardado.
  const slug = (d.date || 'video') + '-' + titulo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const base = opt('--saida') ? opt('--saida').replace(/\.mp4$/i, '') : path.join(VIDEOS, slug);
  const renderiza = (comp, final) => {
    const bruto = path.join(JOB, `bruto-${comp}.mp4`);
    const t0 = Date.now();
    run(process.execPath, [path.join(PROJ, 'node_modules', '@remotion', 'cli', 'remotion-cli.js'), 'render', 'src/index.jsx', comp, bruto,
      `--props=${propsPath}`, '--crf=24', '--log=error'], { cwd: PROJ, stdio: ['ignore', 'inherit', 'inherit'] });
    // comprime num arquivo à parte e só depois troca: quem lê o vídeo nunca pega um arquivo pela metade
    const parcial = final.replace(/\.mp4$/i, '.parcial.mp4');
    for (const crf of [27, 31, 35]) {
      run('ffmpeg', ['-y', '-v', 'error', '-i', bruto, '-c:v', 'libx264', '-crf', String(crf), '-preset', 'medium', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', parcial]);
      if (fs.statSync(parcial).size < 45 * 1024 * 1024) break;
    }
    fs.renameSync(parcial, final);
    log(`${comp}: ${final} (${(fs.statSync(final).size / 1048576).toFixed(1)} MB, render em ${Math.round((Date.now() - t0) / 1000)} s)`);
    return final;
  };
  const vertical = renderiza('W4K3V', base + '-vertical.mp4');
  registra(hash0, { vertical, titulo });
  if (args.includes('--telegram')) await enviar(vertical, draftPath, hash0, titulo, total, 1080, 1920);
  if (!args.includes('--so-vertical')) renderiza('W4K3', base + '-horizontal.mp4');
  // guarda só os 30 mais recentes
  fs.readdirSync(VIDEOS).filter((f) => f.endsWith('.mp4')).map((f) => path.join(VIDEOS, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs).slice(30).forEach((f) => fs.rmSync(f, { force: true }));
}

// videos/indice.json: hash do rascunho → vídeo. Ao publicar, o automation/video-site.js acha o vídeo
// da versão aprovada por aqui (a cópia aprovada tem os mesmos bytes do rascunho).
function registra(h, info) {
  const f = path.join(VIDEOS, 'indice.json');
  let ix = {};
  try { ix = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
  if (info) ix[h] = { ...info, quando: new Date().toISOString() }; else delete ix[h];
  const fica = Object.entries(ix).sort((a, b) => String(b[1].quando).localeCompare(String(a[1].quando))).slice(0, 30);
  fs.writeFileSync(f, JSON.stringify(Object.fromEntries(fica), null, 1));
}

async function enviar(arquivo, draft, hash0, titulo, dur, largura, altura) {
  // rascunho trocado por outra versão: este vídeo ficou velho (se só sumiu, foi publicado: manda mesmo assim)
  if (fs.existsSync(draft) && hash(draft) !== hash0) { log('rascunho mudou durante o render: vídeo não enviado'); return; }
  const cfg = JSON.parse(fs.readFileSync(path.join(BASE, 'telegram.json'), 'utf8').replace(/^﻿/, ''));
  if (!cfg.token || !cfg.chatId) { log('Telegram sem token/dono: vídeo não enviado'); return; }
  const fd = new FormData();
  fd.append('chat_id', String(cfg.chatId));
  fd.append('caption', `🎬 Vídeo da análise (rascunho): ${titulo}\nVertical para Reels/Shorts; a versão horizontal fica em %USERPROFILE%\\.w4k3\\videos. Se você pedir mudanças, faço um vídeo novo.`);
  fd.append('supports_streaming', 'true');
  fd.append('width', String(largura)); fd.append('height', String(altura)); fd.append('duration', String(Math.round(dur)));
  fd.append('video', new Blob([fs.readFileSync(arquivo)], { type: 'video/mp4' }), path.basename(arquivo));
  const r = await fetch(`https://api.telegram.org/bot${cfg.token}/sendVideo`, { method: 'POST', body: fd });
  const j = await r.json();
  log(j.ok ? 'enviado ao Telegram' : `falha no Telegram: ${j.description}`);
  if (!j.ok) process.exitCode = 1;
}

(async () => {
  try { await main(); }
  catch (e) { log('ERRO: ' + (e.stderr ? e.stderr.toString() : '') + e.message); process.exitCode = 1; }
  finally { try { if (fs.readFileSync(PIDFILE, 'utf8') === String(process.pid)) fs.rmSync(PIDFILE); } catch {} }
})();
