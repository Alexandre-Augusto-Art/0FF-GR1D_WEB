// Base do desenho: utilitários, pontilhado (dither), texto e transições. Tudo em canvas, sem imagem externa.
export const COR = { cyan: '#19e3f2', magenta: '#f0107a', lime: '#b4ff14', roxo: '#8a1cff', branco: '#f2f2f2', preto: '#050505' };
export const T = { W: 1080, H: 1920, v: true, cel: 4 };   // tamanho do quadro atual (desenhar() atualiza)

export function rnd(n) {
  let t = (Math.floor(n) * 2654435761) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const suave = (x) => { const k = clamp(x); return k * k * (3 - 2 * k); };
export const salto = (x) => { const k = clamp(x); return Math.max(0, 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2); }; // entra passando do ponto

const cache = {};
export function tela(nome, w, h) {
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
  x.shadowBlur = 0; x.lineCap = 'butt'; x.lineJoin = 'miter'; x.textAlign = 'left';
  x.clearRect(0, 0, w, h);
  return c;
}
export const mono = (px) => `bold ${px}px Consolas, "Courier New", monospace`;
export const grossa = (px) => `900 ${px}px "Segoe UI Black", "Arial Black", Arial, sans-serif`;
export const fina = (px) => `300 ${px}px "Segoe UI Light", "Segoe UI", Arial, sans-serif`;
export const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// ---------- pontilhado: desenha em cinza numa tela pequena e converte em pixels de uma cor só ----------
// cor: pixels claros; escuro: pixels escuros do objeto (null = transparente); contorno: recorte em volta
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export function pb(ctx, desenho, { cor = COR.branco, escuro = null, contorno = null, cel = T.cel, alfa = 1 } = {}) {
  const w = Math.ceil(T.W / cel), h = Math.ceil(T.H / cel);
  const c = tela('pb', w, h), x = c._x;
  x.save(); x.scale(1 / cel, 1 / cel); desenho(x); x.restore();
  const im = x.getImageData(0, 0, w, h), d = im.data;
  const [r, g, b] = rgb(cor), e = escuro ? rgb(escuro) : null, k = contorno ? rgb(contorno) : null;
  const al = k ? new Uint8Array(w * h) : null;
  if (k) for (let i = 0; i < w * h; i++) al[i] = d[i * 4 + 3] > 120 ? 1 : 0;
  for (let y = 0, i = 0; y < h; y++) for (let xx = 0; xx < w; xx++, i += 4) {
    if (d[i + 3] > 120) {
      const l = (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / 255;
      if (l > BAYER[(y & 3) * 4 + (xx & 3)]) { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; }
      else if (e) { d[i] = e[0]; d[i + 1] = e[1]; d[i + 2] = e[2]; d[i + 3] = 255; }
      else d[i + 3] = 0;
    } else {
      d[i + 3] = 0;
      if (k) {
        const j = y * w + xx;
        if ((xx > 0 && al[j - 1]) || (xx < w - 1 && al[j + 1]) || (y > 0 && al[j - w]) || (y < h - 1 && al[j + w])) { d[i] = k[0]; d[i + 1] = k[1]; d[i + 2] = k[2]; d[i + 3] = 255; }
      }
    }
  }
  x.putImageData(im, 0, 0);
  ctx.save(); ctx.imageSmoothingEnabled = false; ctx.globalAlpha = alfa;
  ctx.drawImage(c, 0, 0, w * cel, h * cel); ctx.restore();
}

// ---------- ASCII (usado na máscara e no logo) ----------
const RAMPA = ' .,:;-=+*#%@';
export function ascii(src, ctx, ox, oy, cw, ch, cor) {
  const cols = Math.ceil(src.width / cw), rows = Math.ceil(src.height / ch);
  const s = tela('asc', cols, rows);
  s._x.drawImage(src, 0, 0, cols, rows);
  const d = s._x.getImageData(0, 0, cols, rows).data;
  ctx.fillStyle = cor; ctx.font = mono(Math.round(ch * 1.15)); ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = (y * cols + x) * 4;
    if (d[i + 3] < 40) continue;
    const l = (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / 255;
    const k = Math.round(l * (RAMPA.length - 1));
    if (k > 0) ctx.fillText(RAMPA[k], ox + x * cw, oy + y * ch);
  }
}

// ---------- texto ----------
export function quebra(ctx, txt, larg) {
  const linhas = [];
  let cur = '';
  for (const w of String(txt).split(/\s+/).filter(Boolean)) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > larg && cur) { linhas.push(cur); cur = w; } else cur = t;
  }
  if (cur) linhas.push(cur);
  return linhas;
}
// maior corpo de letra que cabe na caixa
export function cabe(ctx, txt, larg, alt, max, fonte = grossa, entre = 1.06) {
  for (let px = max; px > 22; px -= 4) {
    ctx.font = fonte(px);
    const ls = quebra(ctx, txt, larg);
    if (ls.length * px * entre <= alt && ls.every((l) => ctx.measureText(l).width <= larg)) return { px, ls };
  }
  ctx.font = fonte(22);
  return { px: 22, ls: quebra(ctx, txt, larg) };
}
export function bloco(ctx, txt, cx, cy, larg, alt, max, cor, { fonte = grossa, tremor = 0, seed = 0, sombra = null, entre = 1.06 } = {}) {
  const { px, ls } = cabe(ctx, txt, larg, alt, max, fonte, entre);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  ls.forEach((l, i) => {
    const x = cx + (rnd(seed * 3 + i) - 0.5) * tremor, y = cy + (i - (ls.length - 1) / 2) * px * entre + (rnd(seed * 5 + i) - 0.5) * tremor;
    if (sombra) { ctx.fillStyle = sombra; ctx.fillText(l, x + px * 0.06, y + px * 0.06); }
    ctx.fillStyle = cor; ctx.fillText(l, x, y);
  });
  ctx.textAlign = 'left';
  return { px, n: ls.length };
}
const SIMBOLOS = '01#$%&*+=<>/|';
export const decifra = (txt, idade, v = 1.5) => [...txt].map((c, i) => (i < idade / v || c === ' ' ? c : SIMBOLOS[Math.floor(rnd(idade * 17 + i) * SIMBOLOS.length)])).join('');
export function carimbo(ctx, txt, x, y, cor, idade, px = 24, centro = false, tinta = '#000') {
  if (idade < 0 || !txt) return;
  const s = decifra(txt, idade);
  ctx.font = mono(px); ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  const w = ctx.measureText(s).width;
  if (centro) x -= w / 2;
  const dx = idade < 4 ? (rnd(idade * 5 + x) - 0.5) * 30 : 0, pad = px * 0.42;
  ctx.fillStyle = cor; ctx.fillRect(x - pad + dx, y - px * 0.3, w + pad * 2, px * 1.6);
  ctx.fillStyle = tinta; ctx.fillText(s, x + dx, y);
}

// ---------- transições ----------
const copia = (ctx, nome) => { const s = tela(nome, T.W, T.H); s._x.drawImage(ctx.canvas, 0, 0); return s; };
// pixels escorrendo: cada coluna estica uma linha da imagem para baixo
export function derrete(ctx, k, seed, y0 = 0, y1 = T.H, larg = T.v ? 12 : 8) {
  if (k <= 0) return;
  const s = copia(ctx, 'derr'), alt = y1 - y0;
  for (let x = 0, c = 0; x < T.W; x += larg, c++) {
    if (rnd(seed * 91 + c) > 0.25 + k * 0.75) continue;
    const y = Math.floor(y0 + rnd(seed * 37 + c * 3) * alt * 0.8), len = Math.floor((0.1 + rnd(seed * 53 + c * 7) * 0.9) * k * alt * 0.6);
    ctx.drawImage(s, x, y, larg, 2, x, y, larg, Math.min(len, y1 - y));
  }
}
export function fatias(ctx, k, seed) {
  if (k <= 0) return;
  const s = copia(ctx, 'fat'), n = Math.round(4 + k * 16);
  for (let i = 0; i < n; i++) {
    const a = seed * 101 + i * 7, y = Math.floor(rnd(a) * T.H), h = Math.floor(4 + rnd(a + 1) * 0.05 * T.H * k), dx = Math.round((rnd(a + 2) - 0.5) * 0.3 * T.W * k);
    ctx.drawImage(s, 0, y, T.W, h, dx, y, T.W, h);
  }
}
export function blocos(ctx, k, seed, cor = '#000') {
  if (k <= 0) return;
  const b = T.v ? 60 : 40;
  ctx.fillStyle = cor;
  for (let y = 0; y < T.H; y += b) for (let x = 0; x < T.W; x += b) if (rnd(seed * 7 + x * 13 + y * 29) < k) ctx.fillRect(x, y, b, b);
}
// separação de cor (só com glitch), grão e linhas
export function pos(ctx, frame, glitch) {
  const { W, H } = T;
  fatias(ctx, glitch, frame);
  const sep = Math.round(glitch * 16);
  if (sep > 0) {
    const im = ctx.getImageData(0, 0, W, H), d = im.data, o = new Uint8ClampedArray(d), p = sep * 4;
    for (let i = 0; i < d.length; i += 4) { d[i] = o[i + p] ?? 0; d[i + 2] = i >= p ? o[i - p + 2] : 0; }
    ctx.putImageData(im, 0, 0);
  }
  const gr = tela('grao', 320, 320), gd = gr._x.createImageData(320, 320);
  for (let i = 0; i < gd.data.length; i += 4) { const v = rnd(frame * 977 + i) * 255; gd.data[i] = gd.data[i + 1] = gd.data[i + 2] = v; gd.data[i + 3] = 255; }
  gr._x.putImageData(gd, 0, 0);
  ctx.save(); ctx.globalAlpha = 0.06; ctx.globalCompositeOperation = 'screen'; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(gr, 0, 0, W, H); ctx.restore();
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
}
