// Cenas do vídeo: cada uma é uma metáfora literal (vendido = leilão, controlado = fantoche...), quase tudo em
// preto e branco pontilhado e UMA cor de destaque por batida (p.ac). Servem para o vertical e o horizontal:
// tudo é posicionado a partir do centro (p.cx, p.cy) e da escala p.s.
// p = { ctx, f (quadro), lf (quadro no plano), len, bp (0..1 na batida), i (nº do plano), vol, ac, seg, P, t }
import { COR, T, rnd, clamp, suave, salto, tela, mono, grossa, fina, pb, ascii, bloco, cabe, quebra, carimbo, decifra, derrete, blocos } from './base';

const passo = (f, n = 3) => Math.floor(f / n);     // animação "a 10 quadros", como colagem
const cinza = (v) => `rgb(${v},${v},${v})`;
function rr(x, a, b, w, h, r) { x.beginPath(); x.roundRect(a, b, w, h, r); }
function cheio(p, cor) { p.ctx.fillStyle = cor; p.ctx.fillRect(0, 0, T.W, T.H); }
const grad = (x, x0, y0, x1, y1, ...cs) => { const g = x.createLinearGradient(x0, y0, x1, y1); cs.forEach((c, i) => g.addColorStop(i / (cs.length - 1), c)); return g; };

// ---------- peças ----------
function olho(x, cx, cy, r, px = 0, py = 0, aberto = 1) {
  x.save(); x.translate(cx, cy); x.scale(1, aberto);
  const g = x.createRadialGradient(-r * 0.2, -r * 0.2, r * 0.1, 0, 0, r * 1.25);
  g.addColorStop(0, '#fff'); g.addColorStop(0.6, '#d8d8d8'); g.addColorStop(1, '#4a4a4a');
  x.fillStyle = g; x.beginPath(); x.arc(0, 0, r, 0, 7); x.fill();
  x.fillStyle = '#4c4c4c'; x.beginPath(); x.arc(px * r * 0.4, py * r * 0.4, r * 0.48, 0, 7); x.fill();
  x.fillStyle = '#000'; x.beginPath(); x.arc(px * r * 0.45, py * r * 0.45, r * 0.26, 0, 7); x.fill();
  x.fillStyle = '#fff'; x.beginPath(); x.arc(px * r * 0.45 - r * 0.1, py * r * 0.45 - r * 0.12, r * 0.08, 0, 7); x.fill();
  x.restore();
}
function mao(x, cx, cy, s, rot = 0, fechada = 0) {
  x.save(); x.translate(cx, cy); x.rotate(rot); x.scale(s, s);
  x.fillStyle = grad(x, -60, 0, 60, 0, '#f4f4f4', '#9a9a9a', '#3a3a3a'); x.strokeStyle = '#000'; x.lineWidth = 5;
  rr(x, -38, 60, 76, 150, 14); x.fill(); x.stroke();              // punho
  rr(x, -62, -20, 124, 110, 34); x.fill(); x.stroke();            // palma
  for (let i = 0; i < 4; i++) { const h = [84, 104, 98, 72][i] * (1 - fechada * 0.65); rr(x, -62 + i * 31, -14 - h, 28, h + 24, 13); x.fill(); x.stroke(); }
  x.save(); x.translate(-58, 46); x.rotate(-0.85); rr(x, -15, -78, 30, 92, 14); x.fill(); x.stroke(); x.restore();
  x.restore();
}
// pessoa (busto); rosto: 0 vazio, 1 olhos assustados
function pessoa(x, cx, cy, s, rosto = 0, boca = 0) {
  x.save(); x.translate(cx, cy); x.scale(s, s); x.strokeStyle = '#000'; x.lineWidth = 5;
  x.fillStyle = grad(x, -120, 0, 130, 60, '#cfcfcf', '#777', '#222');
  x.beginPath(); x.moveTo(-130, 240); x.quadraticCurveTo(-130, 74, -36, 62); x.lineTo(36, 62); x.quadraticCurveTo(130, 74, 130, 240); x.closePath(); x.fill(); x.stroke();
  x.fillStyle = grad(x, -60, -80, 70, 60, '#ffffff', '#bdbdbd', '#4a4a4a');
  rr(x, -24, 34, 48, 44, 10); x.fill(); x.stroke();
  x.beginPath(); x.ellipse(0, -20, 62, 78, 0, 0, 7); x.fill(); x.stroke();
  x.fillStyle = '#222'; x.beginPath(); x.ellipse(0, -62, 66, 46, 0, Math.PI, 0); x.quadraticCurveTo(40, -52, 0, -58); x.quadraticCurveTo(-46, -50, -66, -62); x.fill();
  if (rosto) {
    for (const k of [-1, 1]) { x.fillStyle = '#fff'; x.beginPath(); x.arc(k * 24, -16, 15, 0, 7); x.fill(); x.stroke(); x.fillStyle = '#000'; x.beginPath(); x.arc(k * 24, -16, 5, 0, 7); x.fill(); }
    x.fillStyle = '#000'; x.beginPath(); x.ellipse(0, 30, 15, 6 + boca * 16, 0, 0, 7); x.fill();
  }
  x.restore();
}
function nota(x, cx, cy, w, v = 235) {
  const h = w * 0.44;
  x.fillStyle = cinza(v); x.strokeStyle = '#000'; x.lineWidth = w * 0.018;
  x.beginPath(); x.moveTo(cx - w * 0.5, cy + h * 0.1); x.lineTo(cx + w * 0.28, cy - h * 0.42); x.lineTo(cx + w * 0.5, cy - h * 0.05); x.lineTo(cx - w * 0.26, cy + h * 0.5); x.closePath(); x.fill(); x.stroke();
  x.save(); x.beginPath(); x.ellipse(cx + w * 0.01, cy + h * 0.03, w * 0.13, h * 0.2, -0.3, 0, 7); x.fillStyle = cinza(150); x.fill(); x.stroke();
  x.fillStyle = '#000'; x.font = `900 ${w * 0.15}px Arial`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('$', cx + w * 0.01, cy + h * 0.04); x.restore();
}
function maco(x, cx, cy, w, n) {
  for (let i = 0; i < n; i++) nota(x, cx + (rnd(i * 7) - 0.5) * w * 0.03, cy - i * w * 0.055, w, i === n - 1 ? 245 : 130 + (i % 2) * 60);
}
function celular(x, cx, cy, w, rot = 0) {
  const h = w * 1.95;
  x.save(); x.translate(cx, cy); x.rotate(rot);
  x.fillStyle = grad(x, -w / 2, 0, w / 2, 0, '#eee', '#8a8a8a', '#2b2b2b'); rr(x, -w / 2, -h / 2, w, h, w * 0.14); x.fill();
  x.fillStyle = '#000'; rr(x, -w * 0.44, -h * 0.46, w * 0.88, h * 0.92, w * 0.09); x.fill();
  x.restore();
  return h;
}
function cursor(ctx, x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.beginPath(); [[0, 0], [0, 34], [8, 27], [14, 40], [20, 37], [14, 25], [25, 25]].forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.closePath();
  ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
}

// ---------- fundos ----------
export function aneis(p, cor = '#6a6a6a', cx = p.cx, cy = p.cy, escuro = false) {
  const R = Math.hypot(T.W, T.H) / 2, larg = T.v ? 190 : 120, off = (p.f * 5) % (larg * 2);
  pb(p.ctx, (x) => {
    x.lineWidth = larg * 0.9;
    for (let r = off - larg; r < R + larg; r += larg * 2) { if (r <= 0) continue; const v = Math.max(20, 150 - (r / R) * 110); x.strokeStyle = cinza(v); x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke(); }
  }, { cor, cel: T.v ? 12 : 8, alfa: escuro ? 0.5 : 1 });
}
function binario(p, v = 60, cor = '#8a8a8a') {
  const ctx = p.ctx, px = T.v ? 30 : 20, cw = px * 1.3, ch = px * 1.5;
  ctx.font = mono(px); ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  for (let c = 0; c * cw < T.W; c++) {
    const rol = p.f * (1.2 + rnd(c * 7) * 3.2), base = Math.floor(rol / ch);
    for (let r = -1; r * ch < T.H; r++) {
      const l = r - base, s = rnd(c * 1000 + l * 7 + 3);
      if (s < 0.45) continue;
      ctx.fillStyle = rnd(c * 31 + l * 13) > 0.92 ? cor : cinza(v * 0.6);
      ctx.fillText(s > 0.72 ? '1' : '0', c * cw, r * ch + (rol % ch));
    }
  }
}
// papel de parede de um símbolo repetido, andando devagar
export function papel(p, tipo, v = 120, cor = COR.branco, alfa = 1) {
  const d = T.v ? 270 : 180, dx = (p.f * 1.3) % d, r = d * 0.27;
  pb(p.ctx, (x) => {
    for (let y = -1, id = 0; y * d < T.H + d; y++) for (let c = -1; c * d < T.W + d; c++, id++) {
      const cx = c * d + (y & 1 ? d / 2 : 0) + dx, cy = y * d + d / 2;
      if (tipo === 'olhos') olho(x, cx, cy, r, clamp((p.cx - cx) / 400, -1, 1), clamp((p.cy - cy) / 400, -1, 1), rnd(id * 31 + passo(p.f, 9)) < 0.08 ? 0.12 : 1);
      else if (tipo === 'maos') mao(x, cx, cy, r / 120, (id % 2 ? Math.PI : 0) + Math.sin(passo(p.f, 5) + id) * 0.12);
      else if (tipo === 'cameras') { x.save(); x.translate(cx, cy); x.rotate(Math.sin(passo(p.f, 4) * 0.4 + id) * 0.5); x.fillStyle = grad(x, 0, -r * 0.4, 0, r * 0.4, '#eee', '#555'); x.fillRect(-r * 0.8, -r * 0.38, r * 1.3, r * 0.76); x.fillStyle = '#ccc'; x.fillRect(r * 0.5, -r * 0.24, r * 0.35, r * 0.48); x.fillStyle = '#000'; x.beginPath(); x.arc(r * 0.68, 0, r * 0.16, 0, 7); x.fill(); x.restore(); }
      else if (tipo === 'cifrao') { x.fillStyle = cinza(v + 60); x.font = `900 ${r * 2}px Arial`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('$', cx, cy); }
      else { x.fillStyle = cinza(v); x.font = `900 ${r * 1.8}px Arial`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('×', cx, cy); }
    }
    x.globalCompositeOperation = 'source-atop'; x.fillStyle = `rgba(0,0,0,${1 - v / 255})`; x.fillRect(0, 0, T.W, T.H);
  }, { cor, alfa });
}
function cortina(p, cor) {
  pb(p.ctx, (x) => {
    const n = T.v ? 12 : 18, w = T.W / n;
    for (let i = 0; i < n; i++) { x.fillStyle = grad(x, i * w, 0, (i + 1) * w, 0, '#181818', '#8f8f8f', '#101010'); x.fillRect(i * w + Math.sin(passo(p.f, 5) * 0.4 + i) * 4, 0, w + 5, T.H); }
  }, { cor, escuro: '#0a0006' });
}

// ---------- a máscara do W4K3 (desenho próprio: placa branca com fendas e boca de equalizador) ----------
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
  const m = tela('fig_masc', w, h), y = m._x;
  g = y.createLinearGradient(w * 0.35, h * 0.22, w * 0.62, h * 0.62);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#bcbcbc'); g.addColorStop(1, '#575757');
  y.fillStyle = g; y.beginPath(); y.ellipse(w * 0.5, h * 0.43, w * 0.165, h * 0.205, 0, 0, 7); y.fill();
  y.globalCompositeOperation = 'destination-out';
  for (const [ex, r] of [[0.43, 0.22], [0.57, -0.22]]) { y.save(); y.translate(w * ex, h * 0.37); y.rotate(r); y.fillRect(-w * 0.055, -h * 0.017, w * 0.11, h * 0.034); y.restore(); }
  const n = 7, bw = w * 0.022, gap = w * 0.012, x0 = w * 0.5 - (n * bw + (n - 1) * gap) / 2;
  for (let i = 0; i < n; i++) {
    const k = Math.min(1, 0.15 + vol * (0.55 + 0.45 * rnd(i * 97 + Math.floor(t * 12))) * 1.5);
    const bh = h * 0.012 + h * 0.075 * k * (1 - Math.abs(i - 3) / 5);
    y.fillRect(x0 + i * (bw + gap), h * 0.53 - bh / 2, bw, bh);
  }
  y.globalCompositeOperation = 'source-over';
  return { corpo: c, mascara: m };
}
// (cx, cy) = centro da figura; alt = altura na tela
export function mascarado(p, cx, cy, alt, { cor = '#e6e6e6', olhos = p.ac } = {}) {
  const ctx = p.ctx, t = p.f / 30, h = Math.round(alt), w = Math.round(alt * 0.815);
  const { corpo, mascara } = figura(t, p.vol, w, h);
  let ox = cx - w / 2, oy = cy - h / 2 + Math.sin(t * 2.2) * 5;
  if (p.vol > 0.55) ox += (rnd(p.f * 13) - 0.5) * p.vol * 16;
  pb(ctx, (x) => x.drawImage(corpo, ox, oy), { cor, escuro: '#000000' });
  const cw = Math.max(6, Math.round(alt / 110)), ch = Math.round(cw * 1.33);
  ascii(mascara, ctx, ox, oy, cw, ch, '#f4f4f4');
  ctx.save(); ctx.fillStyle = olhos; ctx.shadowColor = olhos; ctx.shadowBlur = alt * 0.03; ctx.globalAlpha = 0.35 + p.vol * 0.65;
  for (const [ex, r] of [[0.43, 0.22], [0.57, -0.22]]) { ctx.save(); ctx.translate(ox + w * ex, oy + h * 0.37); ctx.rotate(r); ctx.fillRect(-w * 0.04, -h * 0.008, w * 0.08, h * 0.016); ctx.restore(); }
  ctx.restore();
}
const alvoDe = (P) => String(P.alvo || P.fonte || 'W4K3').toUpperCase();

// ---------- cenas ----------
function mascara(p) {
  const k = p.i % 5, base = T.H - (T.v ? 250 : 40);
  if (k === 0) papel(p, 'olhos', 120);
  else if (k === 1) { cheio(p, '#e9e9e9'); papel(p, 'x', 190, '#b9b9b9'); }
  else if (k === 2) aneis(p, '#777777');
  else if (k === 3) { binario(p); pb(p.ctx, (x) => { x.fillStyle = grad(x, 0, T.H * 0.3, 0, T.H, '#000', '#6a6a6a'); x.fillRect(0, T.H * 0.35, T.W, T.H); }, { cor: p.ac, cel: T.v ? 10 : 7 }); }
  else papel(p, 'maos', 130);
  const enq = [1.0, 1.25, 1.55][(p.i + (p.seg.k || 0)) % 3], zoom = 1 + p.lf * 0.0016;
  const alt = (T.v ? 1150 : 620) * enq * zoom;
  const dx = T.v ? 0 : [0, -170, 190][p.i % 3];
  mascarado(p, p.cx + dx, base - alt * 0.36 + (T.v ? 60 : 30), alt, { cor: k === 1 ? '#777777' : '#e6e6e6' });
}
// nome do acusado: começa limpo, como anúncio, e derrete
function marca(p) {
  const nome = alvoDe(p.P), k = clamp((p.bp - 0.35) / 0.55);
  if (k <= 0.02) {
    cheio(p, p.ac);
    bloco(p.ctx, nome, p.cx, p.cy, T.W * 0.86, T.H * 0.3, T.v ? 330 : 250, '#000');
    p.ctx.fillStyle = '#000'; const w = T.W * 0.3 * suave(p.lf / 10); p.ctx.fillRect(p.cx - w / 2, p.cy + (T.v ? 260 : 170), w, 10);
    return;
  }
  papel(p, 'maos', 80);
  bloco(p.ctx, nome, p.cx, p.cy, T.W * 0.86, T.H * 0.3, T.v ? 330 : 250, p.ac, { tremor: 8, seed: passo(p.f, 2) });
  derrete(p.ctx, 0.25 + k * 0.75, 5 + (p.seg.k || 0), p.cy - T.H * 0.17, T.H);
}
// propaganda bonita que apodrece: limpa no começo da batida, tomada por pixels pretos no fim
function comercial(p) {
  const ctx = p.ctx, podre = clamp((p.bp - 0.3) / 0.65);
  cheio(p, '#ffffff');
  ctx.fillStyle = p.ac; ctx.beginPath(); ctx.arc(p.cx, p.cy + 40 * p.s, 330 * p.s * (1 + 0.02 * Math.sin(p.f / 8)), 0, 7); ctx.fill();
  const bal = Math.sin(p.f / 12) * 0.05;
  ctx.save(); ctx.translate(p.cx, p.cy + 40 * p.s); ctx.rotate(bal);
  ctx.fillStyle = '#16181d'; rr(ctx, -140 * p.s, -275 * p.s, 280 * p.s, 550 * p.s, 40 * p.s); ctx.fill();
  ctx.fillStyle = '#ffffff'; rr(ctx, -122 * p.s, -252 * p.s, 244 * p.s, 504 * p.s, 26 * p.s); ctx.fill();
  if (podre < 0.45) { // carinha feliz
    ctx.fillStyle = p.ac; ctx.beginPath(); ctx.arc(0, 0, 88 * p.s, 0, 7); ctx.fill();
    ctx.fillStyle = '#16181d'; for (const k of [-1, 1]) { ctx.beginPath(); ctx.ellipse(k * 30 * p.s, -20 * p.s, 10 * p.s, 18 * p.s, 0, 0, 7); ctx.fill(); }
    ctx.strokeStyle = '#16181d'; ctx.lineWidth = 9 * p.s; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0, 8 * p.s, 44 * p.s, 0.3, Math.PI - 0.3); ctx.stroke(); ctx.lineCap = 'butt';
  }
  ctx.restore();
  ctx.fillStyle = '#9aa0a8'; ctx.font = fina(T.v ? 30 : 20); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('P U B L I C I D A D E', p.cx, p.cy - 420 * p.s); ctx.textAlign = 'left';
  bloco(ctx, String(p.seg.legenda || 'feito para você').toLowerCase(), p.cx, p.cy - 345 * p.s, T.W * 0.8, 110 * p.s, 78 * p.s, '#16181d', { fonte: fina });
  if (podre <= 0) return;
  const b = T.v ? 54 : 36; // pixels pretos comendo de fora para dentro
  for (let y = 0; y < T.H; y += b) for (let x = 0; x < T.W; x += b) {
    const d = Math.hypot(x - p.cx, y - p.cy) / Math.hypot(T.W, T.H) * 2;
    if (rnd(x * 13 + y * 29 + 5) * 0.55 + (1 - d) * 0.75 < podre * 1.35) {
      ctx.fillStyle = '#000'; ctx.fillRect(x, y, b + 1, b + 1);
      const s = rnd(x * 7 + y * 3 + passo(p.f, 5));
      if (s > 0.55) { ctx.fillStyle = s > 0.93 ? p.ac : '#5b5b5b'; ctx.font = mono(b * 0.6); ctx.textBaseline = 'top'; ctx.fillText(s > 0.77 ? '1' : '0', x + b * 0.3, y + b * 0.2); }
    }
  }
  if (podre > 0.4) pb(ctx, (x) => olho(x, p.cx, p.cy + 40 * p.s, 120 * p.s * salto((podre - 0.4) / 0.25), Math.sin(p.f / 7), Math.cos(p.f / 11) * 0.5, rnd(passo(p.f, 8)) < 0.1 ? 0.1 : 1), { escuro: '#000000', contorno: p.ac });
}
function olhocelular(p) {
  const ctx = p.ctx; binario(p);
  ctx.strokeStyle = p.ac; ctx.lineWidth = 6 * p.s;
  for (let k = 0; k < 4; k++) { const r = ((p.f * 6 + k * 150) % 600) * p.s; ctx.globalAlpha = 1 - r / (600 * p.s); ctx.beginPath(); ctx.arc(p.cx, p.cy, r, 0, 7); ctx.stroke(); }
  ctx.globalAlpha = 1;
  const rot = -0.14 + Math.sin(passo(p.f) * 0.4) * 0.03;
  pb(ctx, (x) => { celular(x, p.cx, p.cy, 330 * p.s * salto(p.lf / 8), rot); }, { escuro: '#101010', contorno: COR.branco });
  pb(ctx, (x) => olho(x, p.cx, p.cy, 130 * p.s, Math.sin(p.f / 9), Math.sin(p.f / 13) * 0.6, rnd(passo(p.f, 7)) < 0.1 ? 0.1 : suave((p.lf - 4) / 8)), { cor: p.ac, escuro: '#000000' });
}
function leilao(p) {
  const ctx = p.ctx; papel(p, 'cifrao', 90);
  pb(ctx, (x) => { x.fillStyle = grad(x, p.cx - 320 * p.s, 0, p.cx + 320 * p.s, 0, '#555', '#ddd', '#333'); x.fillRect(p.cx - 300 * p.s, p.cy + 190 * p.s, 600 * p.s, T.H); pessoa(x, p.cx, p.cy - 10 * p.s, 1.15 * p.s, 1, p.vol); }, { escuro: '#000000', contorno: COR.branco });
  // etiqueta pendurada
  const bal = Math.sin(p.f / 8) * 0.12;
  ctx.save(); ctx.translate(p.cx - 105 * p.s, p.cy + 95 * p.s); ctx.rotate(-0.06 + bal * 0.5);
  ctx.fillStyle = p.ac; rr(ctx, -10 * p.s, 0, 210 * p.s, 110 * p.s, 14 * p.s); ctx.fill(); ctx.fillStyle = '#000'; ctx.font = grossa(56 * p.s); ctx.textBaseline = 'middle'; ctx.fillText('À VENDA', 2 * p.s, 58 * p.s, 188 * p.s); ctx.restore();
  // placas de lance subindo
  for (let k = 0; k < 5; k++) {
    const e = salto((p.lf - k * 5) / 9), lado = k % 2 ? 1 : -1, x0 = p.cx + lado * (225 + (k >> 1) * 62) * p.s, y0 = T.H + 60 - e * (T.H - (p.cy + (150 - (k % 3) * 150) * p.s)) + Math.sin(p.f / 5 + k) * 8;
    pb(ctx, (x) => { x.fillStyle = '#b5b5b5'; x.fillRect(x0 - 9 * p.s, y0, 18 * p.s, 260 * p.s); x.fillStyle = '#eee'; x.beginPath(); x.arc(x0, y0, 74 * p.s, 0, 7); x.fill(); mao(x, x0, y0 + 300 * p.s, 0.7 * p.s, 0, 1); }, { escuro: '#000000', contorno: '#000000' });
    ctx.fillStyle = k === passo(p.lf, 5) % 5 ? p.ac : '#000'; ctx.font = `900 ${100 * p.s}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('$', x0, y0 + 5); ctx.textAlign = 'left';
  }
}
function dinheiro(p) {
  const ctx = p.ctx; binario(p, 50);
  const n = 3 + Math.floor(p.bp * 9 + p.lf / 6), w = 330 * p.s;
  const pilhas = [[-210, 40], [200, 60], [-10, -10], [-140, 190], [150, 210], [10, 330]];
  pilhas.forEach(([dx, dy], i) => {
    const m = clamp(n - i * 1, 0, 8);
    if (m < 1) return;
    const cai = (1 - salto((p.lf - i * 3) / 8)) * -T.H * 0.5;
    pb(ctx, (x) => maco(x, p.cx + dx * p.s, p.cy + (dy + 60) * p.s + cai, w, m), { cor: p.ac, escuro: '#0b1400', contorno: '#000000' });
  });
  for (let k = 0; k < 7; k++) { const y = ((p.f * 11 + k * 317) % (T.H + 300)) - 150, x0 = rnd(k * 9) * T.W; pb(ctx, (x) => { x.save(); x.translate(x0, y); x.rotate(p.f / 9 + k); nota(x, 0, 0, 150 * p.s); x.restore(); }, { cor: p.ac, escuro: '#0b1400' }); }
}
function fantoche(p) {
  const ctx = p.ctx; cortina(p, p.ac);
  const t = passo(p.f, 2) / 4, cx = p.cx, topo = p.cy - 420 * p.s, a = Math.sin(t) * 0.14;
  const M = [[-150, 40], [150, 40], [-40, -40], [40, -40]];
  const bracos = [Math.sin(t) * 60, -Math.sin(t) * 60];
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3 * p.s; ctx.beginPath();
  [[-190, -150 + bracos[0]], [190, -150 + bracos[1]], [0, -120]].forEach(([dx, dy], i) => { const ux = [-170, 170, 0][i]; ctx.moveTo(cx + ux * p.s * Math.cos(a), topo + ux * p.s * Math.sin(a)); ctx.lineTo(cx + dx * p.s, p.cy + (dy + 60) * p.s); }); ctx.stroke();
  pb(ctx, (x) => {
    x.strokeStyle = '#000'; x.lineWidth = 5 * p.s;
    for (const k of [-1, 1]) { x.save(); x.lineCap = 'round'; x.strokeStyle = '#9a9a9a'; x.lineWidth = 46 * p.s; x.beginPath(); x.moveTo(cx + k * 85 * p.s, p.cy + 150 * p.s); x.lineTo(cx + k * 190 * p.s, p.cy + (-80 + bracos[k < 0 ? 0 : 1]) * p.s); x.stroke(); x.restore(); }
    pessoa(x, cx + Math.sin(t) * 10 * p.s, p.cy + 40 * p.s, 1.2 * p.s, 1, Math.abs(Math.sin(p.f / 3)));
    x.save(); x.translate(cx, topo); x.rotate(a); x.fillStyle = grad(x, -200 * p.s, 0, 200 * p.s, 0, '#fff', '#777'); x.fillRect(-200 * p.s, -14 * p.s, 400 * p.s, 28 * p.s); x.fillRect(-16 * p.s, -70 * p.s, 32 * p.s, 140 * p.s); x.restore();
    mao(x, cx, topo - 90 * p.s, 1.25 * p.s, Math.PI + a, 0.5);
  }, { escuro: '#000000', contorno: COR.branco });
  ctx.save(); ctx.translate(cx, topo - 270 * p.s); bloco(ctx, alvoDe(p.P), 0, 0, 520 * p.s, 80 * p.s, 66 * p.s, '#fff', { sombra: '#000' }); ctx.restore();
}
function contrato(p) {
  const ctx = p.ctx; cheio(p, '#0a0a0a'); papel(p, 'x', 45);
  const w = 620 * p.s, x0 = p.cx - w / 2, rol = p.f * 9;
  ctx.save(); ctx.translate(p.cx, p.cy); ctx.rotate(-0.05); ctx.translate(-p.cx, -p.cy);
  ctx.fillStyle = '#ece9df'; ctx.fillRect(x0, -200, w, T.H + 400);
  ctx.fillStyle = '#8d8a80';
  for (let y = -40, i = 0; y < T.H + 60; y += 22 * p.s, i++) { const l = i + Math.floor(rol / (22 * p.s)); if (l % 9 === 0) continue; ctx.fillRect(x0 + 50 * p.s, y - (rol % (22 * p.s)), (w - 100 * p.s) * (0.6 + rnd(l * 3) * 0.4), 9 * p.s); }
  ctx.fillStyle = '#ece9df'; ctx.fillRect(x0, p.cy - 400 * p.s, w, 100 * p.s); ctx.fillStyle = '#111'; ctx.font = grossa(56 * p.s); ctx.textBaseline = 'top'; ctx.fillText('TERMOS DE USO', x0 + 50 * p.s, p.cy - 385 * p.s, w - 100 * p.s);
  if (p.bp > 0.25 || p.lf > 16) {
    const e = salto((p.lf - (p.bp > 0.25 ? 2 : 16)) / 7);
    ctx.save(); ctx.translate(p.cx, p.cy + 80 * p.s); ctx.rotate(-0.2); ctx.scale(2 - e, 2 - e);
    ctx.strokeStyle = p.ac; ctx.lineWidth = 16 * p.s; ctx.strokeRect(-240 * p.s, -80 * p.s, 480 * p.s, 160 * p.s);
    ctx.fillStyle = p.ac; ctx.font = grossa(110 * p.s); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('ACEITO', 0, 6 * p.s); ctx.textAlign = 'left'; ctx.restore();
  }
  ctx.restore();
  cursor(ctx, p.cx + 150 * p.s + Math.sin(p.f / 10) * 20, p.cy + 190 * p.s, 3.2 * p.s);
}
function multidao(p) {
  const ctx = p.ctx, cols = T.v ? 5 : 8, filas = T.v ? 6 : 4, dx = T.W / cols;
  const etiquetas = [];
  for (let fila = 0; fila < filas; fila++) {
    const y = p.cy - 330 * p.s + fila * (T.v ? 250 : 150), esc = (0.62 + fila * 0.09) * p.s;
    pb(ctx, (x) => {
      for (let i = -1; i <= cols; i++) {
        const id = fila * 40 + i, cx = i * dx + (fila & 1 ? dx : dx / 2) + (rnd(id * 3) - 0.5) * 30 + (rnd(passo(p.f) * 50 + id) - 0.5) * 5;
        pessoa(x, cx, y + (rnd(id * 5) - 0.5) * 30, esc, 0);
        if (rnd(id * 17) < 0.2 + p.bp * 0.9) etiquetas.push([cx, y - 12 * esc, esc, id]);
      }
    }, { escuro: '#000000', cor: cinza6(90 + fila * 28) });
  }
  etiquetas.forEach(([x, y, e, id]) => {
    const w = 150 * e, h = 78 * e; ctx.fillStyle = p.ac; ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.fillStyle = '#000'; ctx.font = mono(44 * e); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(id % 3 ? '$' : 'ID' + Math.floor(rnd(id * 13) * 255).toString(16).toUpperCase().padStart(2, '0'), x, y + 2); ctx.textAlign = 'left';
  });
}
const cinza6 = (v) => '#' + Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0').repeat(3);
function vigilancia(p) {
  const ctx = p.ctx; papel(p, 'cameras', 105);
  pb(ctx, (x) => pessoa(x, p.cx, p.cy + 60 * p.s, 1.75 * p.s, 1, p.vol * 0.6), { escuro: '#000000', contorno: COR.branco });
  const q = 250 * p.s * (1.25 - 0.25 * salto(p.lf / 8)), y = p.cy + 20 * p.s, e = 70 * p.s;
  ctx.strokeStyle = p.ac; ctx.lineWidth = 9 * p.s; ctx.beginPath();
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.moveTo(p.cx + a * q, y + b * q - b * e); ctx.lineTo(p.cx + a * q, y + b * q); ctx.lineTo(p.cx + a * q - a * e, y + b * q); }
  ctx.stroke();
  const ly = y - q + ((p.f * 14) % (q * 2)); ctx.globalAlpha = 0.7; ctx.fillStyle = p.ac; ctx.fillRect(p.cx - q, ly, q * 2, 6 * p.s); ctx.globalAlpha = 1;
  ['IDENTIFICADO', 'ARQUIVADO', 'CLASSIFICADO'].forEach((s, i) => carimbo(ctx, s, p.cx + q + (T.v ? -190 : 20) * 1, y - q + 30 + i * 74 * p.s, i ? COR.branco : p.ac, p.lf - 5 - i * 6, 36 * p.s));
}
function lapide(p) {
  const ctx = p.ctx; papel(p, 'olhos', 80);
  const sobe = salto(p.lf / 10), y = p.cy + (1 - sobe) * T.H * 0.5;
  pb(ctx, (x) => {
    x.fillStyle = grad(x, p.cx - 240 * p.s, 0, p.cx + 250 * p.s, 0, '#dcdcdc', '#8b8b8b', '#2e2e2e'); x.beginPath(); x.moveTo(p.cx - 240 * p.s, y + 360 * p.s); x.lineTo(p.cx - 240 * p.s, y - 120 * p.s); x.arc(p.cx, y - 120 * p.s, 240 * p.s, Math.PI, 0); x.lineTo(p.cx + 240 * p.s, y + 360 * p.s); x.fill();
    x.fillStyle = grad(x, 0, y + 280 * p.s, 0, y + 620 * p.s, '#777', '#111'); x.beginPath(); x.ellipse(p.cx, y + 430 * p.s, 560 * p.s, 150 * p.s, 0, 0, 7); x.fill();
  }, { escuro: '#000000', contorno: COR.branco });
  const v = Math.sin(passo(p.f) * 0.6) * 0.12;
  pb(ctx, (x) => { mao(x, p.cx - 330 * p.s, y + 290 * p.s, 1.3 * p.s, -0.25 + v, 0.1); mao(x, p.cx + 330 * p.s, y + 310 * p.s, 1.3 * p.s, 0.25 - v, 0.1); }, { cor: p.ac, escuro: '#000000', contorno: '#000000' });
  ctx.fillStyle = '#000'; ctx.font = grossa(44 * p.s); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillRect(p.cx - 130 * p.s, y - 195 * p.s, 260 * p.s, 64 * p.s); ctx.fillStyle = '#fff'; ctx.fillText('AQUI JAZ', p.cx, y - 162 * p.s); ctx.textAlign = 'left';
  ctx.fillStyle = '#000'; ctx.fillRect(p.cx - 210 * p.s, y - 100 * p.s, 420 * p.s, 250 * p.s);
  bloco(ctx, p.P.jaz || p.seg.legenda || 'SUA PAZ', p.cx, y + 25 * p.s, 390 * p.s, 220 * p.s, 110 * p.s, p.ac);
}
function janelas(p) {
  const ctx = p.ctx; papel(p, 'x', 40);
  const n = Math.min(26, 2 + Math.floor(p.lf / 1.8) + Math.floor(p.bp * 6)), w = 520 * p.s, h = 240 * p.s;
  for (let i = 0; i < n; i++) {
    const ult = i === n - 1, x = ult ? p.cx - w / 2 : (rnd(i * 7 + 1) * 1.15 - 0.15) * T.W - w * 0.1, y = ult ? p.cy - h / 2 : rnd(i * 11 + 2) * T.H * 0.82;
    const k = ult ? 1.25 : 0.8 + rnd(i) * 0.3;
    ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
    ctx.fillStyle = '#000'; ctx.fillRect(10, 10, w, h); ctx.fillStyle = i % 3 && !ult ? '#dedede' : p.ac; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, 46 * p.s); ctx.fillStyle = '#fff'; ctx.font = mono(26 * p.s); ctx.textBaseline = 'middle'; ctx.fillText('AVISO', 16 * p.s, 24 * p.s); ctx.fillText('×', w - 34 * p.s, 24 * p.s);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 4; ctx.strokeRect(0, 0, w, h);
    bloco(ctx, p.seg.legenda || 'VOCÊ ACEITOU', w / 2, 105 * p.s, w * 0.88, 90 * p.s, 50 * p.s, '#000', { fonte: mono });
    for (const [j, s] of ['OK', 'OK', 'OK'].entries()) { const bx = w * (0.17 + j * 0.25); ctx.strokeRect(bx, 176 * p.s, 90 * p.s, 44 * p.s); ctx.font = mono(26 * p.s); ctx.fillStyle = '#000'; ctx.fillText(s, bx + 28 * p.s, 199 * p.s); }
    ctx.restore();
  }
  cursor(ctx, p.cx + Math.sin(p.f / 6) * 120, p.cy + 110 * p.s + Math.cos(p.f / 7) * 30, 3 * p.s);
}
function manchete(p) {
  const ctx = p.ctx, P = p.P; papel(p, 'x', 45);
  const w = 800 * p.s * (T.v ? 0.82 : 1), h = 600 * p.s * (T.v ? 1.05 : 0.95), e = salto(p.lf / 9), zoom = 1 + p.lf * 0.003 + (p.i % 2) * 0.22;
  ctx.save(); ctx.translate(p.cx + (1 - e) * -T.W, p.cy); ctx.rotate(-0.05 + (p.i % 2) * 0.09); ctx.scale(zoom, zoom);
  ctx.fillStyle = '#000'; ctx.fillRect(-w / 2 + 16, -h / 2 + 16, w, h); ctx.fillStyle = '#eceadf'; ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.fillStyle = '#111'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.font = `bold ${44 * p.s}px Georgia, serif`; ctx.fillText(String(P.fonte || 'NOTÍCIA').toUpperCase(), 0, -h / 2 + 46 * p.s, w * 0.9); ctx.textAlign = 'left';
  ctx.fillRect(-w * 0.46, -h / 2 + 82 * p.s, w * 0.92, 4); ctx.fillRect(-w * 0.46, -h / 2 + 90 * p.s, w * 0.92, 2);
  const serif = (px) => `bold ${px}px Georgia, "Times New Roman", serif`;
  const { px, ls } = cabe(ctx, P.noticia || P.titulo, w * 0.9, h * 0.46, 68 * p.s, serif, 1.14);
  ctx.font = serif(px);
  ls.forEach((l, i) => {
    const y = -h / 2 + 140 * p.s + i * px * 1.14, lw = ctx.measureText(l).width, m = clamp((p.lf - 10 - i * 5) / 6);
    ctx.fillStyle = p.ac; ctx.globalAlpha = 0.75; ctx.fillRect(-w * 0.45 - 6, y - px * 0.5, (lw + 12) * m, px * 1.02); ctx.globalAlpha = 1;
    ctx.fillStyle = '#111'; ctx.fillText(l, -w * 0.45, y);
  });
  ctx.fillStyle = '#a5a296';
  for (let y = -h / 2 + 150 * p.s + ls.length * px * 1.14; y < h / 2 - 30 * p.s; y += 20 * p.s) for (const c of [0, 1]) ctx.fillRect(-w * 0.45 + c * w * 0.47, y, w * (0.36 + rnd(y + c * 99) * 0.07), 8 * p.s);
  ctx.restore();
}
// número da batida girando até travar
function numero(p) {
  const ctx = p.ctx;
  const m = [...String(p.seg.fala || '').matchAll(/(?:US\$|R\$|€)?\s?\d[\d.,]*\d?\s?(?:mil\b|milhão|milhões|bilhão|bilhões|trilhão|trilhões|%|dólares|reais|centavos|anos|horas|dias|pessoas)?/g)].map((x) => x[0].trim().replace(/[.,]$/, '')).filter((x) => !/^(19|20)\d\d$/.test(x));
  if (!m.length) return manchete(p);
  papel(p, 'cifrao', 80);
  const txt = m[Math.min(m.length - 1, Math.floor(p.bp * m.length))].toUpperCase(), trava = Math.floor((p.lf - 4) / 2);
  let k = 0; const s = [...txt].map((c) => (/\d/.test(c) ? (k++ < trava ? c : String(Math.floor(rnd(p.f * 7 + k) * 10))) : c)).join('');
  const fx = T.H * (T.v ? 0.2 : 0.4);
  ctx.fillStyle = '#000'; ctx.fillRect(0, p.cy - fx / 2, T.W, fx); ctx.fillStyle = p.ac; ctx.fillRect(0, p.cy - fx / 2 - 10, T.W, 10); ctx.fillRect(0, p.cy + fx / 2, T.W, 10);
  bloco(ctx, s, p.cx, p.cy, T.W * 0.92, fx * 0.92, T.v ? 260 : 210, p.ac, { tremor: trava < k ? 12 : 3, seed: passo(p.f, 2) });
}
// frase falada gigante, palavra por palavra
function cartela(p) {
  const ctx = p.ctx, inv = p.i % 2 === 1; cheio(p, inv ? p.ac : '#000'); if (!inv) papel(p, 'x', 30);
  const ws = p.P.palavras, at = ws.filter((w) => w.ini <= p.t).pop(), s = at ? at.s : -1;
  const txt = ws.filter((w) => w.s === s && w.ini <= p.t + 0.02).map((w) => w.w).join(' ') || p.seg.legenda || '';
  bloco(ctx, txt.toUpperCase(), p.cx, T.v ? T.H * 0.46 : p.cy, T.W * 0.88, T.H * (T.v ? 0.5 : 0.75), T.v ? 190 : 140, inv ? '#000' : '#fff', { tremor: 5, seed: passo(p.f, 2), sombra: inv ? null : p.ac });
}
function portas(p) {
  const ctx = p.ctx; aneis(p, '#4a4a4a');
  const v = T.v, w = (v ? 760 : 460) * 1, h = v ? 250 : 220, esq = p.bp < 0.5, pos = v ? [[p.cx, p.cy - 190], [p.cx, p.cy + 170]] : [[p.cx - 270, p.cy], [p.cx + 270, p.cy]];
  ['ACEITAR', 'RESISTIR'].forEach((s, i) => {
    const on = (i === 0) === esq, [x, y] = pos[i], k = on ? 1.06 + Math.sin(p.f / 4) * 0.015 : 0.94;
    ctx.save(); ctx.translate(x, y); ctx.scale(k, k); ctx.fillStyle = '#000'; ctx.fillRect(-w / 2 + 14, -h / 2 + 14, w, h);
    ctx.fillStyle = on ? (i ? p.ac : '#f2f2f2') : '#3a3a3a'; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.strokeStyle = '#000'; ctx.lineWidth = 8; ctx.strokeRect(-w / 2, -h / 2, w, h);
    bloco(ctx, s, 0, 4, w * 0.88, h * 0.8, v ? 130 : 90, on ? '#000' : '#8a8a8a'); ctx.restore();
  });
  const alvo = esq ? pos[0] : pos[1], de = esq ? [T.W * 0.9, T.H * 0.8] : pos[0], k = suave((esq ? p.bp / 0.3 : (p.bp - 0.5) / 0.16));
  cursor(ctx, de[0] + (alvo[0] - de[0]) * k + 120, de[1] + (alvo[1] - de[1]) * k + 40, v ? 4 : 3);
}
function padrao(p) { cheio(p, p.i % 2 ? '#000' : '#0a0a0a'); papel(p, p.i % 2 ? 'maos' : 'olhos', 215, p.ac); }

// logo do W4K3 em ASCII, sobre anéis
function logo(p, k = 1) {
  const ctx = p.ctx; aneis(p, '#555555');
  mascarado(p, p.cx, p.cy - (T.v ? 230 : 70), (T.v ? 900 : 470), { olhos: COR.lime });
  const txt = 'W4K3', px = T.v ? 330 : 170, c0 = tela('medlogo', 10, 10)._x; c0.font = grossa(px);
  const w = Math.ceil(c0.measureText(txt).width), c = tela('logoasc', w + 10, Math.ceil(px * 1.25)), x = c._x;
  x.fillStyle = '#fff'; x.font = grossa(px); x.textBaseline = 'top'; x.fillText(txt, 0, 0);
  const oy = p.cy + (T.v ? 100 : 60);
  pb(ctx, (y) => { y.fillStyle = '#000'; y.fillRect(p.cx - w / 2 - 30, oy + px * 0.1, w + 60, px * 1.1); }, { escuro: '#000000' });
  ascii(c, ctx, p.cx - w / 2, oy, T.v ? 9 : 7, T.v ? 12 : 9, COR.lime);
  carimbo(ctx, 'PR0T0C0L // 0FF-GR1D', p.cx, oy + px * 1.28, COR.branco, p.lf * 2, T.v ? 40 : 26, true);
  if (k < 1) derrete(ctx, 1 - k, 3);
}
function abertura(p) {
  if (p.i % 2 === 0 && p.lf < 22 && p.bp < 0.5) return logo(p, suave(p.lf / 7));
  const ctx = p.ctx, P = p.P; papel(p, 'olhos', 95);
  mascarado(p, T.v ? p.cx : T.W * 0.77, T.v ? T.H * 0.66 : p.cy + 120, T.v ? 1300 : 640);
  const px = T.v ? 96 : 62; ctx.font = grossa(px); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const larg = T.v ? T.W * 0.82 : T.W * 0.55, ls = quebra(ctx, P.titulo.toUpperCase(), larg), y0 = T.v ? 330 : 190;
  ls.forEach((l, i) => {
    const e = salto((p.lf - i * 3) / 7); if (p.lf < i * 3) return;
    const y = y0 + i * px * 1.3, w = ctx.measureText(l).width;
    ctx.save(); ctx.translate(T.W * 0.07 - (1 - e) * T.W, y); ctx.rotate((rnd(i * 13) - 0.5) * 0.045);
    ctx.fillStyle = i % 2 ? COR.branco : p.ac; ctx.fillRect(-18, -px * 0.62, w + 36, px * 1.2); ctx.fillStyle = '#000'; ctx.fillText(l, 0, 2); ctx.restore();
  });
}
function assinatura(p) {
  if (p.bp < 0.45) { aneis(p, '#5a5a5a'); mascarado(p, p.cx, p.cy + (T.v ? 260 : 130), (T.v ? 1500 : 800) * (1 + p.bp * 0.3), { olhos: COR.lime }); } else logo(p, suave(p.lf / 6));
}
export function cenaFinal(p) {
  logo(p);
  const ctx = p.ctx; ctx.font = mono(T.v ? 32 : 20); ctx.fillStyle = '#8a8a8a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (p.P.fonte) ctx.fillText('fonte: ' + p.P.fonte, p.cx, T.v ? T.H - 420 : T.H - 40); ctx.textAlign = 'left';
}

export const CENAS = { abertura, assinatura, mascara, marca, comercial, olhocelular, leilao, dinheiro, fantoche, contrato, multidao, vigilancia, lapide, janelas, manchete, numero, cartela, portas, padrao };
// cenas dos rascunhos antigos
export const ANTIGAS = { apresentador: 'mascara', cidade: 'padrao', obra: 'padrao', plataforma: 'olhocelular', marionete: 'fantoche', virada: 'cartela', pergunta: 'portas' };
// cenas que já têm o texto na tela: sem legenda por cima
export const SEM_LEGENDA = new Set(['cartela', 'abertura']);
// cenas em que a faixa com o nome do acusado atrapalha
export const SEM_FAIXA = new Set(['abertura', 'assinatura', 'marca', 'cartela', 'comercial']);
