/* F4C3 SC4N - service worker
 * Guarda a página, o motor e os modelos para o F4C3 SC4N abrir offline.
 * Só responde pelos arquivos da lista abaixo; o resto do site segue direto para a rede.
 * Ao trocar um modelo ou o onnxruntime, suba CACHE_VERSION.
 */
'use strict';

const CACHE_VERSION = 'f4c3-sc4n-v3';

// Mudam pouco e são pesados: servidos do cache primeiro.
const IMMUTABLE = [
  'models/yunet_2023mar.onnx',
  'models/yolox_nano.onnx',
  'models/sface_2021dec_int8.onnx',
  'vendor/onnxruntime-web/ort.wasm.min.js',
  'vendor/onnxruntime-web/ort-wasm-simd-threaded.mjs',
  'vendor/onnxruntime-web/ort-wasm-simd-threaded.wasm'
];

// Podem mudar a cada deploy: rede primeiro, cache se estiver offline.
const SHELL = [
  'f4c3-sc4n.html',
  'css/style.css',
  'css/face-scan.css',
  'assets/Banners/Home.jpg',
  'js/face-scan/client.js',
  'js/face-scan/page.js',
  'js/face-scan/worker.js',
  'js/face-scan/vision.js',
  // Assistente: offline ele cai no modo básico (busca por palavras-chave)
  'js/chatbot.js',
  'css/chatbot.css',
  'data/chatbot.json'
];

const scopeUrl = (path) => new URL(path, self.registration.scope).href;
const IMMUTABLE_URLS = new Set(IMMUTABLE.map(scopeUrl));
const SHELL_URLS = new Set(SHELL.map(scopeUrl));

self.addEventListener('install', (event) => {
  // Modelos ficam de fora: são baixados (e guardados) quando a pessoa usa a ferramenta.
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL.map(scopeUrl)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => k.startsWith('f4c3-sc4n-') && k !== CACHE_VERSION)
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function cacheFirst(request, key) {
  const cache = await caches.open(CACHE_VERSION);
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(key, res.clone());
  return res;
}

async function networkFirst(request, key) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    // 'no-cache' revalida com o servidor: sem isso o cache HTTP (10 min no GitHub Pages)
    // devolveria um script antigo mesmo com a rede disponível.
    const res = await fetch(request, { cache: 'no-cache' });
    if (res.ok) cache.put(key, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(key);
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  url.search = ''; // css/style.css?v=4 e css/style.css são o mesmo arquivo
  const key = url.href;
  if (IMMUTABLE_URLS.has(key)) event.respondWith(cacheFirst(event.request, key));
  else if (SHELL_URLS.has(key)) event.respondWith(networkFirst(event.request, key));
});
