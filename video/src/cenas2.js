// Mais cenas, no mesmo estilo das de cenas.js (preto e branco pontilhado + UMA cor neon por batida, p.ac):
// cenas por assunto (hospital, escola, fábrica...), versões das cenas fixas de cada batida (para os vídeos não
// saírem iguais) e a ilustração gerada no PC (scripts/imagens.py), que passa pelo mesmo pontilhado.
// O scripts/gerar.js escolhe quais entram em cada vídeo (fazerPlanos).
import { COR, T, rnd, clamp, suave, salto, mono, grossa, fina, pb, bloco, cabe, quebra, carimbo, IMAGENS } from './base';
import { passo, cinza, grad, rr, cheio, mao, pessoa, maco, nota, binario, papel, aneis, cursor, alvoDe, olho } from './cenas';

const S = (p, v) => v * p.s;
const branco = { escuro: '#000000', contorno: COR.branco };

// engrenagem centrada em (0,0)
function engrenagem(x, r, dentes, giro) {
  x.save(); x.rotate(giro); x.beginPath();
  for (let i = 0; i < dentes * 2; i++) { const a = (i / (dentes * 2)) * Math.PI * 2, rr2 = i % 2 ? r : r * 1.18; x.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2); }
  x.closePath(); x.fill(); x.fillStyle = '#000'; x.beginPath(); x.arc(0, 0, r * 0.35, 0, 7); x.fill(); x.restore();
}
function sirene(p, h = 60) {
  const ctx = p.ctx, on = passo(p.f, 6) % 2;
  for (let i = 0; i * h < T.W + h; i++) { ctx.fillStyle = (i + on) % 2 ? p.ac : '#000'; ctx.beginPath(); ctx.moveTo(i * h * 2 - h, 0); ctx.lineTo(i * h * 2, 0); ctx.lineTo(i * h * 2 - h * 2, h); ctx.lineTo(i * h * 2 - h * 3, h); ctx.fill(); }
}

// ---------- cenas por assunto ----------
function hospital(p) {
  const ctx = p.ctx; papel(p, 'x', 40);
  const y = p.cy + S(p, 120), e = salto(p.lf / 8);
  pb(ctx, (x) => {
    x.fillStyle = grad(x, p.cx - S(p, 360), 0, p.cx + S(p, 360), 0, '#eee', '#999', '#333');
    x.fillRect(p.cx - S(p, 340), y - S(p, 40), S(p, 680), S(p, 70));                     // colchão
    x.fillRect(p.cx - S(p, 340), y + S(p, 30), S(p, 20), S(p, 220)); x.fillRect(p.cx + S(p, 320), y + S(p, 30), S(p, 20), S(p, 220));
    x.fillRect(p.cx - S(p, 360), y - S(p, 160), S(p, 26), S(p, 200));                    // cabeceira
    x.fillStyle = '#ddd'; rr(x, p.cx - S(p, 330), y - S(p, 90), S(p, 160), S(p, 56), S(p, 22)); x.fill();   // travesseiro
    x.fillStyle = '#aaa'; x.fillRect(p.cx + S(p, 250), y - S(p, 560), S(p, 10), S(p, 560));                 // soro
    rr(x, p.cx + S(p, 205), y - S(p, 600), S(p, 100), S(p, 140), S(p, 20)); x.fill();
  }, branco);
  // monitor cardíaco: o traço vai apagando até ficar reto
  const mx = p.cx - S(p, 330), my = p.cy - S(p, T.v ? 420 : 330), mw = S(p, 660), mh = S(p, 300);
  ctx.fillStyle = '#000'; ctx.fillRect(mx, my, mw, mh); ctx.strokeStyle = COR.branco; ctx.lineWidth = S(p, 6); ctx.strokeRect(mx, my, mw, mh);
  ctx.strokeStyle = p.ac; ctx.lineWidth = S(p, 7); ctx.shadowColor = p.ac; ctx.shadowBlur = S(p, 18); ctx.beginPath();
  const fraco = clamp(1 - p.bp * 1.3), corre = (p.f * 9) % mw;
  for (let i = 0; i <= 120; i++) {
    const xx = (i / 120) * mw, fase = ((xx + corre) % (mw / 3)) / (mw / 3), pico = fase > 0.45 && fase < 0.55 ? Math.sin((fase - 0.45) / 0.1 * Math.PI * 2) : 0;
    const yy = my + mh / 2 - pico * mh * 0.38 * fraco * e;
    if (i) ctx.lineTo(mx + xx, yy); else ctx.moveTo(mx + xx, yy);
  }
  ctx.stroke(); ctx.shadowBlur = 0;
  ctx.fillStyle = p.ac; const c = S(p, 70), cx0 = mx + mw - S(p, 70), cy0 = my + S(p, 60);
  ctx.fillRect(cx0 - c / 2, cy0 - c / 6, c, c / 3); ctx.fillRect(cx0 - c / 6, cy0 - c / 2, c / 3, c);
}
function escola(p) {
  const ctx = p.ctx; papel(p, 'x', 35);
  const w = S(p, 760), h = S(p, 440), x0 = p.cx - w / 2, y0 = p.cy - S(p, 420);
  ctx.fillStyle = '#3b3b3b'; ctx.fillRect(x0 - S(p, 22), y0 - S(p, 22), w + S(p, 44), h + S(p, 44));
  ctx.fillStyle = '#0d0f0d'; ctx.fillRect(x0, y0, w, h);
  const txt = String(p.seg.legenda || alvoDe(p.P)).toUpperCase(), n = Math.floor(clamp((p.lf - 3) / 18) * txt.length);
  ctx.save(); ctx.translate(p.cx, y0 + h / 2); ctx.rotate(-0.02);
  bloco(ctx, txt.slice(0, Math.max(1, n)), 0, 0, w * 0.86, h * 0.75, S(p, 96), '#e8e8e8', { fonte: (px) => `bold ${px}px "Segoe Print", "Comic Sans MS", cursive`, tremor: 2, seed: 3 });
  ctx.restore();
  ctx.strokeStyle = p.ac; ctx.lineWidth = S(p, 8); ctx.beginPath(); ctx.moveTo(x0 + w * 0.1, y0 + h * 0.86); ctx.lineTo(x0 + w * 0.1 + w * 0.8 * clamp((p.lf - 10) / 14), y0 + h * 0.86); ctx.stroke();
  pb(ctx, (x) => {
    for (let fila = 0; fila < 2; fila++) for (let i = -1; i <= 1; i++) {
      const cx = p.cx + i * S(p, 260 + fila * 40), cy = p.cy + S(p, 210 + fila * 230), k = 0.8 + fila * 0.2;
      x.fillStyle = grad(x, cx - S(p, 100), 0, cx + S(p, 100), 0, '#ddd', '#777'); x.fillRect(cx - S(p, 110) * k, cy, S(p, 220) * k, S(p, 26) * k);
      x.fillRect(cx - S(p, 95) * k, cy, S(p, 14) * k, S(p, 120) * k); x.fillRect(cx + S(p, 81) * k, cy, S(p, 14) * k, S(p, 120) * k);
    }
  }, branco);
}
function fabrica(p) {
  const ctx = p.ctx; binario(p, 40);
  const y = p.cy + S(p, 160), anda = (p.f * S(p, 7)) % S(p, 260);
  pb(ctx, (x) => {
    x.fillStyle = '#888';
    for (const [dx, dy, r, d] of [[-300, -420, 120, 10], [-90, -330, 80, 8], [260, -440, 150, 12]]) { x.save(); x.translate(p.cx + S(p, dx), p.cy + S(p, dy)); x.fillStyle = grad(x, -S(p, r), 0, S(p, r), 0, '#eee', '#555'); engrenagem(x, S(p, r), d, (p.f / 30) * (d % 3 ? 1 : -1)); x.restore(); }
    x.fillStyle = grad(x, 0, y, 0, y + S(p, 70), '#bbb', '#333'); x.fillRect(0, y, T.W, S(p, 60));
    for (let i = -1; i * S(p, 260) < T.W + S(p, 260); i++) {
      const cx = i * S(p, 260) + anda, k = clamp((cx - p.cx * 0.6) / (T.W * 0.6));      // entra pessoa, sai caixa
      if (k < 0.5) pessoa(x, cx, y - S(p, 190), 0.75 * p.s, 0);
      else { x.fillStyle = grad(x, cx - S(p, 80), 0, cx + S(p, 80), 0, '#ddd', '#666'); x.fillRect(cx - S(p, 80), y - S(p, 150), S(p, 160), S(p, 150)); }
    }
  }, branco);
  ctx.fillStyle = p.ac;
  for (let i = -1; i * S(p, 260) < T.W + S(p, 260); i++) {
    const cx = i * S(p, 260) + anda;
    if (clamp((cx - p.cx * 0.6) / (T.W * 0.6)) >= 0.5) for (let b = 0; b < 9; b++) ctx.fillRect(cx - S(p, 60) + b * S(p, 14), y - S(p, 110), S(p, b % 3 ? 5 : 9), S(p, 70));
  }
  ctx.fillRect(0, y + S(p, 60), T.W, S(p, 8));
}
function servidor(p) {
  const ctx = p.ctx; binario(p, 45);
  const n = T.v ? 3 : 5, w = S(p, 220), gap = S(p, 40), h = S(p, 980), x0 = p.cx - (n * w + (n - 1) * gap) / 2, y0 = p.cy - h / 2;
  pb(ctx, (x) => {
    for (let i = 0; i < n; i++) {
      x.fillStyle = grad(x, x0 + i * (w + gap), 0, x0 + i * (w + gap) + w, 0, '#999', '#444', '#222'); x.fillRect(x0 + i * (w + gap), y0, w, h);
      x.fillStyle = '#111'; for (let k = 0; k < 14; k++) x.fillRect(x0 + i * (w + gap) + S(p, 14), y0 + S(p, 20) + k * h / 14, w - S(p, 28), h / 14 - S(p, 14));
    }
  }, branco);
  for (let i = 0; i < n; i++) for (let k = 0; k < 14; k++) for (let l = 0; l < 4; l++) {
    if (rnd(i * 97 + k * 13 + l * 5 + passo(p.f, 2) * 31) < 0.45) continue;
    ctx.fillStyle = rnd(i + k * 3 + l) > 0.8 ? COR.branco : p.ac;
    ctx.fillRect(x0 + i * (w + gap) + S(p, 30) + l * S(p, 26), y0 + S(p, 38) + k * h / 14, S(p, 12), S(p, 12));
  }
  // dados saindo pela lateral, em direção a quem paga
  ctx.font = mono(S(p, 30)); ctx.fillStyle = p.ac;
  for (let k = 0; k < 14; k++) { const yy = y0 + rnd(k * 7) * h, xx = (x0 + n * (w + gap) + ((p.f * 12 + k * 90) % (T.W))) % T.W; ctx.fillText(rnd(k + passo(p.f, 3)) > 0.5 ? '$' : '01', xx, yy); }
}
function algemas(p) {
  const ctx = p.ctx; papel(p, 'x', 40); sirene(p, T.v ? 70 : 45);
  const fecha = salto(p.lf / 9), y = p.cy + S(p, 40);
  pb(ctx, (x) => {
    mao(x, p.cx - S(p, 180), y + S(p, 220), 1.5 * p.s, 0.25, 1); mao(x, p.cx + S(p, 180), y + S(p, 220), 1.5 * p.s, -0.25, 1);
    x.lineWidth = S(p, 34); x.strokeStyle = grad(x, p.cx - S(p, 300), 0, p.cx + S(p, 300), 0, '#fff', '#888', '#333');
    for (const k of [-1, 1]) { x.beginPath(); x.arc(p.cx + k * S(p, 170), y + S(p, 170), S(p, 110), Math.PI * (k < 0 ? 0.1 : 0.9), Math.PI * (k < 0 ? 0.1 : 0.9) + Math.PI * 2 * (0.55 + 0.45 * fecha)); x.stroke(); }
    x.lineWidth = S(p, 16); x.beginPath(); for (let i = 0; i < 5; i++) { const xx = p.cx - S(p, 70) + i * S(p, 35); x.moveTo(xx, y + S(p, 60)); x.arc(xx, y + S(p, 60), S(p, 14), 0, 7); } x.stroke();
  }, branco);
  if (p.seg.legenda) carimbo(ctx, String(p.seg.legenda).toUpperCase().slice(0, 22), p.cx, p.cy - S(p, 380), p.ac, p.lf - 6, S(p, 54), true);
}
function balanca(p) {
  const ctx = p.ctx; aneis(p, '#3e3e3e');
  const a = -0.32 * salto((p.lf - 4) / 12) + Math.sin(p.f / 9) * 0.02, topo = p.cy - S(p, 300), L = S(p, 330);
  const ponta = (k) => [p.cx + Math.cos(a) * L * k, topo + Math.sin(a) * L * k];
  pb(ctx, (x) => {
    x.fillStyle = grad(x, p.cx - S(p, 30), 0, p.cx + S(p, 30), 0, '#eee', '#555'); x.fillRect(p.cx - S(p, 16), topo, S(p, 32), S(p, 720)); x.fillRect(p.cx - S(p, 160), topo + S(p, 700), S(p, 320), S(p, 40));
    x.save(); x.translate(p.cx, topo); x.rotate(a); x.fillRect(-L, -S(p, 12), L * 2, S(p, 24)); x.restore();
    for (const k of [-1, 1]) {
      const [px, py] = ponta(k); x.strokeStyle = '#aaa'; x.lineWidth = S(p, 4); x.beginPath(); x.moveTo(px, py); x.lineTo(px - S(p, 110), py + S(p, 240)); x.moveTo(px, py); x.lineTo(px + S(p, 110), py + S(p, 240)); x.stroke();
      x.fillStyle = grad(x, px - S(p, 130), 0, px + S(p, 130), 0, '#ddd', '#555'); x.beginPath(); x.ellipse(px, py + S(p, 245), S(p, 130), S(p, 30), 0, 0, 7); x.fill();
      if (k > 0) pessoa(x, px, py + S(p, 150), 0.45 * p.s, 1, 0);
    }
  }, branco);
  const [mx, my] = ponta(-1);
  pb(ctx, (x) => maco(x, mx, my + S(p, 215), S(p, 190), 6), { cor: p.ac, escuro: '#0b1400', contorno: '#000000' });
}
function predio(p) {
  const ctx = p.ctx; aneis(p, '#333333', p.cx, T.H);
  const w = S(p, 430), topo = p.cy - S(p, 560) + (1 - salto(p.lf / 10)) * T.H * 0.4, x0 = p.cx - w / 2;
  pb(ctx, (x) => {
    x.fillStyle = grad(x, x0, 0, x0 + w, 0, '#f0f0f0', '#8a8a8a', '#202020'); x.fillRect(x0, topo, w, T.H); x.fillRect(p.cx - S(p, 6), topo - S(p, 180), S(p, 12), S(p, 180));
    x.fillStyle = '#000'; for (let r = 0; topo + S(p, 140) + r * S(p, 70) < T.H; r++) for (let c = 0; c < 5; c++) x.fillRect(x0 + S(p, 30) + c * S(p, 80), topo + S(p, 140) + r * S(p, 70), S(p, 50), S(p, 40));
    for (let i = 0; i < 9; i++) pessoa(x, (i + 0.5) * T.W / 9, T.H - S(p, 60), 0.32 * p.s, 0);
  }, branco);
  ctx.fillStyle = p.ac;
  for (let r = 0; topo + S(p, 140) + r * S(p, 70) < T.H; r++) for (let c = 0; c < 5; c++) if (rnd(r * 9 + c + passo(p.f, 8) * 3) > 0.7) ctx.fillRect(x0 + S(p, 30) + c * S(p, 80), topo + S(p, 140) + r * S(p, 70), S(p, 50), S(p, 40));
  ctx.save(); ctx.shadowColor = p.ac; ctx.shadowBlur = S(p, 20);
  bloco(ctx, alvoDe(p.P), p.cx, topo + S(p, 60), w * 1.5, S(p, 100), S(p, 80), p.ac); ctx.restore();
}
function grafico(p) {
  const ctx = p.ctx; cheio(p, '#050505');
  const w = T.W * 0.84, h = S(p, 700), x0 = (T.W - w) / 2, y0 = p.cy - h / 2;
  ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 2;
  for (let i = 0; i <= 8; i++) { ctx.beginPath(); ctx.moveTo(x0, y0 + (h * i) / 8); ctx.lineTo(x0 + w, y0 + (h * i) / 8); ctx.moveTo(x0 + (w * i) / 8, y0); ctx.lineTo(x0 + (w * i) / 8, y0 + h); ctx.stroke(); }
  const k = clamp((p.lf - 3) / 22), n = 24;
  const linha = (sobe, cor, larg, rot) => {
    ctx.strokeStyle = cor; ctx.lineWidth = larg; ctx.beginPath(); let fim = null;
    for (let i = 0; i <= n * k; i++) {
      const t = i / n, v = sobe ? 0.15 + t * 0.7 + (rnd(i * 3) - 0.5) * 0.12 : 0.85 - t * 0.6 + (rnd(i * 5 + 9) - 0.5) * 0.12;
      fim = [x0 + t * w, y0 + h - v * h]; if (i) ctx.lineTo(...fim); else ctx.moveTo(...fim);
    }
    ctx.stroke(); if (fim) { ctx.fillStyle = cor; ctx.font = grossa(S(p, 54)); ctx.textBaseline = 'middle'; ctx.textAlign = 'right'; ctx.fillText(rot, fim[0] - S(p, 12), fim[1] + (sobe ? -S(p, 50) : S(p, 50))); ctx.textAlign = 'left'; }
  };
  ctx.save(); ctx.shadowColor = p.ac; ctx.shadowBlur = S(p, 16); linha(true, p.ac, S(p, 12), 'ELES'); ctx.restore();
  linha(false, COR.branco, S(p, 8), 'VOCÊ');
}
function radar(p) {
  const ctx = p.ctx; cheio(p, '#020402');
  const R = Math.min(T.W, T.H) * 0.44, a = (p.f / 30) * 2.4;
  ctx.strokeStyle = '#1f2a1f'; ctx.lineWidth = 3;
  for (let i = 1; i <= 4; i++) { ctx.beginPath(); ctx.arc(p.cx, p.cy, (R * i) / 4, 0, 7); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(p.cx - R, p.cy); ctx.lineTo(p.cx + R, p.cy); ctx.moveTo(p.cx, p.cy - R); ctx.lineTo(p.cx, p.cy + R); ctx.stroke();
  const g = ctx.createConicGradient ? ctx.createConicGradient(a - 0.9, p.cx, p.cy) : null;
  if (g) { g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.14, p.ac); g.addColorStop(0.1401, 'rgba(0,0,0,0)'); ctx.globalAlpha = 0.45; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.cx, p.cy, R, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
  for (let i = 0; i < 26; i++) {
    const ang = rnd(i * 7) * Math.PI * 2, r = (0.15 + rnd(i * 11) * 0.82) * R, d = ((a - ang) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const x = p.cx + Math.cos(ang) * r, y = p.cy + Math.sin(ang) * r, luz = clamp(1 - d / 2.5);
    ctx.fillStyle = luz > 0.05 ? p.ac : '#2c2c2c'; ctx.globalAlpha = 0.3 + luz * 0.7; ctx.beginPath(); ctx.arc(x, y, S(p, 9) + luz * S(p, 9), 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  carimbo(ctx, 'VOCÊ FOI LOCALIZADO', p.cx, p.cy + R + S(p, 40), p.ac, p.lf - 8, S(p, 44), true);
}
function terminal(p) {
  const ctx = p.ctx; cheio(p, '#020202');
  const px = T.v ? 46 : 30, lh = px * 1.45, x0 = T.W * 0.07;
  const linhas = ['> conectando...', '> acesso: ' + alvoDe(p.P).toLowerCase(), '> coletando: nome, rosto, local, contatos', '> enviando para: anunciantes', '> ' + String(p.seg.fala || '').toLowerCase()];
  ctx.font = mono(px); ctx.textBaseline = 'top';
  let resto = Math.floor(p.lf * 2.2), y = p.cy - lh * 6;
  for (const l of linhas) {
    const ls = quebra(ctx, l, T.W * 0.86);
    for (const s of ls) { if (resto <= 0) break; const parte = s.slice(0, resto); resto -= s.length; ctx.fillStyle = l === linhas[linhas.length - 1] ? p.ac : '#9a9a9a'; ctx.fillText(parte, x0, y); y += lh; }
  }
  if (passo(p.f, 8) % 2) { ctx.fillStyle = p.ac; ctx.fillRect(x0, y, px * 0.6, px); }
}
function casa(p) {
  const ctx = p.ctx; papel(p, 'cifrao', 70);
  const y = p.cy + S(p, 60), sobe = salto(p.lf / 10);
  pb(ctx, (x) => {
    x.fillStyle = grad(x, p.cx - S(p, 300), 0, p.cx + S(p, 300), 0, '#f2f2f2', '#999', '#333');
    x.fillRect(p.cx - S(p, 260), y - S(p, 120), S(p, 520), S(p, 420));
    x.beginPath(); x.moveTo(p.cx - S(p, 320), y - S(p, 110)); x.lineTo(p.cx, y - S(p, 380)); x.lineTo(p.cx + S(p, 320), y - S(p, 110)); x.fill();
    x.fillStyle = '#000'; x.fillRect(p.cx - S(p, 60), y + S(p, 110), S(p, 120), S(p, 190)); x.fillRect(p.cx - S(p, 210), y - S(p, 40), S(p, 100), S(p, 90)); x.fillRect(p.cx + S(p, 110), y - S(p, 40), S(p, 100), S(p, 90));
  }, branco);
  // etiqueta de preço subindo
  const ty = y - S(p, 480) - sobe * S(p, 120) + Math.sin(p.f / 8) * 6;
  ctx.save(); ctx.translate(p.cx + S(p, 190), ty); ctx.rotate(0.12);
  ctx.fillStyle = p.ac; rr(ctx, -S(p, 40), -S(p, 70), S(p, 330), S(p, 140), S(p, 18)); ctx.fill();
  ctx.fillStyle = '#000'; ctx.font = grossa(S(p, 78)); ctx.textBaseline = 'middle'; ctx.fillText('$$$ ↑', 0, S(p, 4)); ctx.restore();
  carimbo(ctx, 'DESPEJADO', p.cx, y + S(p, 330), COR.branco, p.lf - 14, S(p, 48), true);
}
function planeta(p) {
  const ctx = p.ctx; binario(p, 35);
  const R = S(p, 330), cx = p.cx - (T.v ? 0 : S(p, 120)), cy = p.cy + S(p, 80);
  pb(ctx, (x) => {
    for (let i = 0; i < 9; i++) { const k = (p.f * 2 + i * 40) % 360, r = S(p, 50 + k * 0.5); x.fillStyle = cinza(170 - k * 0.4); x.beginPath(); x.arc(cx + Math.sin(i * 2 + k / 60) * S(p, 90) + (i - 4) * S(p, 40), cy - R - S(p, k * 1.6), r, 0, 7); x.fill(); }
    const g = x.createRadialGradient(cx - R * 0.4, cy - R * 0.4, R * 0.1, cx, cy, R); g.addColorStop(0, '#fff'); g.addColorStop(0.6, '#888'); g.addColorStop(1, '#222');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, R, 0, 7); x.fill();
    x.strokeStyle = '#000'; x.lineWidth = S(p, 5);
    for (let i = -2; i <= 2; i++) { x.beginPath(); x.ellipse(cx, cy, R * Math.abs(Math.cos((p.f / 40) + i * 0.6)), R, 0, 0, 7); x.stroke(); x.beginPath(); x.ellipse(cx, cy + (i * R) / 3, R * Math.sqrt(1 - (i / 3) ** 2), R * 0.12, 0, 0, 7); x.stroke(); }
  }, branco);
  // termômetro enchendo
  const tx = T.v ? p.cx + S(p, 380) : p.cx + S(p, 420), th = S(p, 640), ty = cy - th / 2, cheioT = 0.35 + 0.65 * clamp(p.lf / 30);
  ctx.fillStyle = '#fff'; rr(ctx, tx - S(p, 34), ty, S(p, 68), th, S(p, 34)); ctx.fill(); ctx.beginPath(); ctx.arc(tx, ty + th, S(p, 62), 0, 7); ctx.fill();
  ctx.fillStyle = p.ac; ctx.fillRect(tx - S(p, 18), ty + th * (1 - cheioT), S(p, 36), th * cheioT); ctx.beginPath(); ctx.arc(tx, ty + th, S(p, 46), 0, 7); ctx.fill();
}
function robo(p) {
  const ctx = p.ctx; binario(p, 55);
  const y = p.cy - S(p, 40), olhar = Math.sin(p.f / 14);
  pb(ctx, (x) => {
    x.fillStyle = grad(x, p.cx - S(p, 300), y - S(p, 300), p.cx + S(p, 300), y + S(p, 300), '#fafafa', '#9a9a9a', '#2a2a2a');
    rr(x, p.cx - S(p, 280), y - S(p, 250), S(p, 560), S(p, 480), S(p, 70)); x.fill();
    x.fillRect(p.cx - S(p, 8), y - S(p, 380), S(p, 16), S(p, 140)); x.beginPath(); x.arc(p.cx, y - S(p, 390), S(p, 30), 0, 7); x.fill();
    x.fillRect(p.cx - S(p, 330), y - S(p, 80), S(p, 50), S(p, 150)); x.fillRect(p.cx + S(p, 280), y - S(p, 80), S(p, 50), S(p, 150));
    x.fillStyle = '#000'; rr(x, p.cx - S(p, 220), y - S(p, 160), S(p, 440), S(p, 160), S(p, 40)); x.fill();
    for (let i = 0; i < 7; i++) x.fillRect(p.cx - S(p, 150) + i * S(p, 46), y + S(p, 80), S(p, 26), S(p, 80));
    x.fillStyle = grad(x, 0, y + S(p, 240), 0, y + S(p, 600), '#888', '#111'); x.fillRect(p.cx - S(p, 340), y + S(p, 260), S(p, 680), S(p, 400));
  }, branco);
  ctx.save(); ctx.shadowColor = p.ac; ctx.shadowBlur = S(p, 30); ctx.fillStyle = p.ac;
  ctx.fillRect(p.cx - S(p, 200) + (olhar + 1) * S(p, 140), y - S(p, 120), S(p, 120), S(p, 80)); ctx.restore();
  ctx.fillStyle = p.ac; ctx.globalAlpha = 0.25; ctx.beginPath(); const ox = p.cx - S(p, 140) + (olhar + 1) * S(p, 140); ctx.moveTo(ox, y - S(p, 80)); ctx.lineTo(ox - S(p, 420), T.H); ctx.lineTo(ox + S(p, 420), T.H); ctx.fill(); ctx.globalAlpha = 1;
}
function cadeado(p) {
  const ctx = p.ctx; papel(p, 'x', 40);
  const abre = salto((p.lf - 6) / 8), y = p.cy + S(p, 60);
  if (abre > 0.3) { ctx.font = mono(S(p, 34)); for (let k = 0; k < 40; k++) { const t = ((p.f * 0.03 + rnd(k)) % 1), xx = p.cx + (rnd(k * 3) - 0.5) * S(p, 900) * t, yy = y - S(p, 100) + t * T.H * 0.6; ctx.fillStyle = k % 5 ? p.ac : COR.branco; ctx.fillText(['CPF', 'SENHA', '01', '@', 'LOCAL', 'FOTO'][k % 6], xx, yy); } }
  pb(ctx, (x) => {
    x.lineWidth = S(p, 54); x.strokeStyle = grad(x, p.cx - S(p, 200), 0, p.cx + S(p, 200), 0, '#fff', '#777', '#333');
    x.save(); x.translate(p.cx + S(p, 150), y - S(p, 170)); x.rotate(-abre * 0.7); x.translate(-S(p, 150), -abre * S(p, 60));
    x.beginPath(); x.arc(0, 0, S(p, 150), Math.PI, 0); x.lineTo(S(p, 150), S(p, 60)); x.moveTo(-S(p, 150), 0); x.lineTo(-S(p, 150), S(p, 60)); x.stroke(); x.restore();
    x.fillStyle = grad(x, p.cx - S(p, 260), y - S(p, 200), p.cx + S(p, 260), y + S(p, 300), '#fafafa', '#999', '#262626');
    rr(x, p.cx - S(p, 250), y - S(p, 150), S(p, 500), S(p, 420), S(p, 40)); x.fill();
    x.fillStyle = '#000'; x.beginPath(); x.arc(p.cx, y + S(p, 30), S(p, 50), 0, 7); x.fill(); x.fillRect(p.cx - S(p, 20), y + S(p, 40), S(p, 40), S(p, 120));
  }, branco);
}
function carteira(p) {
  const ctx = p.ctx; aneis(p, '#3a3a3a');
  const y = p.cy + S(p, 40), vira = salto(p.lf / 8);
  pb(ctx, (x) => {
    x.save(); x.translate(p.cx, y); x.rotate(-0.25 * vira);
    x.fillStyle = grad(x, -S(p, 330), 0, S(p, 330), 0, '#e8e8e8', '#7a7a7a', '#222'); rr(x, -S(p, 330), -S(p, 200), S(p, 660), S(p, 400), S(p, 40)); x.fill();
    x.fillStyle = '#000'; rr(x, -S(p, 300), -S(p, 170), S(p, 600), S(p, 200), S(p, 24)); x.fill();
    x.fillStyle = '#bbb'; rr(x, S(p, 140), -S(p, 20), S(p, 190), S(p, 110), S(p, 30)); x.fill(); x.restore();
  }, branco);
  // moedas caindo e a última nota voando embora
  for (let k = 0; k < 6; k++) { const t = clamp((p.lf - 6 - k * 3) / 14), yy = y + S(p, 60) + t * T.H * 0.5; if (t <= 0 || t >= 1) continue; ctx.fillStyle = p.ac; ctx.beginPath(); ctx.ellipse(p.cx - S(p, 200) + k * S(p, 70), yy, S(p, 38), S(p, 38) * Math.abs(Math.cos(p.f / 4 + k)), 0, 0, 7); ctx.fill(); }
  const t = clamp((p.lf - 4) / 24);
  pb(ctx, (x) => { x.save(); x.translate(p.cx + t * T.W * 0.6, y - S(p, 120) - t * T.H * 0.35); x.rotate(t * 5); nota(x, 0, 0, S(p, 300)); x.restore(); }, { cor: p.ac, escuro: '#0b1400' });
  carimbo(ctx, 'SALDO: R$ 0,00', p.cx, y + S(p, 300), COR.branco, p.lf - 10, S(p, 46), true);
}
function familia(p) {
  const ctx = p.ctx; papel(p, 'olhos', 70);
  const y = p.cy + S(p, 80), some = clamp((p.bp - 0.2) / 0.7);
  const gente = [[-270, 0, 1.15], [-40, 30, 1.05], [170, 170, 0.7], [330, 190, 0.62]];
  pb(ctx, (x) => gente.forEach(([dx, dy, k], i) => { if (i !== 2 || some < 0.98) pessoa(x, p.cx + S(p, dx), y + S(p, dy), k * p.s, 1, 0); }), branco);
  // uma das crianças vira pixels
  const [dx, dy, k] = gente[2], b = S(p, 22);
  for (let yy = -S(p, 160) * k; yy < S(p, 240) * k; yy += b) for (let xx = -S(p, 130) * k; xx < S(p, 130) * k; xx += b) {
    if (rnd(xx * 7 + yy * 13) > some) continue;
    const voa = some * S(p, 260) * rnd(xx + yy * 3);
    ctx.fillStyle = rnd(xx * 3 + yy) > 0.5 ? p.ac : '#000'; ctx.fillRect(p.cx + S(p, dx) + xx + voa, y + S(p, dy) + yy - voa * 0.6, b, b);
  }
}

// ---------- versões das cenas fixas ----------
// acusação: letreiro de neon com o nome, piscando e quebrando
function letreiro(p) {
  const ctx = p.ctx; cheio(p, '#060606'); papel(p, 'x', 30);
  const nome = alvoDe(p.P), pisca = rnd(passo(p.f, 2) * 7) < 0.12 + p.bp * 0.35;
  ctx.save(); ctx.lineJoin = 'round';
  const { px, ls } = cabe(ctx, nome, T.W * 0.84, T.H * 0.34, T.v ? 260 : 200);
  ctx.font = grossa(px); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ls.forEach((l, i) => {
    const y = p.cy + (i - (ls.length - 1) / 2) * px * 1.08;
    ctx.lineWidth = px * 0.06; ctx.strokeStyle = pisca ? '#222' : p.ac; ctx.shadowColor = p.ac; ctx.shadowBlur = pisca ? 0 : px * 0.3; ctx.strokeText(l, p.cx, y);
    if (!pisca) { ctx.shadowBlur = 0; ctx.strokeStyle = '#fff'; ctx.lineWidth = px * 0.015; ctx.strokeText(l, p.cx, y); }
  });
  ctx.restore();
  // rachaduras
  ctx.strokeStyle = '#000'; ctx.lineWidth = S(p, 6);
  for (let k = 0; k < Math.floor(p.bp * 8); k++) { let x = rnd(k * 3) * T.W, y = p.cy - S(p, 200) + rnd(k * 5) * S(p, 400); ctx.beginPath(); ctx.moveTo(x, y); for (let s = 0; s < 6; s++) { x += (rnd(k * 9 + s) - 0.5) * S(p, 120); y += S(p, 40); ctx.lineTo(x, y); } ctx.stroke(); }
  carimbo(ctx, 'EXPOSTO', p.cx, p.cy + S(p, 330), COR.branco, p.lf - 8, S(p, 56), true);
}
// acusação: cartaz de "procurado"
function procurado(p) {
  const ctx = p.ctx; papel(p, 'maos', 60);
  const w = S(p, 620), h = S(p, 860), e = salto(p.lf / 8);
  ctx.save(); ctx.translate(p.cx, p.cy + (1 - e) * T.H * 0.5); ctx.rotate(0.03 - (p.i % 2) * 0.05);
  ctx.fillStyle = '#000'; ctx.fillRect(-w / 2 + 16, -h / 2 + 16, w, h); ctx.fillStyle = '#e9e4d4'; ctx.fillRect(-w / 2, -h / 2, w, h);
  bloco(ctx, 'EXPOSTO', 0, -h / 2 + S(p, 80), w * 0.9, S(p, 110), S(p, 96), '#111');
  ctx.fillStyle = '#111'; ctx.fillRect(-w * 0.36, -h / 2 + S(p, 160), w * 0.72, S(p, 360));
  ctx.restore();
  pb(ctx, (x) => { x.save(); x.translate(p.cx, p.cy + (1 - e) * T.H * 0.5); x.rotate(0.03 - (p.i % 2) * 0.05); pessoa(x, 0, -h / 2 + S(p, 330), 1.05 * p.s, 0); x.restore(); }, { escuro: '#111111', cor: '#bdb8a8' });
  ctx.save(); ctx.translate(p.cx, p.cy + (1 - e) * T.H * 0.5); ctx.rotate(0.03 - (p.i % 2) * 0.05);
  bloco(ctx, alvoDe(p.P), 0, h / 2 - S(p, 210), w * 0.9, S(p, 200), S(p, 90), '#111');
  ctx.fillStyle = p.ac; ctx.fillRect(-w * 0.42, h / 2 - S(p, 90), w * 0.84 * clamp((p.lf - 8) / 10), S(p, 18));
  ctx.restore();
}
// promessa: outdoor que descasca e mostra o que tem por trás
function outdoor(p) {
  const ctx = p.ctx; binario(p, 60);
  const w = T.W * 0.9, h = S(p, 560), x0 = p.cx - w / 2, y0 = p.cy - h / 2 - S(p, 100), casca = clamp((p.bp - 0.3) / 0.6);
  pb(ctx, (x) => { x.fillStyle = '#777'; x.fillRect(p.cx - w * 0.3, y0 + h, S(p, 30), T.H); x.fillRect(p.cx + w * 0.3, y0 + h, S(p, 30), T.H); }, branco);
  ctx.fillStyle = '#fff'; ctx.fillRect(x0, y0, w, h); ctx.fillStyle = p.ac; ctx.fillRect(x0, y0, w, S(p, 24));
  bloco(ctx, String(p.seg.legenda || 'feito para você').toLowerCase(), p.cx, y0 + h * 0.45, w * 0.84, h * 0.6, S(p, 120), '#15171b', { fonte: fina });
  ctx.fillStyle = '#9aa0a8'; ctx.font = fina(S(p, 30)); ctx.textAlign = 'center'; ctx.fillText('confie em nós', p.cx, y0 + h * 0.86); ctx.textAlign = 'left';
  // tiras arrancadas
  for (let k = 0; k < 8; k++) {
    if (rnd(k * 13) > casca) continue;
    const sx = x0 + (k / 8) * w, sw = w / 8 + 2, sh = h * (0.3 + rnd(k * 7) * 0.7) * casca;
    ctx.fillStyle = '#000'; ctx.fillRect(sx, y0 + h - sh, sw, sh);
    ctx.fillStyle = p.ac; ctx.font = mono(S(p, 30)); ctx.fillText(rnd(k + passo(p.f, 4)) > 0.5 ? '$$$' : 'DADOS', sx + S(p, 8), y0 + h - sh / 2);
  }
}
// promessa: palco de lançamento, telão e plateia
function palco(p) {
  const ctx = p.ctx; cheio(p, '#020202');
  const w = T.W * 0.86, h = S(p, 470), x0 = p.cx - w / 2, y0 = p.cy - S(p, 460);
  const g = ctx.createLinearGradient(x0, y0, x0 + w, y0 + h); g.addColorStop(0, p.ac); g.addColorStop(1, '#101010');
  ctx.fillStyle = g; ctx.fillRect(x0, y0, w, h);
  bloco(ctx, String(p.seg.legenda || 'o futuro chegou').toUpperCase(), p.cx, y0 + h / 2, w * 0.86, h * 0.7, S(p, 110), '#fff', { fonte: grossa });
  ctx.globalAlpha = 0.18; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(p.cx - S(p, 40), 0); ctx.lineTo(p.cx + S(p, 40), 0); ctx.lineTo(p.cx + S(p, 220), p.cy + S(p, 330)); ctx.lineTo(p.cx - S(p, 220), p.cy + S(p, 330)); ctx.fill(); ctx.globalAlpha = 1;
  pb(ctx, (x) => {
    pessoa(x, p.cx, p.cy + S(p, 170), 0.8 * p.s, 0);
    x.fillStyle = '#555'; x.fillRect(0, p.cy + S(p, 330), T.W, S(p, 30));
    for (let i = 0; i < 12; i++) { x.fillStyle = '#2a2a2a'; x.beginPath(); x.arc((i + 0.5) * T.W / 12 + (i % 2) * 20, T.H - S(p, 120) - (i % 2) * S(p, 30), S(p, 70), 0, 7); x.fill(); }
  }, { escuro: '#000000', cor: '#9a9a9a' });
  // celulares da plateia filmando
  for (let i = 0; i < 6; i++) { const xx = (i + 0.7) * T.W / 6.3, yy = T.H - S(p, 260) + Math.sin(p.f / 7 + i) * 6; ctx.fillStyle = '#000'; ctx.fillRect(xx, yy, S(p, 50), S(p, 90)); ctx.fillStyle = p.ac; ctx.fillRect(xx + S(p, 6), yy + S(p, 8), S(p, 38), S(p, 72)); }
}
// prova: documento com tarjas que vão sendo arrancadas
function documento(p) {
  const ctx = p.ctx, P = p.P; papel(p, 'x', 40);
  const w = S(p, 640), h = S(p, 880), e = salto(p.lf / 8);
  ctx.save(); ctx.translate(p.cx, p.cy + (1 - e) * T.H * 0.4); ctx.rotate(-0.03 + (p.i % 2) * 0.05);
  ctx.fillStyle = '#000'; ctx.fillRect(-w / 2 + 14, -h / 2 + 14, w, h); ctx.fillStyle = '#f1efe8'; ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.fillStyle = '#111'; ctx.font = mono(S(p, 30)); ctx.textBaseline = 'middle'; ctx.fillText(String(P.fonte || 'DOCUMENTO').toUpperCase().slice(0, 26), -w * 0.43, -h / 2 + S(p, 50));
  ctx.fillRect(-w * 0.43, -h / 2 + S(p, 80), w * 0.86, 4);
  const ws = String(p.seg.fala || P.noticia || '').split(/\s+/);
  ctx.font = mono(S(p, 34)); let x = -w * 0.43, y = -h / 2 + S(p, 140);
  ws.forEach((wd, i) => {
    const lw = ctx.measureText(wd + ' ').width;
    if (x + lw > w * 0.43) { x = -w * 0.43; y += S(p, 52); }
    const revela = rnd(i * 17) < clamp((p.lf - 4) / 16) || /\d/.test(wd);
    if (revela) { if (/\d|[A-ZÁÉÍÓÚ]/.test(wd[0])) { ctx.fillStyle = p.ac; ctx.fillRect(x - 3, y - S(p, 22), lw - 4, S(p, 44)); } ctx.fillStyle = '#111'; ctx.fillText(wd, x, y); }
    else { ctx.fillStyle = '#111'; ctx.fillRect(x, y - S(p, 18), lw - 8, S(p, 36)); }
    x += lw;
  });
  for (let yy = y + S(p, 70); yy < h / 2 - S(p, 60); yy += S(p, 52)) { ctx.fillStyle = '#111'; ctx.fillRect(-w * 0.43, yy - S(p, 18), w * (0.5 + rnd(yy) * 0.36), S(p, 36)); }
  ctx.restore();
  carimbo(ctx, 'CONFIDENCIAL', p.cx + S(p, 120), p.cy + S(p, 300), p.ac, p.lf - 12, S(p, 50), true);
}
// golpe final: tela dividida, "eles" de um lado e "você" do outro
function divisao(p) {
  const ctx = p.ctx, fr = String(p.seg.fala || '').split(/(?<=[.!?])\s+/).filter(Boolean);
  const a = fr[0] || 'ELES LUCRAM.', b = fr[1] || 'VOCÊ PAGA.', v = T.v, ent = salto(p.lf / 6);
  ctx.fillStyle = p.ac; if (v) ctx.fillRect(0, 0, T.W, T.H / 2); else ctx.fillRect(0, 0, T.W / 2, T.H);
  ctx.fillStyle = '#000'; if (v) ctx.fillRect(0, T.H / 2, T.W, T.H / 2); else ctx.fillRect(T.W / 2, 0, T.W / 2, T.H);
  const [x1, y1, x2, y2, lw, lh] = v ? [p.cx, T.H * 0.27, p.cx, T.H * 0.66, T.W * 0.86, T.H * 0.3] : [T.W * 0.25, p.cy, T.W * 0.75, p.cy, T.W * 0.44, T.H * 0.7];
  ctx.save(); ctx.translate((1 - ent) * -T.W, 0); bloco(ctx, a.toUpperCase(), x1, y1, lw, lh, v ? 150 : 100, '#000', { tremor: 3, seed: passo(p.f, 2) }); ctx.restore();
  if (p.bp > 0.4 || p.lf > 18) { const e2 = salto((p.lf - (p.bp > 0.4 ? 0 : 18)) / 6); ctx.save(); ctx.translate((1 - e2) * T.W, 0); bloco(ctx, b.toUpperCase(), x2, y2, lw, lh, v ? 150 : 100, '#fff', { tremor: 3, seed: passo(p.f, 2) + 9, sombra: p.ac }); ctx.restore(); }
}
// golpe final: uma palavra por linha, alinhada à esquerda, enorme
function pilha(p) {
  const ctx = p.ctx; cheio(p, '#000');
  const ws = p.P.palavras, at = ws.filter((w) => w.ini <= p.t).pop(), s = at ? at.s : -1;
  const lista = ws.filter((w) => w.s === s && w.ini <= p.t + 0.02).map((w) => w.w.toUpperCase());
  const px = T.v ? 150 : 96, x0 = T.W * 0.07;
  ctx.font = grossa(px); ctx.textBaseline = 'middle';
  const vis = lista.slice(-Math.floor((T.H * 0.8) / (px * 1.02)));
  vis.forEach((wd, i) => { const y = T.H * 0.12 + i * px * 1.02, ult = i === vis.length - 1; if (ult) { ctx.fillStyle = p.ac; ctx.fillRect(x0 - 14, y - px * 0.55, ctx.measureText(wd).width + 28, px * 1.06); } ctx.fillStyle = ult ? '#000' : '#fff'; ctx.fillText(wd, x0, y); });
}
// escolha: estrada que se divide em duas
function estrada(p) {
  const ctx = p.ctx; cheio(p, '#030303');
  const hz = p.cy - S(p, 260), esq = p.bp < 0.5;
  pb(ctx, (x) => {
    const g = x.createLinearGradient(0, hz, 0, T.H); g.addColorStop(0, '#333'); g.addColorStop(1, '#bbb');
    x.fillStyle = g; x.beginPath(); x.moveTo(p.cx - S(p, 30), hz); x.lineTo(p.cx + S(p, 30), hz); x.lineTo(p.cx + S(p, 420), T.H); x.lineTo(p.cx - S(p, 420), T.H); x.fill();
    for (const k of [-1, 1]) { x.beginPath(); x.moveTo(p.cx, hz + S(p, 200)); x.lineTo(p.cx + k * T.W * 0.6, hz - S(p, 20)); x.lineTo(p.cx + k * T.W * 0.6, hz + S(p, 40)); x.lineTo(p.cx + k * S(p, 60), hz + S(p, 330)); x.fill(); }
  }, { escuro: '#000000', cor: '#bdbdbd' });
  ctx.fillStyle = p.ac; for (let i = 0; i < 8; i++) { const t = ((i + p.f / 10) % 8) / 8, y = hz + S(p, 330) + t * (T.H - hz), w = S(p, 6 + t * 26); ctx.fillRect(p.cx - w / 2, y, w, S(p, 20 + t * 60)); }
  ['ACEITAR', 'RESISTIR'].forEach((s, i) => {
    const on = (i === 0) === esq, k = i ? 1 : -1, x = p.cx + k * (T.v ? T.W * 0.25 : S(p, 380)), y = hz + S(p, 40), pw = T.v ? T.W * 0.22 : S(p, 190);
    ctx.fillStyle = '#666'; ctx.fillRect(x - S(p, 8), y, S(p, 16), S(p, 220));
    ctx.save(); ctx.translate(x, y); ctx.rotate(k * 0.04); ctx.fillStyle = on ? (i ? p.ac : '#f2f2f2') : '#333'; ctx.fillRect(-pw, -S(p, 70), pw * 2, S(p, 120));
    bloco(ctx, s, 0, -S(p, 10), pw * 1.8, S(p, 100), S(p, 70), on ? '#000' : '#888'); ctx.restore();
  });
}

// ---------- ilustração gerada no PC (pontilhado na cor neon, com zoom lento) ----------
function ilustracao(p) {
  const lista = p.P.imagens || [], img = IMAGENS[lista[p.img ?? 0]];
  if (!img) return hospitalOuMascara(p);
  const ctx = p.ctx; cheio(p, '#000');
  const lado = Math.min(T.W, T.H) * (T.v ? 1.0 : 0.95) * (1.04 + p.lf * 0.0022), x0 = p.cx - lado / 2 + Math.sin(p.f / 40) * 12, y0 = (T.v ? T.H * 0.4 : p.cy) - lado / 2;
  // gravura de fundo claro vira negativo: traço neon sobre preto, como o resto do vídeo
  const f = (claro(img) ? 'invert(1) ' : '') + 'brightness(0.7) contrast(1.6)';   // só as luzes da gravura viram neon
  pb(ctx, (x) => { x.filter = f; x.drawImage(img, x0, y0, lado, lado); x.filter = 'none'; }, { cor: p.ac, escuro: '#000000', cel: T.v ? 4 : 3 });
  // cantos de "arquivo" em branco
  const m = S(p, 50); ctx.strokeStyle = COR.branco; ctx.lineWidth = S(p, 6); ctx.beginPath();
  for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const cx = x0 + a * lado + (a ? -m : m) * 0.6, cy = y0 + b * lado + (b ? -m : m) * 0.6; ctx.moveTo(cx, cy + (b ? -m : m)); ctx.lineTo(cx, cy); ctx.lineTo(cx + (a ? -m : m), cy); }
  ctx.stroke();
}
const _claro = new Map();
function claro(img) {
  if (!_claro.has(img)) {
    const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, 32, 32);
    // fundo = bordas da imagem
    const d = x.getImageData(0, 0, 32, 32).data; let s = 0, n = 0;
    for (let y = 0; y < 32; y++) for (let k = 0; k < 32; k++) if (y < 3 || y > 28 || k < 3 || k > 28) { s += d[(y * 32 + k) * 4]; n++; }
    _claro.set(img, s / n > 170);
  }
  return _claro.get(img);
}
const hospitalOuMascara = (p) => papel(p, 'olhos', 120);   // imagem não carregou: só o fundo

export const NOVAS = { hospital, escola, fabrica, servidor, algemas, balanca, predio, grafico, radar, terminal, casa, planeta, robo, cadeado, carteira, familia,
  letreiro, procurado, outdoor, palco, documento, divisao, pilha, estrada, ilustracao };
export const NOVAS_SEM_LEGENDA = ['divisao', 'pilha', 'terminal'];
export const NOVAS_SEM_FAIXA = ['letreiro', 'procurado', 'divisao', 'pilha', 'outdoor', 'palco'];
