# onnxruntime-web 1.20.1 (só WASM)

Cópia de `onnxruntime-web@1.20.1/dist/` usada pelo F4C3 SC4N (`js/face-scan/worker.js`).
Fica no repositório para a página funcionar offline e não depender de CDN. Licença MIT (ver `LICENSE`).

| Arquivo | SHA-256 |
|---|---|
| `ort.wasm.min.js` | `e66568724f8848e57cc2a56e4bea3a5b86ce3ff81b2da11eac8ed7ab02b27bd4` |
| `ort-wasm-simd-threaded.mjs` | `745eb7c0ce6f18a6aa521971b2877babc7ffb27eecb58ab3bc6e5ef4692672e8` |
| `ort-wasm-simd-threaded.wasm` | `207d02be4591c156b0a98f024f3d58005b5b04c92274d759fb390338c63559ea` |

Para atualizar: baixe os mesmos três arquivos da nova versão em
`https://cdn.jsdelivr.net/npm/onnxruntime-web@<versão>/dist/`, atualize esta tabela,
suba `CACHE_VERSION` em `f4c3-sc4n-sw.js` e rode `tests/face-scan/parity.html`.
