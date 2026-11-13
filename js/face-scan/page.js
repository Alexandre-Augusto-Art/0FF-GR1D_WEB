/* F4C3 SC4N - interface da página
 * Liga câmera/arquivo ao FaceScan (client.js), desenha as caixas e monta o diagnóstico.
 * As imagens só existem na memória desta aba.
 */
(function () {
  'use strict';

  const NEAR_MATCH = 0.25; // abaixo do limiar, mas perto o bastante para um modelo melhor acertar
  const MODEL_SIZE_MB = 25;

  const $ = (id) => document.getElementById(id);
  const els = {
    status: $('fs-status'),
    progress: $('fs-progress'),
    refThumb: $('fs-ref-thumb'),
    refNote: $('fs-ref-note'),
    camera: $('fs-camera'),
    video: $('fs-video'),
    result: $('fs-result'),
    canvas: $('fs-canvas'),
    indicators: $('fs-indicators'),
    tips: $('fs-tips')
  };

  let reference = null;   // { embedding }
  let lastTest = null;    // resultado do último teste, para recalcular se a referência mudar
  let camTarget = null;   // 'ref' | 'test'
  let facing = 'user';
  let stream = null;
  let busy = false;
  let modelReady = false;

  // ---------- status ----------
  function setStatus(text, isError) {
    els.status.textContent = text;
    els.status.classList.toggle('is-error', !!isError);
  }

  FaceScan.onProgress((p) => {
    const pct = Math.round(100 * p.loaded / p.total);
    els.progress.hidden = false;
    els.progress.firstElementChild.style.width = pct + '%';
    setStatus(`IA LOCAL: BAIXANDO MODELO ${p.stage} ${pct}%`);
  });

  function ensureModel() {
    if (modelReady) return Promise.resolve();
    setStatus('IA LOCAL: CARREGANDO...');
    return FaceScan.init().then(() => {
      modelReady = true;
      els.progress.hidden = true;
      setStatus('IA LOCAL: PRONTA · NADA SAI DO APARELHO');
    });
  }

  function setBusy(value) {
    busy = value;
    document.querySelectorAll('.fs-btn, [data-file]').forEach((b) => { b.disabled = value; });
  }

  // ---------- imagens ----------
  function fileToBitmap(file) {
    return createImageBitmap(file, { imageOrientation: 'from-image' });
  }

  function drawScaled(bitmap, canvas, maxSide) {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return { ctx, scale };
  }

  function strokeBoxes(ctx, scale, items, color, lineWidth) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    for (const item of items) {
      const [x, y, w, h] = item.box.map((v) => v * scale);
      ctx.strokeRect(x, y, w, h);
    }
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // ---------- análise ----------
  async function handleImage(target, bitmap) {
    if (busy) return;
    setBusy(true);
    try {
      await ensureModel();
      if (target === 'ref') await analyzeReference(bitmap);
      else await analyzeTest(bitmap);
    } catch (err) {
      setStatus('ERRO: ' + (err && err.message ? err.message : err), true);
    } finally {
      setBusy(false);
    }
  }

  async function analyzeReference(bitmap) {
    const thumb = document.createElement('canvas');
    const { ctx, scale } = drawScaled(bitmap, thumb, 440);
    setStatus('ANALISANDO REFERÊNCIA...');
    const result = await FaceScan.analyze(bitmap);
    const face = FaceScan.largestFace(result);

    els.refThumb.replaceChildren(thumb);
    els.refThumb.hidden = false;
    document.querySelector('[data-clear="ref"]').hidden = false;

    if (!face) {
      reference = null;
      els.refNote.textContent = 'Nenhum rosto encontrado. Tire a selfie de frente, sem disfarce e com boa luz.';
      els.refNote.classList.add('is-error');
    } else {
      reference = { embedding: face.embedding };
      strokeBoxes(ctx, scale, [face], cssVar('--fs-face'), 3);
      els.refNote.textContent = result.faces.length > 1
        ? 'Referência pronta. Havia mais de um rosto: usei o maior.'
        : 'Referência pronta.';
      els.refNote.classList.remove('is-error');
    }
    setStatus('IA LOCAL: PRONTA · NADA SAI DO APARELHO');
    if (lastTest) renderDiagnosis(lastTest);
  }

  async function analyzeTest(bitmap) {
    const { ctx, scale } = drawScaled(bitmap, els.canvas, 1600);
    setStatus('ANALISANDO FOTO...');
    const result = await FaceScan.analyze(bitmap);
    const lineWidth = Math.max(2, Math.round(Math.max(els.canvas.width, els.canvas.height) / 300));
    strokeBoxes(ctx, scale, result.people, cssVar('--fs-body'), lineWidth);
    strokeBoxes(ctx, scale, result.faces, cssVar('--fs-face'), lineWidth);
    lastTest = result;
    renderDiagnosis(result);
    els.result.hidden = false;
    els.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setStatus(`IA LOCAL: PRONTA · ANÁLISE EM ${(result.elapsedMs / 1000).toFixed(1)} s`);
  }

  // ---------- diagnóstico ----------
  function bestSimilarity(result) {
    if (!reference || !result.faces.length) return null;
    return Math.max(...result.faces.map((f) => FaceScan.compare(f.embedding, reference.embedding)));
  }

  function indicator(label, level, value, detail, meter) {
    const card = document.createElement('div');
    card.className = 'fs-indicator is-' + level;
    const l = document.createElement('div');
    l.className = 'fs-indicator-label';
    l.textContent = label;
    const v = document.createElement('div');
    v.className = 'fs-indicator-value';
    v.textContent = value;
    const d = document.createElement('div');
    d.className = 'fs-indicator-detail';
    d.textContent = detail;
    card.append(l, v, d);
    if (meter) {
      const bar = document.createElement('div');
      bar.className = 'fs-meter';
      const fill = document.createElement('span');
      fill.style.width = Math.round(100 * Math.min(1, Math.max(0, meter.value))) + '%';
      const mark = document.createElement('i');
      mark.style.left = Math.round(100 * meter.threshold) + '%';
      mark.title = 'limiar de "mesma pessoa"';
      bar.append(fill, mark);
      card.appendChild(bar);
    }
    return card;
  }

  function renderDiagnosis(result) {
    const faces = result.faces.length;
    const people = result.people.length;
    const sim = bestSimilarity(result);
    const tips = [];

    const cards = [];
    cards.push(faces
      ? indicator('ROSTO', 'danger', faces === 1 ? 'ENCONTRADO' : `${faces} ROSTOS`,
        'Uma câmera conseguiria localizar o rosto e tentar identificar.')
      : indicator('ROSTO', 'safe', 'NÃO ENCONTRADO',
        'Nenhum rosto foi localizado nesta foto.'));

    cards.push(people
      ? indicator('CORPO', 'warn', people === 1 ? 'ENCONTRADO' : `${people} PESSOAS`,
        'Esperado: quase nenhum disfarce esconde o corpo. O risco é ser seguido pela roupa de câmera em câmera.')
      : indicator('CORPO', 'safe', 'NÃO ENCONTRADO',
        'Nenhuma pessoa foi localizada. Raro: confira se a foto mostra o corpo.'));

    if (!reference) {
      cards.push(indicator('IDENTIDADE', 'neutral', 'SEM REFERÊNCIA',
        'Adicione uma selfie sem disfarce no passo 1 para medir se a IA ainda liga a foto a você.'));
    } else if (sim === null) {
      cards.push(indicator('IDENTIDADE', 'safe', 'SEM ROSTO',
        'Sem rosto na foto, não há o que comparar com a sua selfie.'));
    } else {
      const pct = Math.round(sim * 100);
      const meter = { value: sim, threshold: FaceScan.MATCH };
      if (sim >= FaceScan.MATCH) {
        cards.push(indicator('IDENTIDADE', 'danger', 'RECONHECÍVEL',
          `Semelhança de ${pct}% com a sua selfie: a IA diz que é você.`, meter));
      } else if (sim >= NEAR_MATCH) {
        cards.push(indicator('IDENTIDADE', 'warn', 'NO LIMITE',
          `Semelhança de ${pct}%: abaixo do limiar, mas um sistema mais forte provavelmente acertaria.`, meter));
      } else {
        cards.push(indicator('IDENTIDADE', 'safe', 'NÃO LIGADO A VOCÊ',
          `Semelhança de ${pct}%: esta IA não ligou a foto à sua selfie.`, meter));
      }
    }
    els.indicators.replaceChildren(...cards);

    if (faces) {
      tips.push('Cubra os olhos e a região do nariz e da boca: óculos escuros + máscara (PFF2 ou cirúrgica) + boné com aba é a combinação que mais derruba a identificação.');
    }
    if (sim !== null && sim >= FaceScan.MATCH) {
      tips.push('A IA ainda liga esta foto a você. Acrescente outra camada (capuz, aba mais baixa, óculos maiores) e teste de novo.');
    } else if (sim !== null && sim >= NEAR_MATCH) {
      tips.push('Você está no limite. Uma camada a mais costuma bastar para cair bem abaixo do limiar.');
    } else if (sim !== null) {
      tips.push('Bom resultado para esta IA. Teste outros ângulos: de longe, de lado e de cima, como câmeras de poste e drones.');
    }
    if (faces > 1) {
      tips.push('Havia mais de um rosto na foto: a identidade mostra a maior semelhança entre eles.');
    }
    if (!reference) {
      tips.push('Para medir a identidade, adicione uma selfie sem disfarce no passo 1. Ela também não sai do aparelho.');
    }
    if (people) {
      tips.push('Seu corpo é visível para as câmeras: use roupa lisa, igual à do grupo e sem marcas, cubra tatuagens e troque de roupa ao sair.');
    }
    tips.push('Guarda-chuva bloqueia câmeras altas e drones. E deixe o celular em casa ou desligado: ele identifica você mais que qualquer câmera.');

    els.tips.replaceChildren(...tips.map((t) => {
      const li = document.createElement('li');
      li.textContent = t;
      return li;
    }));
  }

  // ---------- câmera ----------
  function stopCamera() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    els.video.srcObject = null;
    els.camera.hidden = true;
  }

  async function openCamera(target) {
    camTarget = target;
    stopCamera();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus('ERRO: este navegador não dá acesso à câmera. Use ARQUIVO.', true);
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
    } catch (err) {
      setStatus('ERRO: câmera bloqueada ou indisponível. Use ARQUIVO.', true);
      return;
    }
    els.video.srcObject = stream;
    els.camera.hidden = false;
    await els.video.play();
    els.camera.scrollIntoView({ behavior: 'smooth', block: 'center' });
    ensureModel().catch((err) => setStatus('ERRO: ' + err.message, true));
  }

  async function capture() {
    if (!stream || !els.video.videoWidth) return;
    const frame = document.createElement('canvas');
    frame.width = els.video.videoWidth;
    frame.height = els.video.videoHeight;
    frame.getContext('2d').drawImage(els.video, 0, 0);
    const target = camTarget;
    stopCamera();
    handleImage(target, await createImageBitmap(frame));
  }

  // ---------- eventos ----------
  document.querySelectorAll('[data-camera]').forEach((btn) => {
    btn.addEventListener('click', () => openCamera(btn.dataset.camera));
  });

  document.querySelectorAll('[data-file]').forEach((input) => {
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      input.value = '';
      if (!file) return;
      stopCamera();
      try {
        handleImage(input.dataset.file, await fileToBitmap(file));
      } catch (err) {
        setStatus('ERRO: não consegui abrir essa imagem.', true);
      }
    });
  });

  document.querySelector('[data-clear="ref"]').addEventListener('click', (event) => {
    reference = null;
    els.refThumb.replaceChildren();
    els.refThumb.hidden = true;
    els.refNote.textContent = '';
    event.currentTarget.hidden = true;
    if (lastTest) renderDiagnosis(lastTest);
  });

  $('fs-capture').addEventListener('click', capture);
  $('fs-cam-close').addEventListener('click', stopCamera);
  $('fs-flip').addEventListener('click', () => {
    facing = facing === 'user' ? 'environment' : 'user';
    openCamera(camTarget);
  });

  setStatus(`IA LOCAL: SERÁ BAIXADA NA PRIMEIRA FOTO (~${MODEL_SIZE_MB} MB, UMA VEZ SÓ)`);

  // Guarda página e modelos para funcionar offline nas próximas visitas.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('f4c3-sc4n-sw.js').catch(() => {});
  }
})();
