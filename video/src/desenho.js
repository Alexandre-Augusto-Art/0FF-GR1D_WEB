// Vídeo do W4K3: colagem 2D com retícula, ASCII, pixel art, recortes em cor chapada e glitch, tudo desenhado por código.
// As cenas são escolhidas por frase pelo scripts/gerar.js (props.segmentos); cada quadro é desenhado do zero.
const W = 1280, H = 720;
const COR = { cyan: '#3fd0e8', magenta: '#c43cf0', lime: '#c6f03a', branco: '#f2f2f2', preto: '#050505' };


// ---------- utilitários ----------
function rnd(n) {
  let t = (Math.floor(n) * 2654435761) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const cache = {};
function tela(nome, w, h) {
  const k = nome + '_' + w + 'x' + h;
  let c = cache[k];
  if (!c) {
    c = document.createElement('canvas');
    c.width = w; c.height = h;
    c._x = c.getContext('2d', { willReadFrequently: true });
    cache[k] = c;
  }
  const x = c._x;
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.imageSmoothingEnabled = true;
  x.clearRect(0, 0, w, h);
  return c;
}
const mono = (px) => `bold ${px}px Consolas, "Courier New", monospace`;

// ---------- efeitos ----------
const RAMPA = ' .,:;-=+*#%@';
function ascii(src, ctx, ox, oy, cw, ch, cor) {
  const cols = Math.ceil(src.width / cw), rows = Math.ceil(src.height / ch);
  const s = tela('asc', cols, rows);
  s._x.drawImage(src, 0, 0, cols, rows);
  const d = s._x.getImageData(0, 0, cols, rows).data;
  ctx.fillStyle = cor; ctx.font = mono(Math.round(ch * 1.15)); ctx.textBaseline = 'top';
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = (y * cols + x) * 4;
    if (d[i + 3] < 40) continue;
    const l = (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / 255;
    const k = Math.round(l * (RAMPA.length - 1));
    if (k > 0) ctx.fillText(RAMPA[k], ox + x * cw, oy + y * ch);
  }
}
function reticula(src, ctx, ox, oy, cel, cor, ganho = 1) {
  const cols = Math.ceil(src.width / cel), rows = Math.ceil(src.height / cel);
  const s = tela('ret', cols, rows);
  s._x.drawImage(src, 0, 0, cols, rows);
  const d = s._x.getImageData(0, 0, cols, rows).data;
  ctx.fillStyle = cor; ctx.beginPath();
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = (y * cols + x) * 4, a = d[i + 3] / 255;
    const l = (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / 255 * a * ganho;
    const r = cel * 0.62 * Math.sqrt(Math.min(1, l));
    if (r < 0.5) continue;
    const cx = ox + x * cel + cel / 2, cy = oy + y * cel + cel / 2;
    ctx.moveTo(cx + r, cy); ctx.arc(cx, cy, r, 0, 6.2832);
  }
  ctx.fill();
}
function silhueta(src, ctx, ox, oy, cor) {
  const t = tela('sil', src.width, src.height);
  t._x.drawImage(src, 0, 0);
  t._x.globalCompositeOperation = 'source-in'; t._x.fillStyle = cor; t._x.fillRect(0, 0, t.width, t.height);
  ctx.drawImage(t, ox, oy);
}
// desenha em baixa resolução e corta o alfa: vira pixel art ao ampliar sem suavizar
function pixel(nome, sw, sh, desenho) {
  const c = tela('px_' + nome, sw, sh);
  desenho(c._x, sw, sh);
  const im = c._x.getImageData(0, 0, sw, sh), d = im.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 110 ? 255 : 0;
  c._x.putImageData(im, 0, 0);
  return c;
}
// recorte "colado": contorno branco + textura de retícula por cima
function adesivo(ctx, spr, x, y, esc, rot = 0, contorno = 4) {
  const w = Math.round(spr.width * esc), h = Math.round(spr.height * esc);
  const t = tela('ades', w + contorno * 2, h + contorno * 2), tx = t._x;
  tx.imageSmoothingEnabled = false;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]])
    tx.drawImage(spr, contorno + dx * contorno, contorno + dy * contorno, w, h);
  tx.globalCompositeOperation = 'source-in'; tx.fillStyle = COR.branco; tx.fillRect(0, 0, t.width, t.height);
  tx.globalCompositeOperation = 'source-over'; tx.drawImage(spr, contorno, contorno, w, h);
  tx.globalCompositeOperation = 'source-atop'; tx.fillStyle = 'rgba(0,0,0,0.25)'; tx.beginPath();
  for (let yy = 0; yy < t.height; yy += 6) for (let xx = (yy / 6) % 2 ? 3 : 0; xx < t.width; xx += 6) {
    tx.moveTo(xx + 1.3, yy); tx.arc(xx, yy, 1.3, 0, 6.2832);
  }
  tx.fill();
  ctx.save(); ctx.imageSmoothingEnabled = false;
  ctx.translate(x + t.width / 2, y + t.height / 2); ctx.rotate(rot);
  ctx.drawImage(t, -t.width / 2, -t.height / 2); ctx.restore();
}

// ---------- sprites em pixel art ----------
function rr(x, a, b, w, h, r) { x.beginPath(); x.roundRect(a, b, w, h, r); }
const celular = (passo) => pixel('cel', 24, 40, (x) => {
  x.fillStyle = COR.cyan; rr(x, 1, 1, 22, 38, 4); x.fill();
  x.fillStyle = '#0a2630'; x.fillRect(3, 5, 18, 28);
  x.save(); x.beginPath(); x.rect(3, 5, 18, 28); x.clip();
  const off = (passo * 2) % 12;
  for (let k = -1; k < 4; k++) {
    const y = 6 + k * 12 - off;
    x.fillStyle = [COR.lime, COR.magenta, COR.branco][(k + 9 + Math.floor(passo / 6)) % 3]; x.fillRect(5, y, 14, 6);
    x.fillStyle = COR.branco; x.fillRect(5, y + 8, 9, 2);
  }
  x.restore();
  x.fillStyle = '#0a2630'; x.fillRect(9, 2, 6, 1);
  x.fillStyle = COR.branco; x.fillRect(11, 35, 2, 2);
});
const cartao = (cor) => pixel('card' + cor, 12, 9, (x) => {
  x.fillStyle = COR.branco; x.fillRect(0, 0, 12, 9);
  x.fillStyle = cor; x.fillRect(1, 1, 4, 4);
  x.fillStyle = '#222'; x.fillRect(6, 1, 5, 1); x.fillRect(6, 3, 4, 1); x.fillRect(1, 6, 10, 1);
});
const olho = (aberto, px) => pixel('olho' + aberto + '_' + px, 20, 12, (x) => {
  x.save(); x.translate(10, 6); x.scale(1, aberto);
  x.fillStyle = '#d6d6d6'; x.beginPath(); x.moveTo(-9.5, 0); x.quadraticCurveTo(0, -9, 9.5, 0); x.quadraticCurveTo(0, 9, -9.5, 0); x.fill();
  x.fillStyle = '#4a4a4a'; x.beginPath(); x.arc(px, 0, 3.6, 0, 7); x.fill();
  x.fillStyle = '#000'; x.beginPath(); x.arc(px, 0, 1.8, 0, 7); x.fill();
  x.restore();
});
const bateria = (nivel) => pixel('bat' + nivel, 26, 14, (x) => {
  x.fillStyle = COR.branco; x.fillRect(0, 0, 23, 14); x.fillRect(23, 4, 3, 6);
  x.fillStyle = COR.preto; x.fillRect(2, 2, 19, 10);
  x.fillStyle = nivel <= 1 ? COR.magenta : COR.lime;
  for (let i = 0; i < nivel; i++) x.fillRect(3 + i * 4 + (i > 1 ? 1 : 0), 3, 3, 8);
});
const cruz = () => pixel('cruz', 44, 20, (x) => {
  x.fillStyle = COR.magenta; x.fillRect(0, 8, 44, 4); x.fillRect(20, 0, 4, 20); x.fillRect(3, 5, 3, 10); x.fillRect(38, 5, 3, 10);
});
const interrogacao = () => pixel('interr', 14, 20, (x) => {
  x.fillStyle = COR.lime; x.font = 'bold 21px Arial'; x.textBaseline = 'top'; x.fillText('?', 1, 0);
});

// ---------- personagem (máscara própria, não a do jogo) ----------
function figura(t, vol, w, h) {
  const c = tela('fig_corpo', w, h), x = c._x;
  let g = x.createLinearGradient(0, h * 0.55, 0, h);
  g.addColorStop(0, '#707070'); g.addColorStop(1, '#1a1a1a');
  x.fillStyle = g; x.beginPath(); x.moveTo(0, h);
  x.quadraticCurveTo(w * 0.04, h * 0.66, w * 0.5, h * 0.6); x.quadraticCurveTo(w * 0.96, h * 0.66, w, h); x.fill();
  g = x.createRadialGradient(w * 0.34, h * 0.14, 10, w * 0.5, h * 0.4, w * 0.62);
  g.addColorStop(0, '#e2e2e2'); g.addColorStop(0.45, '#727272'); g.addColorStop(1, '#141414');
  x.fillStyle = g; x.beginPath(); x.moveTo(w * 0.5, h * 0.03);
  x.bezierCurveTo(w * 0.86, h * 0.03, w * 0.95, h * 0.42, w * 0.82, h * 0.72);
  x.lineTo(w * 0.18, h * 0.72);
  x.bezierCurveTo(w * 0.05, h * 0.42, w * 0.14, h * 0.03, w * 0.5, h * 0.03); x.fill();
  g = x.createRadialGradient(w * 0.5, h * 0.42, w * 0.05, w * 0.5, h * 0.42, w * 0.27);
  g.addColorStop(0, '#000'); g.addColorStop(0.75, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.beginPath(); x.ellipse(w * 0.5, h * 0.42, w * 0.27, h * 0.27, 0, 0, 7); x.fill();

  // máscara: placa oval com fendas nos olhos e a boca como equalizador da voz
  const m = tela('fig_masc', w, h), y = m._x;
  g = y.createLinearGradient(w * 0.35, h * 0.22, w * 0.62, h * 0.62);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#bcbcbc'); g.addColorStop(1, '#575757');
  y.fillStyle = g; y.beginPath(); y.ellipse(w * 0.5, h * 0.43, w * 0.165, h * 0.205, 0, 0, 7); y.fill();
  y.globalCompositeOperation = 'destination-out';
  for (const [ex, r] of [[0.43, 0.22], [0.57, -0.22]]) {
    y.save(); y.translate(w * ex, h * 0.37); y.rotate(r); y.fillRect(-w * 0.055, -h * 0.017, w * 0.11, h * 0.034); y.restore();
  }
  const n = 7, bw = w * 0.022, gap = w * 0.012, x0 = w * 0.5 - (n * bw + (n - 1) * gap) / 2;
  for (let i = 0; i < n; i++) {
    const k = Math.min(1, 0.15 + vol * (0.55 + 0.45 * rnd(i * 97 + Math.floor(t * 12))) * 1.5);
    const bh = h * 0.012 + h * 0.075 * k * (1 - Math.abs(i - 3) / 5);
    y.fillRect(x0 + i * (bw + gap), h * 0.53 - bh / 2, bw, bh);
  }
  y.globalCompositeOperation = 'source-over';
  return { corpo: c, mascara: m };
}
function desenhaFigura(ctx, frame, vol, ox, oy, esc) {
  const t = frame / 30;
  const w = Math.round(440 * esc), h = Math.round(540 * esc);
  const { corpo, mascara } = figura(t, vol, w, h);
  oy += Math.sin(t * 2.2) * 4 * esc; // respiração (loop)
  if (vol > 0.55) ox += (rnd(frame * 13) - 0.5) * vol * 14;
  silhueta(corpo, ctx, ox, oy, '#000');
  reticula(corpo, ctx, ox, oy, Math.round(7 * esc), '#e6e6e6', 1.15);
  ascii(mascara, ctx, ox, oy, Math.round(6 * esc), Math.round(8 * esc), '#f4f4f4');
  // olhos acendem com a voz
  ctx.save(); ctx.fillStyle = COR.lime; ctx.shadowColor = COR.lime; ctx.shadowBlur = 18 * esc;
  ctx.globalAlpha = 0.3 + vol * 0.7;
  for (const [ex, r] of [[0.43, 0.22], [0.57, -0.22]]) {
    ctx.save(); ctx.translate(ox + w * ex, oy + h * 0.37); ctx.rotate(r);
    ctx.fillRect(-w * 0.04, -h * 0.008, w * 0.08, h * 0.016); ctx.restore();
  }
  ctx.restore();
}

// ---------- fundos ----------
function binario(ctx, frame) {
  ctx.font = mono(20); ctx.textBaseline = 'top';
  const cw = 26, ch = 30, cols = Math.ceil(W / cw) + 1, rows = Math.ceil(H / ch) + 2;
  for (let c = 0; c < cols; c++) {
    const rolagem = frame * (1.2 + rnd(c * 7) * 3.2), off = rolagem % ch, base = Math.floor(rolagem / ch);
    for (let r = -1; r < rows; r++) {
      const lin = r - base, s = rnd(c * 1000 + lin * 7 + 3);
      if (s < 0.45) continue;
      ctx.fillStyle = rnd(c * 31 + lin * 13) > 0.93 ? '#9a9a9a' : '#2c2c2c';
      ctx.fillText(s > 0.72 ? '1' : '0', c * cw, r * ch + off);
    }
  }
}
function gradeOlhos(ctx, frame) {
  ctx.imageSmoothingEnabled = false;
  let id = 0;
  for (let y = -10; y < H; y += 84) for (let x = (y / 84) % 2 ? -64 : 0; x < W; x += 128) {
    id++;
    const pisca = rnd(id * 31 + Math.floor(frame / 9)) < 0.07;
    const px = x + 40 < 640 ? 3 : -3;
    ctx.drawImage(olho(pisca ? 0.15 : 1, px), x + 24, y + 18, 80, 48);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
}
function multidao(frame, t, balanco) {
  const c = tela('multi', W, 440), x = c._x, passo = Math.floor(frame / 3), cabecas = [], todas = [];
  for (let fila = 0; fila < 2; fila++) for (let i = 0; i < 10; i++) {
    const id = fila * 10 + i, esc = fila === 0 ? 0.8 : 1.05;
    const presa = fila === 1 && i % 2 === 1 && i < 9;
    const px = 30 + i * 128 + (fila === 0 ? 64 : 0) + (rnd(id * 3) - 0.5) * 40 + (rnd(passo * 50 + id) - 0.5) * 3;
    const py = (fila === 0 ? 150 : 235) + (presa ? Math.sin(t * 4 + i) * 12 * balanco : 0) + (rnd(passo * 70 + id) - 0.5) * 3;
    const braco = fila === 1 && !presa && rnd(id * 11) > 0.55;
    const g = x.createLinearGradient(0, py - 70 * esc, 0, py + 220 * esc);
    g.addColorStop(0, '#e4e4e4'); g.addColorStop(0.5, '#7a7a7a'); g.addColorStop(1, '#1c1c1c');
    x.fillStyle = g; x.strokeStyle = '#000'; x.lineWidth = 5;
    if (braco) {
      x.lineCap = 'round'; x.lineWidth = 22 * esc; x.strokeStyle = g;
      x.beginPath(); x.moveTo(px + 40 * esc, py + 30 * esc); x.lineTo(px + 72 * esc, py - 70 * esc); x.lineTo(px + 78 * esc, py - 125 * esc); x.stroke();
      x.strokeStyle = '#000'; x.lineWidth = 5;
    }
    x.beginPath(); x.moveTo(px - 62 * esc, py + 230 * esc); x.quadraticCurveTo(px - 60 * esc, py, px, py - 2 * esc);
    x.quadraticCurveTo(px + 60 * esc, py, px + 62 * esc, py + 230 * esc); x.closePath(); x.stroke(); x.fill();
    x.beginPath(); x.arc(px, py - 40 * esc, 30 * esc, 0, 7); x.stroke(); x.fill();
    if (presa) cabecas.push({ x: px, y: py - 70 * esc });
    todas.push({ x: px, y: py - 40 * esc, r: 30 * esc, id });
  }
  return { c, cabecas, todas };
}

// ---------- pós-processamento ----------
function pos(ctx, frame, glitch) {
  if (glitch > 0) {
    const snap = tela('snap', W, H); snap._x.drawImage(ctx.canvas, 0, 0);
    const n = Math.round(4 + glitch * 14);
    for (let k = 0; k < n; k++) {
      const s = frame * 101 + k * 7;
      const y = Math.floor(rnd(s) * H), h = Math.floor(4 + rnd(s + 1) * 50 * glitch), dx = Math.round((rnd(s + 2) - 0.5) * 240 * glitch);
      ctx.drawImage(snap, 0, y, W, h, dx, y, W, h);
    }
  }
  const sep = Math.round(2 + glitch * 16);
  const im = ctx.getImageData(0, 0, W, H), d = im.data, o = new Uint8ClampedArray(d);
  const passo = sep * 4;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = o[i + passo] ?? 0;          // vermelho puxado da direita
    d[i + 2] = i >= passo ? o[i - passo + 2] : 0; // azul puxado da esquerda
  }
  ctx.putImageData(im, 0, 0);
  // granulação
  const gr = tela('grao', 320, 180), gd = gr._x.createImageData(320, 180);
  for (let i = 0; i < gd.data.length; i += 4) { const v = rnd(frame * 977 + i) * 255; gd.data[i] = gd.data[i + 1] = gd.data[i + 2] = v; gd.data[i + 3] = 255; }
  gr._x.putImageData(gd, 0, 0);
  ctx.save(); ctx.globalAlpha = 0.07; ctx.globalCompositeOperation = 'screen'; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(gr, 0, 0, W, H); ctx.restore();
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
}


// ---------- sprites extras ----------
const camera = () => pixel('cam', 26, 14, (x) => {
  x.fillStyle = COR.cyan; x.fillRect(4, 2, 18, 9); x.fillRect(22, 4, 3, 5);
  x.fillStyle = '#0a2630'; x.fillRect(0, 4, 5, 5);
  x.fillStyle = COR.magenta; x.fillRect(18, 3, 2, 2);
  x.fillStyle = COR.branco; x.fillRect(12, 11, 3, 3);
});
const tv = (passo) => pixel('tv', 30, 24, (x) => {
  x.fillStyle = COR.magenta; rr(x, 0, 2, 30, 20, 3); x.fill();
  x.fillRect(6, 22, 4, 2); x.fillRect(20, 22, 4, 2);
  x.fillStyle = '#111'; x.fillRect(3, 5, 19, 14);
  for (let y = 5; y < 19; y++) for (let k = 3; k < 22; k++) if (rnd(passo * 977 + y * 31 + k) > 0.55) {
    x.fillStyle = rnd(y * 7 + k + passo) > 0.8 ? COR.lime : '#cfcfcf'; x.fillRect(k, y, 1, 1);
  }
  x.fillStyle = COR.branco; x.fillRect(25, 7, 2, 2); x.fillRect(25, 12, 2, 2);
});

// ---------- textos ----------
const SIMBOLOS = '01#$%&*+=<>/\\|';
function carimbo(ctx, txt, x, y, cor, idade) {
  if (idade < 0) return;
  const pronto = Math.floor(idade / 1.5); // "decodifica" o texto nos primeiros quadros
  let s = '';
  for (let i = 0; i < txt.length; i++) s += i < pronto || txt[i] === ' ' ? txt[i] : SIMBOLOS[Math.floor(rnd(idade * 17 + i) * SIMBOLOS.length)];
  ctx.font = mono(24); ctx.textBaseline = 'top';
  const w = ctx.measureText(s).width;
  const dx = idade < 4 ? (rnd(idade * 5 + x) - 0.5) * 30 : 0;
  ctx.fillStyle = '#000'; ctx.fillRect(x - 10 + dx, y - 7, w + 20, 38);
  ctx.fillStyle = cor; ctx.fillText(s, x + dx, y);
}
function quebra(ctx, txt, larg) {
  const linhas = [];
  let cur = '';
  for (const w of txt.split(/\s+/)) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > larg && cur) { linhas.push(cur); cur = w; } else cur = t;
  }
  if (cur) linhas.push(cur);
  return linhas;
}
function grupos(palavras) {
  const gs = [];
  for (const p of palavras) {
    const g = gs[gs.length - 1];
    if (!g || g.s !== p.s || g.ps.length >= 5) gs.push({ s: p.s, ps: [p] });
    else g.ps.push(p);
  }
  gs.forEach((g) => { g.ini = g.ps[0].ini; });
  gs.forEach((g, i) => { g.fim = gs[i + 1] && gs[i + 1].s === g.s ? gs[i + 1].ini : g.ps[g.ps.length - 1].fim + 0.35; });
  return gs;
}
function legenda(ctx, gs, t) {
  const g = gs.find((g) => t >= g.ini && t < g.fim);
  if (!g) return;
  ctx.font = 'bold 34px "Segoe UI", Arial, sans-serif'; ctx.textBaseline = 'top';
  const esp = ctx.measureText(' ').width, linhas = [[]];
  let larg = 0;
  for (const p of g.ps) {
    const w = ctx.measureText(p.w).width;
    if (larg + w > 860 && linhas[linhas.length - 1].length) { linhas.push([]); larg = 0; }
    linhas[linhas.length - 1].push({ p, w }); larg += w + esp;
  }
  linhas.forEach((ln, li) => {
    const y = 640 - (linhas.length - 1 - li) * 46;
    let x = 200;
    const total = ln.reduce((a, b) => a + b.w + esp, -esp);
    ctx.fillStyle = '#000'; ctx.fillRect(x - 8, y - 4, total + 16, 46);
    for (const { p, w } of ln) {
      ctx.fillStyle = t >= p.ini && t < p.fim ? COR.lime : COR.branco;
      ctx.fillText(p.w, x, y); x += w + esp;
    }
  });
}
function selo(ctx) {
  ctx.fillStyle = COR.branco; ctx.fillRect(1160, 18, 100, 78);
  ctx.fillStyle = '#000'; ctx.font = mono(30); ctx.textBaseline = 'top'; ctx.fillText('W4K3', 1174, 26);
  ctx.font = mono(13); ctx.fillText('0FF-GR1D', 1180, 66);
}
function textoAscii(ctx, txt, x, y, larg, cor, maxPx = 150) {
  const c0 = tela('medida', 10, 10)._x;
  let px = maxPx;
  c0.font = `bold ${px}px Consolas, monospace`;
  while (c0.measureText(txt).width > larg && px > 40) { px -= 6; c0.font = `bold ${px}px Consolas, monospace`; }
  const w = Math.ceil(c0.measureText(txt).width) + 8;
  const c = tela('txtasc', w, Math.ceil(px * 1.1)), cx = c._x;
  cx.fillStyle = '#fff'; cx.font = `bold ${px}px Consolas, monospace`; cx.textBaseline = 'top'; cx.fillText(txt, 0, 0);
  ascii(c, ctx, x, y, 6, 8, cor);
  return { w, h: c.height };
}

// ---------- cenas (lf = quadro dentro da cena, len = duração da cena) ----------
function abertura(ctx, f, lf, len, vol, seg, P) {
  binario(ctx, f);
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H);
  desenhaFigura(ctx, f, vol, 790, 170, 1);
  carimbo(ctx, 'W4K3 PR0T0C0L // NOTÍCIA DO DIA', 90, 110, COR.lime, lf);
  ctx.font = 'bold 56px "Segoe UI", Arial, sans-serif'; ctx.textBaseline = 'top';
  const linhas = quebra(ctx, P.titulo.toUpperCase(), 640);
  linhas.forEach((ln, i) => {
    if (lf < 4 + i * 4) return; // entra uma tira por vez, como recorte colado
    const y = 190 + i * 78, w = ctx.measureText(ln).width;
    ctx.save(); ctx.translate(90, y); ctx.rotate((rnd(i * 13) - 0.5) * 0.05);
    ctx.fillStyle = i % 2 ? COR.branco : COR.lime; ctx.fillRect(-12, -6, w + 24, 70);
    ctx.fillStyle = '#000'; ctx.fillText(ln, 0, 0); ctx.restore();
  });
  if (P.fonte) carimbo(ctx, 'FONTE: ' + P.fonte.toUpperCase(), 90, 210 + linhas.length * 78, COR.cyan, lf - 14);
}
function manchete(ctx, f, lf, len, vol, seg, P) {
  binario(ctx, f);
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H);
  desenhaFigura(ctx, f, vol, 830, 250, 0.85);
  const c = tela('jornal', 660, 440), x = c._x;
  x.fillStyle = '#e9e5d8'; x.fillRect(0, 0, 660, 440);
  x.fillStyle = '#111'; x.font = mono(16); x.textBaseline = 'top';
  x.fillText((P.fonte || 'NOTÍCIA').toUpperCase() + '   ·   ' + (P.data || ''), 28, 22);
  x.fillRect(28, 46, 604, 3);
  x.font = 'bold 40px Georgia, "Times New Roman", serif';
  const linhas = quebra(x, P.noticia || P.titulo, 600).slice(0, 4);
  x.fillStyle = 'rgba(196,60,240,0.55)';
  x.fillRect(22, 64, Math.min(612, x.measureText(linhas[0] || '').width + 14), 48); // marca-texto
  x.fillStyle = '#111';
  linhas.forEach((ln, i) => x.fillText(ln, 28, 66 + i * 48));
  const y0 = 90 + linhas.length * 48;
  x.fillStyle = '#9a978d';
  for (let col = 0; col < 2; col++) for (let y = y0; y < 420; y += 14) x.fillRect(28 + col * 310, y, 280 - rnd(y + col * 99) * 60, 6);
  // "foto" em retícula numa das colunas
  const foto = multidao(f, f / 30, 0).c;
  x.save(); x.beginPath(); x.rect(340, y0, 292, 420 - y0); x.clip();
  x.fillStyle = '#e9e5d8'; x.fillRect(340, y0, 292, 420 - y0);
  reticula(foto, x, 300, y0 - 30, 5, '#222', 1.2);
  x.restore();
  const passo = Math.floor(lf / 2.5), entra = Math.min(1, passo / 5);
  ctx.save(); ctx.translate(110 - (1 - entra) * 760 + 330, 110 + 220); ctx.rotate(-0.04 + (rnd(passo) - 0.5) * 0.01);
  ctx.fillStyle = '#000'; ctx.fillRect(-330 + 12, -220 + 12, 660, 440);
  ctx.drawImage(c, -330, -220); ctx.restore();
}
function plataforma(ctx, f, lf, len, vol) {
  binario(ctx, f);
  const passo = Math.floor(f / 2.5); // animação "a 12 quadros", como colagem
  adesivo(ctx, celular(passo), 900, 150, 7, Math.sin(passo * 0.7) * 0.05);
  for (let i = 0; i < Math.ceil(len / 15) + 1; i++) {
    const ini = i * 15 - 30, dur = 48;
    if (lf < ini || lf >= ini + dur) continue;
    const p = Math.floor((lf - ini) / 2.5) * 2.5 / dur;
    const sx = 470 + rnd(i * 3) * 380, sy = 760, tx = 985, ty = 300;
    const x = sx + (tx - sx) * p, y = sy + (ty - sy) * p - Math.sin(p * Math.PI) * 120;
    adesivo(ctx, cartao([COR.lime, COR.magenta, COR.cyan][i % 3]), x - 30, y - 22, 4.2 - p * 2.6, (rnd(i * 5 + Math.floor(p * 8)) - 0.5) * 0.6, 3);
  }
  desenhaFigura(ctx, f, vol, 40, 175, 1);
}
function marionete(ctx, f, lf, len) {
  gradeOlhos(ctx, f);
  const t = f / 30, p = lf / len;
  const { c, cabecas } = multidao(f, t, 1);
  reticula(c, ctx, 0, 300, 7, '#d4d4d4', 1.1);
  const ang = Math.sin(t * 2.2) * 0.16, cx = 640, cy = 105;
  ctx.strokeStyle = COR.branco; ctx.lineWidth = 2; ctx.beginPath();
  cabecas.forEach((h, k) => {
    const u = -140 + k * (280 / Math.max(1, cabecas.length - 1));
    ctx.moveTo(cx + u * Math.cos(ang), cy + u * Math.sin(ang) + 14); ctx.lineTo(h.x, h.y + 300);
  });
  ctx.stroke();
  adesivo(ctx, cruz(), cx - 158, cy - 74, 7, ang);
  const nivel = Math.max(0, 4 - Math.floor(p * 5.5));
  if (nivel > 0 || Math.floor(f / 4) % 2) adesivo(ctx, bateria(nivel), 990, 120, 7, -0.06);
}
function vigilancia(ctx, f, lf, len, vol) {
  binario(ctx, f * 0.5);
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H);
  const t = f / 30, passo = Math.floor(f / 2.5);
  const { c, todas } = multidao(f, t, 0);
  reticula(c, ctx, 0, 290, 7, '#bdbdbd', 1.05);
  // câmeras varrendo a multidão
  [[150, 70, 0], [600, 40, 1], [1010, 120, 2]].forEach(([x, y, k]) => {
    const a = 0.9 + Math.sin(passo * 0.18 + k * 2) * 0.55;
    ctx.save(); ctx.globalAlpha = 0.16; ctx.fillStyle = COR.lime; ctx.beginPath();
    ctx.moveTo(x + 40, y + 40);
    ctx.lineTo(x + 40 + Math.cos(a - 0.22) * 700, y + 40 + Math.sin(a - 0.22) * 700);
    ctx.lineTo(x + 40 + Math.cos(a + 0.22) * 700, y + 40 + Math.sin(a + 0.22) * 700);
    ctx.fill(); ctx.restore();
    adesivo(ctx, camera(), x, y, 4, a - Math.PI, 3);
  });
  // perfis marcados (caixas de identificação)
  ctx.font = mono(15); ctx.textBaseline = 'top'; ctx.lineWidth = 3;
  todas.filter((h) => rnd(h.id * 7 + Math.floor(lf / 20)) > 0.72).slice(0, 4).forEach((h) => {
    const x = h.x - h.r - 8, y = h.y + 290 - h.r - 8, s = h.r * 2 + 16;
    ctx.strokeStyle = COR.lime; ctx.strokeRect(x, y, s, s);
    const id = 'ID ' + Math.floor(rnd(h.id * 13) * 65535).toString(16).toUpperCase().padStart(4, '0');
    ctx.fillStyle = COR.lime; ctx.fillRect(x, y - 20, ctx.measureText(id).width + 10, 20);
    ctx.fillStyle = '#000'; ctx.fillText(id, x + 5, y - 18);
  });
  if (Math.floor(f / 15) % 2) { ctx.fillStyle = COR.magenta; ctx.beginPath(); ctx.arc(70, 200, 9, 0, 7); ctx.fill(); }
  ctx.fillStyle = COR.branco; ctx.font = mono(22); ctx.fillText('REC', 88, 189);
}
function obra(ctx, f, lf, len, vol, seg, P) {
  binario(ctx, f);
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
  const nome = ((P.refs && P.refs.length ? P.refs[seg.k % P.refs.length] : 'DISTOPIA') || 'DISTOPIA').toUpperCase();
  carimbo(ctx, 'ESPELHO DA FICÇÃO', 90, 70, COR.lime, lf);
  if (lf >= 6) textoAscii(ctx, nome, 90, 130, 1100, COR.cyan);
  const passo = Math.floor(f / 2.5);
  adesivo(ctx, tv(passo), 880, 330, 10, Math.sin(passo * 0.5) * 0.04);
  desenhaFigura(ctx, f, vol, 40, 300, 0.75);
}
function pergunta(ctx, f, lf, len, vol) {
  ctx.strokeStyle = '#151515'; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = 0; x < W; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = 0; y < H; y += 40) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  binario(ctx, f * 0.5);
  const n = Math.min(14, Math.floor(lf / 5) + 2);
  ctx.save(); ctx.strokeStyle = COR.cyan; ctx.lineWidth = 9; ctx.lineJoin = 'miter'; ctx.shadowColor = COR.cyan; ctx.shadowBlur = 14;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = 520 + i * 52, y = 600 - i * 30 + (rnd(i * 5) - 0.5) * 110;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke(); ctx.restore();
  desenhaFigura(ctx, f, vol, 70, 70, 1.22);
  const e = 12 + vol * 3;
  adesivo(ctx, interrogacao(), 1030 - (e - 12) * 7, 250 - (e - 12) * 10, e, Math.sin(Math.floor(f / 3)) * 0.06);
}
function cenaFinal(ctx, f, P) {
  binario(ctx, f);
  ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(0, 0, W, H);
  textoAscii(ctx, 'W4K3 PR0T0C0L', 200, 250, 880, COR.lime, 118);
  ctx.font = mono(26); ctx.fillStyle = COR.branco; ctx.textBaseline = 'top';
  ctx.fillText('0FF-GR1D  //  a notícia do dia pela lente da distopia', 205, 420);
  if (P.fonte) { ctx.fillStyle = '#8a8a8a'; ctx.font = mono(18); ctx.fillText('fonte: ' + P.fonte, 205, 465); }
}

const CENAS = { abertura, manchete, plataforma, marionete, vigilancia, obra, pergunta };
// onde os rótulos de palavras-chave aparecem em cada cena (fora dos elementos principais)
const VAGAS = {
  abertura: [], manchete: [[830, 90], [860, 165]], plataforma: [[520, 70], [560, 140], [530, 210]],
  marionete: [[60, 70], [60, 135]], vigilancia: [[300, 190], [640, 230]], obra: [[480, 420], [520, 490]],
  pergunta: [[690, 90], [760, 165]],
};
const CORES = [COR.lime, COR.branco, COR.cyan, COR.magenta];

// ---------- quadro ----------
let _gs = null, _gsDe = null;
export function desenhar(ctx, frame, P) {
  if (_gsDe !== P.palavras) { _gs = grupos(P.palavras); _gsDe = P.palavras; P.segmentos.forEach((s, i, a) => { s.k = a.slice(0, i).filter((x) => x.cena === s.cena).length; }); }
  const t = frame / P.fps, vol = P.vol[frame] || 0;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = COR.preto; ctx.fillRect(0, 0, W, H);

  const seg = frame < P.final ? P.segmentos.filter((s) => s.ini <= frame).pop() : null;
  if (seg) {
    const lf = frame - seg.ini, len = Math.max(1, seg.fim - seg.ini);
    CENAS[seg.cena](ctx, frame, lf, len, vol, seg, P);
    const vagas = VAGAS[seg.cena] || [];
    seg.chaves.forEach((c, i) => {
      if (seg.cena === 'obra' && P.refs.some((r) => r.toUpperCase() === c.txt)) return; // o nome já está grande na tela
      if (i < vagas.length && frame >= c.ini) carimbo(ctx, c.txt, vagas[i][0], vagas[i][1], CORES[(seg.k + i) % CORES.length], frame - c.ini);
    });
    if (seg.cena !== 'abertura') legenda(ctx, _gs, t);
    selo(ctx);
  } else cenaFinal(ctx, frame, P);

  let glitch = 0;
  for (const c of [...P.segmentos.slice(1).map((s) => s.ini), P.final]) glitch = Math.max(glitch, 1 - Math.abs(frame - c) / 4);
  if (vol > 0.8 && rnd(frame * 3) < 0.3) glitch = Math.max(glitch, 0.35);
  if (rnd(frame * 7 + 1) < 0.04) glitch = Math.max(glitch, 0.15);
  pos(ctx, frame, glitch);
}
