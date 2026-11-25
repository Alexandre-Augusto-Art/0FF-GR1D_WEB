// Monta cada quadro do vídeo do W4K3: um plano a cada ~1,5 s (P.planos, feitos no scripts/gerar.js), cena em tela
// cheia (base.js + cenas.js), faixa com o nome do acusado, legenda pequena e transições por destruição.
import { COR, T, rnd, clamp, tela, mono, grossa, bloco, carimbo, derrete, blocos, pos } from './base';
import { CENAS, ANTIGAS, SEM_LEGENDA, SEM_FAIXA, cenaFinal } from './cenas';

// uma cor de destaque por batida; o resto do quadro é preto e branco
const COR_DO_LADO = { chamado: COR.cyan, acusacao: COR.magenta, promessa: COR.cyan, prova: COR.lime, rosto: COR.magenta, faca: COR.magenta, escolha: COR.lime, assinatura: COR.lime };
const RODIZIO = [COR.magenta, COR.cyan, COR.lime];

function grupos(palavras, max) {
  const gs = [];
  for (const p of palavras) {
    const g = gs[gs.length - 1];
    if (!g || g.s !== p.s || g.ps.length >= max) gs.push({ s: p.s, ps: [p] }); else g.ps.push(p);
  }
  gs.forEach((g) => { g.ini = g.ps[0].ini; });
  gs.forEach((g, i) => { g.fim = gs[i + 1] && gs[i + 1].s === g.s ? gs[i + 1].ini : g.ps[g.ps.length - 1].fim + 0.3; });
  return gs;
}
function legenda(ctx, gs, t, cx, cy, px, larg, ac) {
  const g = gs.find((x) => t >= x.ini && t < x.fim);
  if (!g) return;
  ctx.save(); ctx.font = grossa(px); ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.lineJoin = 'round';
  const esp = ctx.measureText(' ').width, linhas = [[]];
  let l = 0;
  for (const p of g.ps) {
    const w = ctx.measureText(p.w).width;
    if (l + w > larg && linhas[linhas.length - 1].length) { linhas.push([]); l = 0; }
    linhas[linhas.length - 1].push({ p, w }); l += w + esp;
  }
  linhas.forEach((ln, li) => {
    const total = ln.reduce((a, b) => a + b.w + esp, -esp), y = cy - ((linhas.length - 1) / 2 - li) * px * 1.2;
    let x = cx - total / 2;
    for (const { p, w } of ln) {
      ctx.lineWidth = px * 0.24; ctx.strokeStyle = '#000'; ctx.strokeText(p.w, x, y);
      ctx.fillStyle = t >= p.ini && t < p.fim ? ac : COR.branco; ctx.fillText(p.w, x, y); x += w + esp;
    }
  });
  ctx.restore();
}
function faixa(ctx, P, ac, lf) {
  if (!P.alvo && !P.fonte) return;
  const v = T.v, px = v ? 50 : 30, x = v ? 64 : 40, y = v ? 232 : 34;
  ctx.font = mono(px); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const a = (P.alvo ? 'ALVO: ' + P.alvo : 'W4K3').toUpperCase(), w = ctx.measureText(a).width;
  ctx.fillStyle = ac; ctx.fillRect(x - 16, y - px * 0.7, w + 32, px * 1.4); ctx.fillStyle = '#000'; ctx.fillText(a, x, y + 2);
  if (P.fonte) { ctx.font = mono(px * 0.56); const f = 'FONTE: ' + P.fonte.toUpperCase(), wf = ctx.measureText(f).width; ctx.fillStyle = '#000'; ctx.fillRect(x - 16, y + px * 0.7, wf + 32, px * 0.96); ctx.fillStyle = COR.branco; ctx.fillText(f, x, y + px * 1.2); }
}

let _de = null, _gs = null, _planos = null;
export function desenhar(ctx, frame, P) {
  if (_de !== P.palavras) {
    _de = P.palavras; _gs = grupos(P.palavras, 4);
    P.segmentos.forEach((s, i) => { s.k = i; });
    _planos = P.planos && P.planos.length ? P.planos : P.segmentos.map((s, i) => ({ ini: s.ini, fim: s.fim, seg: i, cena: s.cena }));
  }
  T.W = ctx.canvas.width; T.H = ctx.canvas.height; T.v = T.H > T.W; T.cel = T.v ? 4 : 3;
  const { W, H, v } = T, t = frame / P.fps, vol = P.vol[frame] || 0;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = COR.preto; ctx.fillRect(0, 0, W, H);

  const base = { ctx, f: frame, vol, P, t, cx: W / 2, cy: v ? H * 0.43 : H * 0.44, s: v ? 1.32 : 0.72 };
  const ip = frame < P.final ? _planos.findLastIndex((x) => x.ini <= frame) : -1;
  if (ip >= 0) {
    const pl = _planos[ip], seg = P.segmentos[pl.seg], cena = ANTIGAS[pl.cena] || (CENAS[pl.cena] ? pl.cena : 'mascara');
    const ac = COR_DO_LADO[seg.lado] || RODIZIO[pl.seg % 3];
    const lf = frame - pl.ini, p = { ...base, lf, len: Math.max(1, pl.fim - pl.ini), bp: clamp((frame - seg.ini) / Math.max(1, seg.fim - seg.ini)), i: ip, ac, seg };
    CENAS[cena](p);

    // transição: o começo de cada plano ainda "chega quebrado"; o tipo varia de corte para corte
    const tipo = Math.floor(rnd(ip * 17 + 3) * 4), dentro = 1 - lf / 4, sai = 1 - (pl.fim - 1 - frame) / 3;
    if (ip > 0 && dentro > 0) { if (tipo === 0) derrete(ctx, dentro, ip); else if (tipo === 1) blocos(ctx, dentro * 0.6, ip * 31 + lf, rnd(ip) > 0.5 ? '#000' : '#f2f2f2'); }
    if (sai > 0 && tipo === 2) derrete(ctx, sai, ip + 50);

    if (!SEM_FAIXA.has(cena)) faixa(ctx, P, ac, lf);
    // soco da batida: só no primeiro plano dela em que a cena não mostra texto grande
    const primeiro = _planos.findIndex((x) => x.seg === pl.seg && !['cartela', 'marca', 'comercial', 'numero', 'janelas', 'abertura', 'assinatura', 'portas', 'lapide', 'manchete'].includes(x.cena)) === ip;
    if (primeiro && seg.legenda && !['assinatura', 'promessa', 'faca', 'escolha'].includes(seg.lado)) carimbo(ctx, seg.legenda.slice(0, 30), v ? W / 2 : W * 0.8, v ? 1300 : 60, ac, lf - 3, v ? 54 : 34, true);
    if (!SEM_LEGENDA.has(cena)) legenda(ctx, _gs, t, W / 2, v ? 1455 : H - 78, v ? 66 : 42, W * 0.84, ac);
  } else cenaFinal({ ...base, lf: frame - P.final, len: P.duracao - P.final, bp: 1, i: 0, ac: COR.lime, seg: {} });

  let glitch = 0;
  for (const x of _planos) glitch = Math.max(glitch, 0.5 * (1 - Math.abs(frame - x.ini) / 3));
  if (vol > 0.8 && rnd(frame * 3) < 0.2) glitch = Math.max(glitch, 0.25);
  if (rnd(frame * 7 + 1) < 0.03) glitch = Math.max(glitch, 0.12);
  pos(ctx, frame, glitch);
}
