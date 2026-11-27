#!/usr/bin/env node
/* Põe no site o vídeo da versão aprovada de uma análise do W4K3.
 * Uso: node automation/video-site.js <rascunho-aprovado.json> <clone do site>
 *      node automation/video-site.js --pendente <clone do site>
 *   - acha o vídeo vertical pelo hash do rascunho em %USERPROFILE%\.w4k3\videos\indice.json
 *     (o video/scripts/gerar.js registra lá)
 *   - se o render desta versão ainda estiver rodando, não espera: anota em video-pendente.json e o
 *     texto sai sem vídeo; quando o render termina, o gerar.js chama o run-w4k3.ps1 -VideoPendente,
 *     que roda este script com --pendente e põe o vídeo na entrada daquele dia
 *   - recomprime para a web (540x960, ~2 MB por 45 s) em assets/videos/w4k3/<data>.mp4 + capa .jpg
 *   - grava `video: { src, poster }` na entrada de hoje do data/reflections.json do clone
 * Sem vídeo, não faz nada (a publicação segue só com o texto). Sai sempre com 0, menos em erro de uso.
 * Última linha: VIDEO|<caminho no site>, VIDEO|pendente|<motivo> ou VIDEO|sem|<motivo>
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const [draftFile, clone] = process.argv.slice(2);
if (!draftFile || !clone) { console.error('uso: node automation/video-site.js <rascunho.json | --pendente> <clone>'); process.exit(2); }
const PENDENTE_MODO = draftFile === '--pendente';

const BASE = path.join(os.homedir(), '.w4k3');
const INDICE = path.join(BASE, 'videos', 'indice.json');
const PIDFILE = path.join(BASE, 'video.pid');
const PENDENTE = path.join(BASE, 'video-pendente.json');
const sem = (motivo) => { console.log('VIDEO|sem|' + motivo); process.exit(0); };

// aprovado sem vídeo pronto: {hash, data, pid} do render que ainda vai terminar
let pend = null;
try { pend = JSON.parse(fs.readFileSync(PENDENTE, 'utf8')); } catch {}
if (PENDENTE_MODO && !pend) sem('nenhum vídeo pendente');
// aprovação nova: um vídeo pendente de versão anterior não pode mais cair na entrada do dia
if (!PENDENTE_MODO) fs.rmSync(PENDENTE, { force: true });
const today = PENDENTE_MODO ? pend.data : new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const hash = PENDENTE_MODO ? pend.hash : crypto.createHash('sha1').update(fs.readFileSync(draftFile)).digest('hex');
const achar = () => { try { const v = JSON.parse(fs.readFileSync(INDICE, 'utf8'))[hash]; return v && fs.existsSync(v.vertical) ? v : null; } catch { return null; } };
const rodando = () => {
  try { const pid = Number(fs.readFileSync(PIDFILE, 'utf8')); process.kill(pid, 0); return pid; } catch { return 0; }
};

(async () => {
  const v = achar();
  if (!v && PENDENTE_MODO) { fs.rmSync(PENDENTE, { force: true }); sem('o render terminou sem vídeo'); }
  if (!v) {
    // aprovou antes do vídeo ficar pronto (só a voz leva uns 20 min): o texto sai agora, o vídeo depois
    const pid = rodando();
    if (!pid) sem('nenhum vídeo desta versão do rascunho');
    fs.writeFileSync(PENDENTE, JSON.stringify({ hash, data: today, pid }));
    console.log('VIDEO|pendente|o vídeo entra no site quando o render terminar');
    return;
  }

  const dir = path.join(clone, 'assets', 'videos', 'w4k3');
  fs.mkdirSync(dir, { recursive: true });
  const src = `assets/videos/w4k3/${today}.mp4`, poster = `assets/videos/w4k3/${today}.jpg`;
  // tudo é feito fora do clone e só entra nele se der certo (nada pela metade vai para o commit)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w4k3-site-'));
  const tVid = path.join(tmp, 'v.mp4'), tCapa = path.join(tmp, 'v.jpg');
  // -xerror: qualquer erro no vídeo de origem (arquivo truncado etc.) aborta em vez de gerar um vídeo pela metade
  const ff = (a) => execFileSync('ffmpeg', ['-y', '-v', 'error', '-xerror', ...a], { windowsHide: true, maxBuffer: 1 << 26 });
  ff(['-i', v.vertical, '-vf', 'fps=24,scale=540:960:flags=area,hqdn3d=3:3:6:6', '-c:v', 'libx264', '-crf', '38', '-preset', 'slow', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '64k', '-ac', '1', '-movflags', '+faststart', tVid]);
  // capa: um quadro do apresentador, logo depois da abertura
  ff(['-ss', '2.5', '-i', v.vertical, '-frames:v', '1', '-vf', 'scale=540:960', '-q:v', '5', tCapa]);

  const file = path.join(clone, 'data', 'reflections.json');
  const list = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  const e = list.find((x) => x && (x.id === today || x.date === today));
  if (!e) sem('entrada de hoje não encontrada no reflections.json');
  fs.copyFileSync(tVid, path.join(clone, src));
  fs.copyFileSync(tCapa, path.join(clone, poster));
  fs.rmSync(tmp, { recursive: true, force: true });
  e.video = { src, poster };
  fs.writeFileSync(file, JSON.stringify(list, null, 2) + '\n');
  if (PENDENTE_MODO) fs.rmSync(PENDENTE, { force: true });
  console.log(`vídeo: ${(fs.statSync(path.join(clone, src)).size / 1048576).toFixed(1)} MB`);
  console.log('VIDEO|' + src);
})().catch((err) => { console.error(err.message); console.log('VIDEO|sem|erro: ' + err.message.split('\n')[0]); });
