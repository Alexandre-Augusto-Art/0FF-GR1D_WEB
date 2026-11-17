#!/usr/bin/env node
/* Testes da leitura de metadados do Fact Check. Uso: node tests/fact-check/media.test.js
 * Os JPEG/PNG de teste são montados aqui, byte a byte; o MP4 está em fixtures/ (gerado com ffmpeg,
 * veja o comando no fim do arquivo).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const M = require('../../js/fact-check/media-meta.js');

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log(`✓  ${name}`); }
  catch (err) { failed++; console.log(`✗  ${name}\n     ${err.message}`); }
}

/* ---------- montadores ---------- */
const ascii = s => [...Buffer.from(s + '\0', 'latin1')];
const u16 = v => [v & 255, (v >> 8) & 255];
const u32 = v => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
const be16 = v => [(v >> 8) & 255, v & 255];
const be32 = v => [(v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255];

/** Entradas: { tag, type: 2|3|4|5, value } ; type 4 com value "ptr:nome" aponta para outro IFD. */
function buildTiff(ifds, order, extraBlobs = {}) {
  const sizeOf = list => {
    let data = 0;
    for (const e of list) {
      const n = e.type === 2 ? ascii(e.value).length : e.type === 5 ? 8 * e.value.length : e.type === 3 ? 2 : 4;
      if (n > 4) data += n;
    }
    return 2 + 12 * list.length + 4 + data;
  };
  const offsets = {};
  let at = 8;
  for (const name of order) { offsets[name] = at; at += sizeOf(ifds[name]); }
  for (const [name, blob] of Object.entries(extraBlobs)) { offsets[name] = at; at += blob.length; }
  const out = [0x49, 0x49, 0x2a, 0, ...u32(8)];
  order.forEach((name, idx) => {
    const list = ifds[name];
    const base = offsets[name];
    let dataAt = base + 2 + 12 * list.length + 4;
    const entries = [], data = [];
    for (const e of list) {
      let raw, count;
      if (e.type === 2) { raw = ascii(e.value); count = raw.length; }
      else if (e.type === 3) { raw = u16(e.value); count = 1; }
      else if (e.type === 5) { raw = e.value.flatMap(([n, d]) => [...u32(n), ...u32(d)]); count = e.value.length; }
      else { raw = u32(typeof e.value === 'string' ? offsets[e.value.slice(4)] : e.value); count = 1; }
      let field;
      if (raw.length > 4) { field = u32(dataAt); data.push(...raw); dataAt += raw.length; }
      else field = [...raw, 0, 0, 0, 0].slice(0, 4);
      entries.push(...u16(e.tag), ...u16(e.type), ...u32(count), ...field);
    }
    const next = name === 'ifd0' && offsets.ifd1 ? offsets.ifd1 : 0;
    out.push(...u16(list.length), ...entries, ...u32(next), ...data);
  });
  for (const blob of Object.values(extraBlobs)) out.push(...blob);
  return out;
}

function segment(marker, bytes) { return [0xff, marker, ...be16(bytes.length + 2), ...bytes]; }

function buildJpeg({ exif, xmp, width = 640, height = 480 }) {
  const parts = [0xff, 0xd8];
  if (exif) parts.push(...segment(0xe1, [...Buffer.from('Exif\0\0', 'latin1'), ...exif]));
  if (xmp) parts.push(...segment(0xe1, [...Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'latin1'), ...Buffer.from(xmp, 'utf8')]));
  parts.push(...segment(0xc0, [8, ...be16(height), ...be16(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]));
  parts.push(0xff, 0xda, 0, 2, 0xff, 0xd9);
  return Uint8Array.from(parts);
}

function buildPng(textChunks) {
  const chunk = (type, data) => [...be32(data.length), ...Buffer.from(type, 'latin1'), ...data, 0, 0, 0, 0];
  const ihdr = [...be32(512), ...be32(768), 8, 6, 0, 0, 0];
  const parts = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk('IHDR', ihdr)];
  for (const [k, v] of Object.entries(textChunks)) parts.push(...chunk('tEXt', [...Buffer.from(k + '\0' + v, 'latin1')]));
  parts.push(...chunk('IEND', []));
  return Uint8Array.from(parts);
}

const NOW = new Date('2026-11-17T12:00:00Z');
const thumbBytes = [0xff, 0xd8, 0xff, 0xd9, 1, 2, 3, 4];

/* ---------- casos ---------- */
check('JPEG de câmera: aparelho, data, GPS e miniatura', () => {
  const exif = buildTiff({
    ifd0: [
      { tag: 0x010f, type: 2, value: 'samsung' }, { tag: 0x0110, type: 2, value: 'SM-A546E' },
      { tag: 0x0132, type: 2, value: '2023:03:10 14:22:05' },
      { tag: 0x8769, type: 4, value: 'ptr:exif' }, { tag: 0x8825, type: 4, value: 'ptr:gps' }
    ],
    exif: [{ tag: 0x9003, type: 2, value: '2023:03:10 14:22:05' }],
    gps: [
      { tag: 1, type: 2, value: 'S' }, { tag: 2, type: 5, value: [[23, 1], [33, 1], [0, 1]] },
      { tag: 3, type: 2, value: 'W' }, { tag: 4, type: 5, value: [[46, 1], [38, 1], [0, 1]] }
    ],
    ifd1: [{ tag: 0x0201, type: 4, value: 'ptr:thumb' }, { tag: 0x0202, type: 4, value: thumbBytes.length }]
  }, ['ifd0', 'exif', 'gps', 'ifd1'], { thumb: thumbBytes });
  const m = M.parseImage(buildJpeg({ exif }));
  assert.strictEqual(m.format, 'jpeg');
  assert.strictEqual(m.camera, 'samsung SM-A546E');
  assert.strictEqual(m.taken, '2023:03:10 14:22:05');
  assert.strictEqual(m.width, 640);
  assert.ok(Math.abs(m.gps.lat + 23.55) < 1e-6 && Math.abs(m.gps.lon + 46.6333) < 1e-3, JSON.stringify(m.gps));
  assert.deepStrictEqual([...m.thumbnail], thumbBytes);
  const { signals, verdict } = M.signalsFor(m, 'image', { now: NOW });
  const t = signals.map(s => s.title);
  assert.strictEqual(verdict, 'warn', t.join(' | '));
  assert.ok(t.includes('GRAVADO EM 10/03/2023'), t.join(' | '));
  assert.ok(t.includes('TEM LOCALIZAÇÃO (GPS)'));
  assert.ok(t.includes('APARELHO'));
});

check('JPEG com marca IPTC de IA no XMP vira ALERTA', () => {
  const xmp = '<x:xmpmeta><rdf:Description xmp:CreatorTool="Adobe Firefly" ' +
    'Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"/></x:xmpmeta>';
  const m = M.parseImage(buildJpeg({ xmp }));
  assert.ok(m.ai.some(a => /IPTC/.test(a)) && m.ai.includes('Adobe Firefly'), m.ai.join(' | '));
  assert.strictEqual(M.signalsFor(m, 'image', { now: NOW }).verdict, 'danger');
});

check('JPEG salvo no Photoshop pede cuidado', () => {
  const exif = buildTiff({ ifd0: [{ tag: 0x0131, type: 2, value: 'Adobe Photoshop 25.0 (Windows)' }] }, ['ifd0']);
  const m = M.parseImage(buildJpeg({ exif }));
  assert.strictEqual(m.editor, 'Photoshop');
  const r = M.signalsFor(m, 'image', { now: NOW });
  assert.strictEqual(r.verdict, 'warn');
  assert.ok(r.signals.some(s => s.title === 'PASSOU PELO PHOTOSHOP'));
});

check('miniatura diferente é ALERTA', () => {
  const m = M.parseImage(buildJpeg({}));
  const r = M.signalsFor(m, 'image', { thumbDiff: 0.3, thumbAspect: true, now: NOW });
  assert.strictEqual(r.verdict, 'danger');
});

check('PNG com parâmetros do Stable Diffusion', () => {
  const m = M.parseImage(buildPng({ parameters: 'a cat, Steps: 30, Sampler: Euler a, CFG scale: 7' }));
  assert.strictEqual(m.format, 'png');
  assert.strictEqual(m.width, 512);
  assert.ok(m.ai.includes('Stable Diffusion'), m.ai.join(' | '));
});

check('PNG de ComfyUI (chave "prompt")', () => {
  const m = M.parseImage(buildPng({ prompt: '{"3":{"class_type":"KSampler"}}' }));
  assert.ok(m.ai.includes('ComfyUI'), m.ai.join(' | '));
});

check('imagem sem nada: explica que as redes apagam os dados', () => {
  const m = M.parseImage(buildJpeg({}));
  const r = M.signalsFor(m, 'image', { now: NOW });
  assert.strictEqual(r.verdict, 'unknown');
  assert.ok(r.signals.some(s => s.title === 'SEM DADOS ESCONDIDOS'));
});

check('PNG sem dados de câmera sugere print', () => {
  const r = M.signalsFor(M.parseImage(buildPng({})), 'image', { now: NOW });
  assert.ok(r.signals.some(s => s.title === 'PODE SER UM PRINT'));
});

check('datas EXIF', () => {
  assert.strictEqual(M.parseDate('2024:05:01 10:20:30').toISOString(), '2024-05-01T10:20:30.000Z');
  assert.strictEqual(M.parseDate('0000:00:00 00:00:00'), null);
  assert.strictEqual(M.parseDate('2026-11-16T22:01:00.000Z').getUTCDate(), 16);
});

check('lixo não quebra a leitura', () => {
  const junk = Uint8Array.from({ length: 4000 }, (_, i) => (i * 7919) & 255);
  junk[0] = 0xff; junk[1] = 0xd8;
  M.parseImage(junk);
  M.parseImage(new Uint8Array(3));
});

check('data no nome do arquivo (WhatsApp, Telegram, prints)', () => {
  const cases = [
    ['WhatsApp Image 2024-05-01 at 10.20.30.jpeg', '2024-05-01T10:20:30', 'whatsapp'],
    ['IMG-20240501-WA0012.jpg', '2024-05-01T12:00:00', 'whatsapp'],
    ['VID-20231224-WA0003.mp4', '2023-12-24T12:00:00', 'whatsapp'],
    ['photo_2025-02-03_08-09-10.jpg', '2025-02-03T08:09:10', 'telegram'],
    ['Screenshot_20260101-235959.png', '2026-01-01T23:59:59', 'print'],
    ['PXL_20240501_102030123.jpg', '2024-05-01T10:20:30', 'camera']
  ];
  for (const [name, iso, source] of cases) {
    const r = M.filenameDate(name);
    assert.ok(r, name);
    assert.strictEqual(r.date.toISOString().slice(0, 19), iso, name);
    assert.strictEqual(r.source, source, name);
  }
  assert.strictEqual(M.filenameDate('foto.jpg'), null);
  assert.strictEqual(M.filenameDate('IMG-20240231-WA0001.jpg'), null);
  const r = M.signalsFor(M.parseImage(buildJpeg({})), 'image', { now: NOW, nameDate: M.filenameDate('IMG-20240501-WA0012.jpg') });
  assert.strictEqual(r.verdict, 'warn');
  assert.ok(r.signals.some(s => s.title === 'NOME DO ARQUIVO: 01/05/2024'), r.signals.map(s => s.title).join(' | '));
});

const MP4 = path.join(__dirname, 'fixtures', 'meta.mp4');
check('MP4: data de criação, duração, programa e GPS', () => {
  const bytes = new Uint8Array(fs.readFileSync(MP4));
  const top = M.boxes(bytes);
  const moov = top.find(b => b.type === 'moov');
  assert.ok(moov, 'sem caixa moov: ' + top.map(b => b.type).join(','));
  const m = M.parseMp4Moov(bytes.subarray(moov.start, moov.end));
  assert.ok(/^2021-06-05T/.test(m.taken), 'data: ' + m.taken);
  assert.ok(Math.abs(m.duration - 1) < 0.2, 'duração: ' + m.duration);
  assert.ok(/Lavf/.test(m.software), 'programa: ' + m.software);
  assert.ok(m.gps && Math.abs(m.gps.lat + 22.9068) < 1e-3, 'gps: ' + JSON.stringify(m.gps));
  const t = M.signalsFor(m, 'video', { now: NOW }).signals.map(s => s.title);
  assert.ok(t.includes('GRAVADO EM 05/06/2021') && t.includes('TEM LOCALIZAÇÃO (GPS)') && t.includes('PROGRAMA'), t.join(' | '));
});

console.log(`\n${passed} ok, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);

/* fixtures/meta.mp4:
 * ffmpeg -f lavfi -i color=c=black:s=64x36:d=1 -c:v libx264 -pix_fmt yuv420p \
 *   -metadata creation_time=2021-06-05T18:30:00Z -metadata location=-22.9068-043.1729/ meta.mp4
 */
