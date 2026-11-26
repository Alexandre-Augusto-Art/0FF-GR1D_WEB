// A personagem do W4K3 (arte do autor: 03.11.26_2B, Asset-1 = neutra, Asset-2 = boca aberta).
// As formas são as do SVG original (viewBox 1163.755 de largura); a boca abre com o volume da voz,
// com o lábio de baixo do Asset-2 descendo a partir da borda do lábio de cima (os cantos ficam presos),
// e pisca com uma pálpebra que desce sobre a órbita inteira.
import { T, pb, clamp, rnd } from './base';

const VB_W = 1163.755, CX = 581.878, CY = 420;
const poli = (s) => 'M' + s.trim().split(/\s+/).join(' L') + ' Z';
const ROSTO = [
  // laterais com as órbitas vazadas
  'M121.843 234.254 L97.854 172.124 L203.693 215 L327.793 185.807 L492.172 350.186 L532.996 567.335 L165.125 638.963 L194.856 596.151 L0 262.915 Z M311.839 244.391 L165.125 281.234 L155.405 393.616 L232.707 567.335 L503.95 553.544 L454.584 360.948 Z',
  'M1041.912 234.254 L1065.901 172.124 L960.062 215 L835.962 185.807 L671.583 350.186 L630.759 567.335 L998.631 638.963 L968.899 596.151 L1163.755 262.915 Z M851.917 244.391 L998.631 281.234 L1008.35 393.616 L931.048 567.335 L659.805 553.544 L709.171 360.948 Z',
  // sobrancelhas
  poli('503.95,145.388 329.677,46.796 72.271,80.552 165.125,115.748 329.677,115.748 441.829,198.491'),
  poli('659.805,145.388 834.078,46.796 1091.485,80.552 998.631,115.748 834.078,115.748 721.927,198.491'),
  // boca (lábio de cima)
  poli('492.172,808.343 581.878,733.591 581.878,762.265 492.172,826.14 411.039,750.058'),
  poli('581.878,762.265 581.878,733.591 671.583,808.343 752.716,750.058 671.583,826.14'),
].map((d) => new Path2D(d));
const QUEIXO = [
  [[527.154, 942.118], [411.039, 750.058], [538.837, 917.598], [581.878, 917.598], [581.878, 942.118]],
  [[624.918, 917.598], [752.716, 750.058], [636.601, 942.118], [581.878, 942.118], [581.878, 917.598]],
];
// borda de baixo do lábio de cima: a boca fechada encosta nela
const BORDA = [[411.039, 750.058], [492.172, 826.14], [581.878, 762.265], [671.583, 826.14], [752.716, 750.058]];
function borda(xx) {
  for (let i = 1; i < BORDA.length; i++) {
    const [a, ya] = BORDA[i - 1], [b, yb] = BORDA[i];
    if (xx <= b) return ya + (yb - ya) * clamp((xx - a) / (b - a));
  }
  return BORDA[BORDA.length - 1][1];
}
// órbitas (os buracos das laterais), onde a pálpebra desce
const ORBITAS = new Path2D(poli('311.839,244.391 165.125,281.234 155.405,393.616 232.707,567.335 503.95,553.544 454.584,360.948') + ' ' +
  poli('851.917,244.391 998.631,281.234 1008.35,393.616 931.048,567.335 659.805,553.544 709.171,360.948'));
const ORB_TOPO = 244.391, ORB_BASE = 567.335;
const OLHOS = [
  poli('485.418,406.153 451.428,529.874 383.45,529.874 349.461,406.153 383.45,282.432 469.526,348.308'),
  poli('678.337,406.153 712.327,529.874 780.305,529.874 814.295,406.153 780.305,282.432 694.229,348.308'),
].map((d) => new Path2D(d));
const BRILHOS = [
  poli('210.817,135.328 232.215,156.726 210.817,178.124 189.419,156.726'),
  poli('155.405,0 176.803,21.398 155.405,42.796 134.007,21.398'),
].map((d) => new Path2D(d));

// 0 = boca fechada (Asset-1), 1 = aberta (Asset-2); segue a voz com um pouco de inércia
export function abertura(vol, f) {
  const v = Math.max(vol[f] || 0, (vol[f - 1] || 0) * 0.75, (vol[f - 2] || 0) * 0.45);
  return clamp((v - 0.1) / 0.5);
}

// lábio de baixo: cada ponto sai da borda do lábio de cima (fechada) e vai até a posição do Asset-2 (aberta)
function queixo(x, k) {
  for (const pts of QUEIXO) {
    x.beginPath();
    pts.forEach(([a, b], i) => { const f = borda(a), y = f + (b - f) * k; if (i) x.lineTo(a, y); else x.moveTo(a, y); });
    x.closePath(); x.fill();
  }
}
// 0 = olho aberto, 1 = fechado: fecha rápido, abre um pouco mais devagar, a cada ~3,7 s (às vezes duas vezes)
function piscada(t) {
  const c = (t + 0.7) % 3.7, dupla = Math.floor((t + 0.7) / 3.7) % 3 === 1;
  const um = (u) => (u < 0 ? 0 : u < 0.07 ? u / 0.07 : u < 0.2 ? 1 - (u - 0.07) / 0.13 : 0);
  return Math.max(um(c), dupla ? um(c - 0.28) : 0);
}

// (cx, cy) = centro do rosto na tela; larg = largura na tela
export function personagem(ctx, cx, cy, larg, { cor = '#e6e6e6', olhos = '#19e3f2', vol = 0, boca = 0, t = 0 } = {}) {
  const s = larg / VB_W;
  let ox = cx, oy = cy + Math.sin(t * 2.2) * larg * 0.006;
  if (vol > 0.55) ox += (rnd(Math.floor(t * 30) * 13) - 0.5) * vol * larg * 0.02;
  const giro = Math.sin(t * 1.3) * 0.018 + (boca - 0.4) * 0.012;
  const fecha = piscada(t);
  const posiciona = (x) => { x.translate(ox, oy); x.rotate(giro); x.scale(s, s); x.translate(-CX, -CY); };

  // rosto pontilhado na cor neon (luz vindo de cima, à esquerda)
  pb(ctx, (x) => {
    posiciona(x);
    const g = x.createLinearGradient(150, 0, 1000, 950);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#d0d0d0'); g.addColorStop(1, '#707070');
    x.fillStyle = g;
    if (boca > 0.02) queixo(x, boca);          // por baixo do lábio de cima
    ROSTO.forEach((p) => x.fill(p, 'evenodd'));
    if (fecha > 0) { x.save(); x.clip(ORBITAS); x.fillRect(0, ORB_TOPO - 10, VB_W, (ORB_BASE - ORB_TOPO + 20) * fecha); x.restore(); }
  }, { cor, escuro: '#000000' });

  // olhos e brilhos na cor da batida; a pupila some embaixo da pálpebra
  ctx.save(); posiciona(ctx);
  ctx.fillStyle = olhos; ctx.shadowColor = olhos; ctx.shadowBlur = larg * 0.035;
  ctx.globalAlpha = 0.6 + Math.min(1, vol) * 0.4;
  if (fecha < 0.97) {
    ctx.save(); ctx.beginPath(); ctx.rect(0, ORB_TOPO - 10 + (ORB_BASE - ORB_TOPO + 20) * fecha, VB_W, 1000); ctx.clip();
    OLHOS.forEach((p) => ctx.fill(p)); ctx.restore();
  }
  ctx.globalAlpha = 0.5 + 0.5 * rnd(Math.floor(t * 6));
  BRILHOS.forEach((p) => ctx.fill(p));
  ctx.restore();
}

export const PROPORCAO = 942.118 / VB_W;   // altura / largura com a boca aberta
