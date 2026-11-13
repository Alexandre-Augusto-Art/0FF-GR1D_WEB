/* F4C3 SC4N - núcleo de visão (sem dependências)
 * Pré e pós-processamento dos três modelos: YuNet (rostos), YOLOX-nano (pessoas)
 * e SFace (identidade). Roda no Web Worker; as funções puras também carregam no Node.
 * A referência em Python é tests/face-scan/make_expected.py: qualquer mudança aqui
 * precisa ser feita lá também, senão o teste de paridade quebra.
 */
(function (root) {
  'use strict';

  const CONFIG = {
    face: { input: 640, pad: 0, score: 0.6, nms: 0.3 },
    person: { input: 416, pad: 114, score: 0.35, nms: 0.45 },
    sface: {
      size: 112,
      match: 0.363, // limiar de "mesma pessoa" (cosseno) recomendado pelo OpenCV
      template: [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366],
        [41.5493, 92.3655], [70.7299, 92.2041]]
    },
    strides: [8, 16, 32]
  };

  // ---------- geometria ----------
  function iou(a, b) {
    const x1 = Math.max(a[0], b[0]);
    const y1 = Math.max(a[1], b[1]);
    const x2 = Math.min(a[0] + a[2], b[0] + b[2]);
    const y2 = Math.min(a[1] + a[3], b[1] + b[3]);
    const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const union = a[2] * a[3] + b[2] * b[3] - inter;
    return union > 0 ? inter / union : 0;
  }

  function nms(items, threshold) {
    const sorted = items.slice().sort((p, q) => q.score - p.score);
    const kept = [];
    for (const item of sorted) {
      if (kept.every(k => iou(item.box, k.box) <= threshold)) kept.push(item);
    }
    return kept;
  }

  // Umeyama sem reflexão: matriz 2x3 [[a, -b, tx], [b, a, ty]] que leva src em dst.
  function similarityTransform(src, dst) {
    const n = src.length;
    let msx = 0, msy = 0, mdx = 0, mdy = 0;
    for (let i = 0; i < n; i++) {
      msx += src[i][0]; msy += src[i][1]; mdx += dst[i][0]; mdy += dst[i][1];
    }
    msx /= n; msy /= n; mdx /= n; mdy /= n;
    let varS = 0, c00 = 0, c01 = 0, c10 = 0, c11 = 0;
    for (let i = 0; i < n; i++) {
      const sx = src[i][0] - msx, sy = src[i][1] - msy;
      const dx = dst[i][0] - mdx, dy = dst[i][1] - mdy;
      varS += sx * sx + sy * sy;
      c00 += dx * sx; c01 += dx * sy; c10 += dy * sx; c11 += dy * sy;
    }
    varS /= n;
    const a = (c00 + c11) / n;
    const b = (c10 - c01) / n;
    const norm = Math.hypot(a, b);
    const scale = norm / varS;
    const cos = a / norm * scale;
    const sin = b / norm * scale;
    return [
      [cos, -sin, mdx - (cos * msx - sin * msy)],
      [sin, cos, mdy - (sin * msx + cos * msy)]
    ];
  }

  function normalizeVec(vec) {
    let s = 0;
    for (let i = 0; i < vec.length; i++) s += vec[i] * vec[i];
    const inv = 1 / Math.sqrt(s);
    const out = new Float32Array(vec.length);
    for (let i = 0; i < vec.length; i++) out[i] = vec[i] * inv;
    return out;
  }

  function cosine(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }

  // ---------- pré-processamento (precisa de OffscreenCanvas) ----------
  function makeCanvas(w, h) {
    const canvas = new OffscreenCanvas(w, h);
    return { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true }) };
  }

  // Reduz mantendo a proporção e cola no canto superior esquerdo, como o letterbox do Python.
  function letterbox(source, width, height, side, pad) {
    const ratio = Math.min(side / height, side / width);
    const w = Math.round(width * ratio);
    const h = Math.round(height * ratio);
    const { ctx } = makeCanvas(side, side);
    ctx.fillStyle = `rgb(${pad},${pad},${pad})`;
    ctx.fillRect(0, 0, side, side);
    ctx.drawImage(source, 0, 0, w, h);
    return { pixels: ctx.getImageData(0, 0, side, side), ratio };
  }

  // ImageData RGBA -> tensor NCHW float32 (0..255) na ordem de canais pedida.
  function toTensorData(imageData, order) {
    const { data, width, height } = imageData;
    const plane = width * height;
    const out = new Float32Array(3 * plane);
    const channels = order === 'bgr' ? [2, 1, 0] : [0, 1, 2];
    for (let i = 0; i < plane; i++) {
      out[i] = data[i * 4 + channels[0]];
      out[plane + i] = data[i * 4 + channels[1]];
      out[2 * plane + i] = data[i * 4 + channels[2]];
    }
    return out;
  }

  // Recorta o rosto alinhado em 112x112 a partir dos 5 pontos do YuNet.
  function alignFace(source, landmarks) {
    const { size, template } = CONFIG.sface;
    const m = similarityTransform(landmarks, template);
    const { ctx } = makeCanvas(size, size);
    // O OpenCV põe o centro do pixel em coordenadas inteiras e o canvas em +0.5:
    // a translação é corrigida para os dois amostrarem o mesmo ponto.
    const tx = m[0][2] + 0.5 - 0.5 * (m[0][0] + m[0][1]);
    const ty = m[1][2] + 0.5 - 0.5 * (m[1][0] + m[1][1]);
    ctx.setTransform(m[0][0], m[1][0], m[0][1], m[1][1], tx, ty);
    ctx.drawImage(source, 0, 0);
    return ctx.getImageData(0, 0, size, size);
  }

  // ---------- pós-processamento ----------
  // outputs: { cls_8: Float32Array, obj_8, bbox_8, kps_8, ... } da YuNet.
  function decodeFaces(outputs, ratio) {
    const { input, score: minScore, nms: nmsThr } = CONFIG.face;
    const found = [];
    for (const stride of CONFIG.strides) {
      const cols = input / stride;
      const cls = outputs['cls_' + stride];
      const obj = outputs['obj_' + stride];
      const bbox = outputs['bbox_' + stride];
      const kps = outputs['kps_' + stride];
      for (let idx = 0; idx < cls.length; idx++) {
        const score = Math.sqrt(Math.min(Math.max(cls[idx], 0), 1) * Math.min(Math.max(obj[idx], 0), 1));
        if (score < minScore) continue;
        const r = Math.floor(idx / cols);
        const c = idx % cols;
        const cx = (c + bbox[idx * 4]) * stride;
        const cy = (r + bbox[idx * 4 + 1]) * stride;
        const w = Math.exp(bbox[idx * 4 + 2]) * stride;
        const h = Math.exp(bbox[idx * 4 + 3]) * stride;
        const landmarks = [];
        for (let n = 0; n < 5; n++) {
          landmarks.push([
            (kps[idx * 10 + 2 * n] + c) * stride / ratio,
            (kps[idx * 10 + 2 * n + 1] + r) * stride / ratio
          ]);
        }
        found.push({
          box: [(cx - w / 2) / ratio, (cy - h / 2) / ratio, w / ratio, h / ratio],
          score,
          landmarks
        });
      }
    }
    return nms(found, nmsThr);
  }

  // output: Float32Array [N * 85] do YOLOX (cx, cy, w, h, obj, 80 classes COCO).
  function decodePeople(output, ratio) {
    const { input, score: minScore, nms: nmsThr } = CONFIG.person;
    const found = [];
    let offset = 0;
    for (const stride of CONFIG.strides) {
      const cols = input / stride;
      for (let idx = 0; idx < cols * cols; idx++) {
        const row = (offset + idx) * 85;
        const score = output[row + 4] * output[row + 5]; // objectness * classe 0 (pessoa)
        if (score < minScore) continue;
        const r = Math.floor(idx / cols);
        const c = idx % cols;
        const cx = (output[row] + c) * stride;
        const cy = (output[row + 1] + r) * stride;
        const w = Math.exp(output[row + 2]) * stride;
        const h = Math.exp(output[row + 3]) * stride;
        found.push({
          box: [(cx - w / 2) / ratio, (cy - h / 2) / ratio, w / ratio, h / ratio],
          score
        });
      }
      offset += cols * cols;
    }
    return nms(found, nmsThr);
  }

  const api = {
    CONFIG, iou, nms, similarityTransform, normalizeVec, cosine,
    letterbox, toTensorData, alignFace, decodeFaces, decodePeople
  };
  root.FaceScanVision = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
