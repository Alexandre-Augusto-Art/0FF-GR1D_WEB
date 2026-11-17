/* F4C3 SC4N - cliente do worker
 * Interface para a página: FaceScan.init(), FaceScan.analyze(arquivo), FaceScan.compare(a, b).
 * Uso: <script src="js/face-scan/client.js" defer></script>
 */
(function () {
  'use strict';

  const SCRIPT_URL = document.currentScript ? document.currentScript.src : location.href;
  // O "?v=" da tag <script> segue para o worker (e dele para o vision.js), para que uma
  // versão nova nunca rode com um worker antigo guardado no cache do navegador.
  const VERSION = new URL(SCRIPT_URL).search;
  const WORKER_URL = new URL('worker.js' + VERSION, SCRIPT_URL).href;
  const MATCH = 0.363; // igual a FaceScanVision.CONFIG.sface.match

  let worker = null;
  let nextId = 1;
  const pending = new Map();
  const progressListeners = new Set();

  function getWorker() {
    if (worker) return worker;
    worker = new Worker(WORKER_URL);
    worker.onmessage = (event) => {
      const msg = event.data;
      if (msg.type === 'progress') {
        progressListeners.forEach(fn => fn(msg));
        return;
      }
      const job = pending.get(msg.id);
      if (!job) return;
      pending.delete(msg.id);
      if (msg.type === 'error') job.reject(new Error(msg.message));
      else job.resolve(msg.result);
    };
    worker.onerror = (event) => {
      const err = new Error(event.message || 'Falha no worker de visão.');
      pending.forEach(job => job.reject(err));
      pending.clear();
    };
    return worker;
  }

  function send(payload, transfer) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      getWorker().postMessage({ id, ...payload }, transfer || []);
    });
  }

  // Carrega os modelos antes do primeiro uso (opcional: analyze também carrega).
  function init() {
    return send({ type: 'init' });
  }

  // Aceita File, Blob, <img>, <canvas>, <video> ou ImageBitmap.
  async function analyze(source) {
    const bitmap = source instanceof ImageBitmap
      ? source
      : await createImageBitmap(source, { imageOrientation: 'from-image' });
    return send({ type: 'analyze', bitmap }, [bitmap]);
  }

  // Semelhança de cosseno entre dois embeddings já normalizados.
  function compare(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }

  function largestFace(result) {
    let best = null;
    for (const face of result.faces) {
      if (!best || face.box[2] * face.box[3] > best.box[2] * best.box[3]) best = face;
    }
    return best;
  }

  window.FaceScan = {
    MATCH,
    init,
    analyze,
    compare,
    largestFace,
    onProgress(fn) { progressListeners.add(fn); return () => progressListeners.delete(fn); }
  };
})();
