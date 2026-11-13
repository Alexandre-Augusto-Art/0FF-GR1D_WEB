/* F4C3 SC4N - Web Worker de inferência
 * Carrega o onnxruntime-web e os três modelos, e analisa imagens fora da thread da tela.
 * A imagem chega como ImageBitmap e nunca sai deste aparelho.
 *
 * Mensagens recebidas: { id, type: 'init' } | { id, type: 'analyze', bitmap }
 * Mensagens enviadas:  { id, type: 'progress', stage, loaded, total }
 *                      { id, type: 'ready' } | { id, type: 'result', result } | { id, type: 'error', message }
 */
'use strict';

// onnxruntime-web 1.20.1 copiado para vendor/: funciona offline e não avisa nenhum CDN da visita.
const ORT_BASE = new URL('../../vendor/onnxruntime-web/', self.location).href;
const MODELS = {
  face: { url: new URL('../../models/yunet_2023mar.onnx', self.location).href, label: 'ROSTOS' },
  person: { url: new URL('../../models/yolox_nano.onnx', self.location).href, label: 'CORPOS' },
  sface: { url: new URL('../../models/sface_2021dec_int8.onnx', self.location).href, label: 'IDENTIDADE' }
};

importScripts('vision.js', ORT_BASE + 'ort.wasm.min.js');
/* global ort, FaceScanVision */
const V = FaceScanVision;

ort.env.wasm.wasmPaths = ORT_BASE;
ort.env.wasm.numThreads = 1; // GitHub Pages não tem isolamento cross-origin; sem ele não há threads
ort.env.logLevel = 'error'; // o SFace int8 gera centenas de avisos inofensivos sobre initializers

let sessions = null;
let loading = null;

async function fetchModel(key, id) {
  const { url, label } = MODELS[key];
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar o modelo ${label} (${res.status}).`);
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !total) return new Uint8Array(await res.arrayBuffer());

  const reader = res.body.getReader();
  const bytes = new Uint8Array(total);
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes.set(value, loaded);
    loaded += value.length;
    self.postMessage({ id, type: 'progress', stage: label, loaded, total });
  }
  return bytes;
}

function loadSessions(id) {
  if (!loading) {
    loading = (async () => {
      const opts = { executionProviders: ['wasm'], graphOptimizationLevel: 'all', logSeverityLevel: 3 };
      const out = {};
      for (const key of Object.keys(MODELS)) {
        out[key] = await ort.InferenceSession.create(await fetchModel(key, id), opts);
      }
      sessions = out;
      return out;
    })();
    loading.catch(() => { loading = null; });
  }
  return loading;
}

async function runFaces(bitmap) {
  const { input, pad } = V.CONFIG.face;
  const { pixels, ratio } = V.letterbox(bitmap, bitmap.width, bitmap.height, input, pad);
  const tensor = new ort.Tensor('float32', V.toTensorData(pixels, 'bgr'), [1, 3, input, input]);
  const out = await sessions.face.run({ [sessions.face.inputNames[0]]: tensor });
  const data = {};
  for (const name of Object.keys(out)) data[name] = out[name].data;
  return V.decodeFaces(data, ratio);
}

async function runPeople(bitmap) {
  const { input, pad } = V.CONFIG.person;
  const { pixels, ratio } = V.letterbox(bitmap, bitmap.width, bitmap.height, input, pad);
  const tensor = new ort.Tensor('float32', V.toTensorData(pixels, 'bgr'), [1, 3, input, input]);
  const out = await sessions.person.run({ [sessions.person.inputNames[0]]: tensor });
  return V.decodePeople(out[sessions.person.outputNames[0]].data, ratio);
}

async function embed(bitmap, face) {
  const size = V.CONFIG.sface.size;
  const aligned = V.alignFace(bitmap, face.landmarks);
  const tensor = new ort.Tensor('float32', V.toTensorData(aligned, 'rgb'), [1, 3, size, size]);
  const out = await sessions.sface.run({ [sessions.sface.inputNames[0]]: tensor });
  return V.normalizeVec(out[sessions.sface.outputNames[0]].data);
}

async function analyze(bitmap) {
  const started = performance.now();
  const faces = await runFaces(bitmap);
  const people = await runPeople(bitmap);
  for (const face of faces) face.embedding = await embed(bitmap, face);
  return {
    width: bitmap.width,
    height: bitmap.height,
    faces,
    people,
    elapsedMs: Math.round(performance.now() - started)
  };
}

self.onmessage = async (event) => {
  const { id, type, bitmap } = event.data;
  try {
    await loadSessions(id);
    if (type === 'init') {
      self.postMessage({ id, type: 'ready' });
    } else if (type === 'analyze') {
      const result = await analyze(bitmap);
      bitmap.close();
      self.postMessage({ id, type: 'result', result });
    }
  } catch (err) {
    if (bitmap) bitmap.close();
    self.postMessage({ id, type: 'error', message: err && err.message ? err.message : String(err) });
  }
};
