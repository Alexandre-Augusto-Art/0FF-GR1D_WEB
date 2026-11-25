#!/usr/bin/env node
/* Põe no site o vídeo da versão aprovada de uma análise do W4K3.
 * Uso: node automation/video-site.js <rascunho-aprovado.json> <clone do site>
 *   - acha o vídeo vertical pelo hash do rascunho em %USERPROFILE%\.w4k3\videos\indice.json
 *     (o video/scripts/gerar.js registra lá); se o render ainda estiver rodando, espera até 12 min
 *   - recomprime para a web (540x960, ~2 MB por 45 s) em assets/videos/w4k3/<data>.mp4 + capa .jpg
 *   - grava `video: { src, poster }` na entrada de hoje do data/reflections.json do clone
 * Sem vídeo, não faz nada (a publicação segue só com o texto). Sai sempre com 0, menos em erro de uso.
 * Última linha: VIDEO|<caminho no site> ou VIDEO|sem|<motivo>
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const [draftFile, clone] = process.argv.slice(2);
if (!draftFile || !clone) { console.error('uso: node automation/video-site.js <rascunho.json> <clone>'); process.exit(2); }

const BASE = path.join(os.homedir(), '.w4k3');
const INDICE = path.join(BASE, 'videos', 'indice.json');
const PIDFILE = path.join(BASE, 'video.pid');
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const sem = (motivo) => { console.log('VIDEO|sem|' + motivo); process.exit(0); };

const hash = crypto.createHash('sha1').update(fs.readFileSync(draftFile)).digest('hex');
const achar = () => { try { const v = JSON.parse(fs.readFileSync(INDICE, 'utf8'))[hash]; return v && fs.existsSync(v.vertical) ? v : null; } catch { return null; } };
const rodando = () => {
  try { process.kill(Number(fs.readFileSync(PIDFILE, 'utf8')), 0); return true; } catch { return false; }
};

(async () => {
  let v = achar();
  // aprovou antes do vídeo ficar pronto: espera o render desta versão (voz e vertical levam uns 6 a 9 min)
  for (let t = 0; !v && rodando() && t < 144; t++) { await new Promise((r) => setTimeout(r, 5000)); v = achar(); }
  if (!v) sem('nenhum vídeo desta versão do rascunho');

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
  console.log(`vídeo: ${(fs.statSync(path.join(clone, src)).size / 1048576).toFixed(1)} MB`);
  console.log('VIDEO|' + src);
})().catch((err) => { console.error(err.message); console.log('VIDEO|sem|erro: ' + err.message.split('\n')[0]); });
