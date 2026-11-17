/* DEDSEC - Fact Check: abas IMAGEM e VÍDEO.
 * O arquivo é lido no próprio navegador (FileReader / canvas). Nada é enviado.
 *  - Imagem: metadados (media-meta.js), miniatura embutida x foto, ELA (análise de nível de erro).
 *  - Vídeo: metadados da caixa "moov" e quadros-chave para busca reversa.
 */
(function () {
  'use strict';

  const M = window.FactCheckMeta;
  const UI = window.FactCheckUI;
  if (!M || !UI) return;
  const { el } = UI;
  const $ = id => document.getElementById(id);

  const MAX_IMAGE = 40 * 1024 * 1024;
  const MAX_VIDEO = 1024 * 1024 * 1024;

  const VERDICTS = {
    danger: { tag: 'ALERTA', text: 'O próprio arquivo tem sinais fortes de IA ou de montagem. Não repasse como se fosse real.' },
    warn: { tag: 'CUIDADO', text: 'Há pontos para conferir antes de acreditar. Veja os sinais e faça a busca reversa.' },
    unknown: { tag: 'SEM ALERTAS NO ARQUIVO', text: 'Não achei sinais de IA ou montagem nos dados do arquivo. Isso não prova que é verdadeiro: o mais importante é achar onde apareceu primeiro (busca reversa abaixo).' }
  };

  const fmtSize = n => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  const fmtMetaDate = s => {
    const d = M.parseDate(s);
    return d ? d.toLocaleString('pt-BR', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' }) : s;
  };
  const fmtTime = s => { const m = Math.floor(s / 60); return m + ':' + String(Math.floor(s % 60)).padStart(2, '0'); };

  function canvasOf(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  function drawFit(src, max) {
    const w = src.width || src.videoWidth, h = src.height || src.videoHeight;
    const s = Math.min(1, max / Math.max(w, h));
    const c = canvasOf(Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)));
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c;
  }

  function facts(list, rows) {
    list.replaceChildren(...rows.filter(r => r[1]).map(([k, v]) => {
      const d = el('div', 'fc-fact');
      d.append(el('dt', '', k), el('dd', '', v));
      return d;
    }));
  }

  /* ---------- ELA ---------- */
  /** Salva a imagem de novo em JPEG e mostra onde ela muda mais: áreas coladas ou retocadas costumam "brilhar" diferente. */
  async function ela(bitmap, quality = 0.9, amp = 18) {
    const a = drawFit(bitmap, 2400);
    const blob = await new Promise(r => a.toBlob(r, 'image/jpeg', quality));
    const again = await createImageBitmap(blob);
    const b = canvasOf(a.width, a.height);
    b.getContext('2d').drawImage(again, 0, 0);
    const da = a.getContext('2d').getImageData(0, 0, a.width, a.height).data;
    const db = b.getContext('2d').getImageData(0, 0, a.width, a.height).data;
    const out = new ImageData(a.width, a.height);
    const o = out.data;
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
      const v = Math.min(255, d * amp);
      o[i] = v > 170 ? (v - 170) * 3 : 0;
      o[i + 1] = v;
      o[i + 2] = Math.min(255, v * 1.6);
      o[i + 3] = 255;
    }
    const c = canvasOf(a.width, a.height);
    c.getContext('2d').putImageData(out, 0, 0);
    return c;
  }

  /* ---------- miniatura x foto ---------- */
  function grayBlocks(canvas, grid) {
    const { width: w, height: h } = canvas;
    const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
    const g = new Float32Array(w * h);
    for (let i = 0; i < g.length; i++) g[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
    return { g, w, h, grid };
  }

  function blockDiff(A, B) {
    const { w, h, grid } = A;
    let worst = 0;
    for (let by = 0; by < grid; by++) {
      for (let bx = 0; bx < grid; bx++) {
        let sum = 0, n = 0;
        for (let y = Math.floor(by * h / grid); y < Math.floor((by + 1) * h / grid); y++) {
          for (let x = Math.floor(bx * w / grid); x < Math.floor((bx + 1) * w / grid); x++) { sum += Math.abs(A.g[y * w + x] - B.g[y * w + x]); n++; }
        }
        if (n) worst = Math.max(worst, sum / n);
      }
    }
    return worst;
  }

  /** Menor diferença entre a miniatura e a foto, testando giros (EXIF Orientation) e tarjas pretas. */
  async function compareThumb(main, thumbBytes) {
    let thumb;
    try { thumb = await createImageBitmap(new Blob([thumbBytes], { type: 'image/jpeg' })); } catch (e) { return null; }
    const W = 64, H = Math.max(8, Math.round(64 * thumb.height / thumb.width));
    const t = canvasOf(W, H);
    t.getContext('2d').drawImage(thumb, 0, 0, W, H);
    const T = grayBlocks(t, 4);
    let best = Infinity;
    for (const rot of [0, 90, 180, 270]) {
      for (const fit of ['stretch', 'contain']) {
        const c = canvasOf(W, H);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        ctx.translate(W / 2, H / 2);
        ctx.rotate(rot * Math.PI / 180);
        const side = rot % 180 !== 0;
        const boxW = side ? H : W, boxH = side ? W : H;
        let dw = boxW, dh = boxH;
        if (fit === 'contain') {
          const s = Math.min(boxW / main.width, boxH / main.height);
          dw = main.width * s; dh = main.height * s;
        }
        ctx.drawImage(main, -dw / 2, -dh / 2, dw, dh);
        best = Math.min(best, blockDiff(T, grayBlocks(c, 4)));
      }
    }
    const show = canvasOf(thumb.width, thumb.height);
    show.getContext('2d').drawImage(thumb, 0, 0);
    return { diff: best, canvas: show };
  }

  /* ---------- IMAGEM ---------- */
  let elaCanvas = null, previewCanvas = null;

  function showImageView(which) {
    const wrap = $('fc-image-view');
    const c = which === 'ela' ? elaCanvas : previewCanvas;
    if (!c) return;
    wrap.replaceChildren(c);
    $('fc-image-view-original').classList.toggle('is-active', which !== 'ela');
    $('fc-image-view-ela').classList.toggle('is-active', which === 'ela');
    $('fc-ela-help').hidden = which !== 'ela';
  }

  async function handleImage(file) {
    const status = $('fc-image-status');
    $('fc-image-result').hidden = true;
    if (!file) return;
    if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|heic|heif|gif|avif)$/i.test(file.name)) {
      UI.setStatus(status, 'Esse arquivo não parece uma imagem.', true); return;
    }
    if (file.size > MAX_IMAGE) { UI.setStatus(status, 'Imagem grande demais (máx. 40 MB).', true); return; }
    UI.setStatus(status, 'LENDO O ARQUIVO...');

    const bytes = new Uint8Array(await file.arrayBuffer());
    const meta = M.parseImage(bytes);
    let bitmap = null;
    try { bitmap = await createImageBitmap(file); } catch (e) { /* HEIC e afins: o navegador não abre */ }

    let thumb = null;
    if (bitmap && meta.thumbnail) {
      UI.setStatus(status, 'COMPARANDO COM A MINIATURA...');
      thumb = await compareThumb(bitmap, meta.thumbnail);
    }
    elaCanvas = null;
    if (bitmap && meta.format === 'jpeg') {
      UI.setStatus(status, 'FAZENDO A ELA...');
      try { elaCanvas = await ela(bitmap); } catch (e) { elaCanvas = null; }
    }

    const nameDate = M.filenameDate(file.name);
    const { signals, verdict } = M.signalsFor(meta, 'image', { thumbDiff: thumb ? thumb.diff : null, nameDate });
    UI.setVerdict($('fc-image-verdict'), verdict, VERDICTS);
    UI.renderSignals($('fc-image-signals'), signals);

    previewCanvas = bitmap ? drawFit(bitmap, 1400) : null;
    $('fc-image-view-bar').hidden = !elaCanvas;
    $('fc-image-noview').hidden = !!bitmap;
    if (bitmap) showImageView('original'); else $('fc-image-view').replaceChildren();

    const tbox = $('fc-image-thumb');
    tbox.hidden = !thumb;
    if (thumb) {
      const main = drawFit(bitmap, 400);
      const fig = (c, label) => { const f = el('figure', 'fc-thumb-fig'); f.append(c, el('figcaption', '', label)); return f; };
      $('fc-image-thumb-pair').replaceChildren(fig(thumb.canvas, 'MINIATURA GUARDADA'), fig(main, 'FOTO ATUAL'));
    }

    facts($('fc-image-facts'), [
      ['FORMATO', meta.format.toUpperCase()],
      ['TAMANHO', (meta.width && meta.height ? meta.width + ' × ' + meta.height + ' px · ' : '') + fmtSize(file.size)],
      ['APARELHO', meta.camera],
      ['PROGRAMA', meta.software],
      ['DATA NO ARQUIVO', fmtMetaDate(meta.taken)],
      ['NOME DO ARQUIVO', file.name]
    ]);
    UI.fill($('fc-image-reverse'), UI.REVERSE_SEARCH);

    UI.setStatus(status, '');
    $('fc-image-result').hidden = false;
    $('fc-image-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- VÍDEO ---------- */
  async function readBytes(file, start, end) { return new Uint8Array(await file.slice(start, end).arrayBuffer()); }

  /** Anda pelas caixas do MP4 sem ler o arquivo todo e devolve só a "moov" (onde ficam os metadados). */
  async function readMoov(file) {
    let o = 0, brand = null;
    for (let guard = 0; o + 8 <= file.size && guard < 200; guard++) {
      const h = await readBytes(file, o, o + 16);
      let size = ((h[0] << 24) >>> 0) + (h[1] << 16) + (h[2] << 8) + h[3];
      const type = M.latin1(h, 4, 8);
      if (size === 1) size = (((h[8] << 24) >>> 0) + (h[9] << 16) + (h[10] << 8) + h[11]) * 4294967296 + ((h[12] << 24) >>> 0) + (h[13] << 16) + (h[14] << 8) + h[15];
      else if (size === 0) size = file.size - o;
      if (size < 8) break;
      if (type === 'ftyp') brand = M.latin1(h, 8, 12);
      if (type === 'moov') return { moov: await readBytes(file, o, o + Math.min(size, 60 * 1024 * 1024)), brand };
      if (!/^[\x20-\x7e©]{4}$/.test(type)) break;
      o += size;
    }
    return { moov: null, brand };
  }

  function seek(video, t) {
    return new Promise((resolve, reject) => {
      const done = () => { video.removeEventListener('seeked', done); clearTimeout(timer); resolve(); };
      const timer = setTimeout(() => { video.removeEventListener('seeked', done); reject(new Error('seek')); }, 8000);
      video.addEventListener('seeked', done);
      video.currentTime = t;
    });
  }

  function signature(video) {
    const c = canvasOf(32, 18);
    c.getContext('2d').drawImage(video, 0, 0, 32, 18);
    const d = c.getContext('2d').getImageData(0, 0, 32, 18).data;
    const g = new Float32Array(32 * 18);
    for (let i = 0; i < g.length; i++) g[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 765;
    return g;
  }
  const sigDiff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

  /** Quadros onde a cena muda: são eles que vão para a busca reversa. */
  async function keyframes(video, onProgress) {
    const dur = video.duration;
    if (!isFinite(dur) || dur <= 0) return [];
    const n = Math.round(Math.min(60, Math.max(8, dur * 2)));
    const all = [];
    let lastKept = null;
    for (let i = 0; i < n; i++) {
      const t = Math.min(dur - 0.05, (dur * (i + 0.5)) / n);
      await seek(video, Math.max(0, t));
      const sig = signature(video);
      const cand = { t, sig, diff: lastKept ? sigDiff(sig, lastKept.sig) : 1 };
      cand.canvas = drawFit(video, 640);
      all.push(cand);
      if (cand.diff > 0.1) lastKept = cand;
      onProgress((i + 1) / n);
    }
    let kept = [];
    lastKept = null;
    for (const c of all) {
      if (!lastKept || sigDiff(c.sig, lastKept.sig) > 0.1) { kept.push(c); lastKept = c; }
    }
    if (kept.length > 12) kept = kept.sort((a, b) => b.diff - a.diff).slice(0, 12).sort((a, b) => a.t - b.t);
    if (kept.length < 4) {
      // poucas mudanças de cena: junta quadros espaçados às cenas encontradas
      const even = [0, 1, 2, 3].map(k => all[Math.min(all.length - 1, Math.floor(k * all.length / 4))]);
      kept = [...new Set([...kept, ...even])].sort((a, b) => a.t - b.t);
    }
    return kept;
  }

  function frameFigure(f, baseName) {
    const fig = el('figure', 'fc-frame');
    const btn = el('button', 'fc-btn fc-btn-small', 'BAIXAR ' + fmtTime(f.t));
    btn.type = 'button';
    btn.addEventListener('click', () => {
      f.canvas.toBlob(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${baseName}-quadro-${Math.floor(f.t)}s.png`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      }, 'image/png');
    });
    fig.append(f.canvas, btn);
    return fig;
  }

  let videoUrl = null;

  async function handleVideo(file) {
    const status = $('fc-video-status');
    const progress = $('fc-video-progress');
    $('fc-video-result').hidden = true;
    if (!file) return;
    if (!/^video\//.test(file.type) && !/\.(mp4|mov|m4v|3gp|webm|mkv)$/i.test(file.name)) {
      UI.setStatus(status, 'Esse arquivo não parece um vídeo.', true); return;
    }
    if (file.size > MAX_VIDEO) { UI.setStatus(status, 'Vídeo grande demais (máx. 1 GB).', true); return; }
    UI.setStatus(status, 'LENDO OS DADOS DO ARQUIVO...');

    let meta;
    try {
      const { moov, brand } = await readMoov(file);
      meta = moov ? M.parseMp4Moov(moov, { brand }) : M.parseMp4Moov(new Uint8Array(0), { brand });
      if (!moov) meta.format = /webm|mkv/i.test(file.name) || /webm|matroska/.test(file.type) ? 'webm' : meta.format;
    } catch (e) {
      meta = M.parseMp4Moov(new Uint8Array(0));
    }

    if (videoUrl) URL.revokeObjectURL(videoUrl);
    videoUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = videoUrl;

    let frames = [], playable = true;
    try {
      await new Promise((resolve, reject) => {
        video.addEventListener('loadeddata', resolve, { once: true });
        video.addEventListener('error', () => reject(new Error('codec')), { once: true });
        setTimeout(() => reject(new Error('timeout')), 15000);
      });
      UI.setStatus(status, 'PROCURANDO AS MUDANÇAS DE CENA...');
      progress.hidden = false;
      frames = await keyframes(video, p => { progress.firstElementChild.style.width = Math.round(p * 100) + '%'; });
    } catch (e) {
      playable = false;
    }
    progress.hidden = true;

    const nameDate = M.filenameDate(file.name);
    const { signals, verdict } = M.signalsFor(meta, 'video', { nameDate });
    if (!playable) {
      signals.push({ level: 'info', title: 'O NAVEGADOR NÃO ABRIU O VÍDEO',
        detail: 'Os dados do arquivo foram lidos, mas o navegador não consegue tocar este formato (comum com HEVC/H.265 do iPhone). Tire prints das cenas principais e use a aba IMAGEM.' });
    }
    UI.setVerdict($('fc-video-verdict'), verdict, VERDICTS);
    UI.renderSignals($('fc-video-signals'), signals);

    const base = file.name.replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '_').slice(0, 40) || 'video';
    $('fc-video-frames').replaceChildren(...frames.map(f => frameFigure(f, base)));
    $('fc-video-frames-box').hidden = !frames.length;

    facts($('fc-video-facts'), [
      ['FORMATO', (meta.brand ? meta.brand.trim() + ' · ' : '') + (file.type || meta.format)],
      ['DURAÇÃO', isFinite(video.duration) && video.duration ? fmtTime(video.duration) : meta.duration ? fmtTime(meta.duration) : null],
      ['TAMANHO', (video.videoWidth ? video.videoWidth + ' × ' + video.videoHeight + ' px · ' : '') + fmtSize(file.size)],
      ['APARELHO', meta.camera],
      ['PROGRAMA', meta.software],
      ['DATA NO ARQUIVO', fmtMetaDate(meta.taken)],
      ['NOME DO ARQUIVO', file.name]
    ]);
    UI.fill($('fc-video-reverse'), UI.REVERSE_SEARCH);

    UI.setStatus(status, '');
    $('fc-video-result').hidden = false;
    $('fc-video-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- entrada de arquivos: botão, arrastar e colar ---------- */
  function wireDrop(zoneId, inputId, handler, accept) {
    const zone = $(zoneId), input = $(inputId);
    input.addEventListener('change', () => { handler(input.files[0]); input.value = ''; });
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('is-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('is-over');
      const f = [...e.dataTransfer.files].find(x => accept.test(x.type) || accept.test(x.name));
      if (f) handler(f);
    });
  }

  wireDrop('fc-image-drop', 'fc-image-input', handleImage, /^image\/|\.(heic|heif)$/i);
  wireDrop('fc-video-drop', 'fc-video-input', handleVideo, /^video\/|\.(mp4|mov|m4v|webm|3gp|mkv)$/i);
  $('fc-image-view-original').addEventListener('click', () => showImageView('original'));
  $('fc-image-view-ela').addEventListener('click', () => showImageView('ela'));

  // Ctrl+V com um print na área de transferência abre direto na aba IMAGEM
  document.addEventListener('paste', e => {
    const item = [...(e.clipboardData ? e.clipboardData.items : [])].find(i => i.kind === 'file' && /^image\//.test(i.type));
    if (!item) return;
    e.preventDefault();
    if (window.FactCheckApp) window.FactCheckApp.selectTab('imagem');
    handleImage(item.getAsFile());
  });

  window.FactCheckMedia = { handleImage, handleVideo };
})();
