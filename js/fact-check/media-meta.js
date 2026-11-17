/* DEDSEC - Fact Check: leitura de metadados de imagens e vídeos
 *
 * Lê os bytes do arquivo no próprio aparelho (nada é enviado) e tira o que interessa para checagem:
 * câmera, programa de edição, datas, GPS, miniatura embutida, Content Credentials (C2PA) e
 * marcas de imagem gerada por IA (IPTC "trainedAlgorithmicMedia", parâmetros do Stable Diffusion...).
 * Funções puras sobre Uint8Array: o navegador usa window.FactCheckMeta e os testes usam require().
 * Formatos: JPEG, PNG, WebP e MP4/MOV (só a caixa "moov").
 */
(function (root) {
  'use strict';

  const latin1 = (b, s = 0, e = b.length) => {
    let out = '';
    for (let i = s; i < e; i += 8192) out += String.fromCharCode.apply(null, b.subarray(i, Math.min(e, i + 8192)));
    return out;
  };
  const utf8 = (b, s = 0, e = b.length) => {
    try { return new TextDecoder('utf-8').decode(b.subarray(s, e)); } catch (err) { return latin1(b, s, e); }
  };
  const u16be = (b, o) => (b[o] << 8) | b[o + 1];
  const u32be = (b, o) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
  const u32le = (b, o) => b[o] + (b[o + 1] << 8) + (b[o + 2] << 16) + ((b[o + 3] << 24) >>> 0);
  const startsWith = (b, o, s) => { for (let i = 0; i < s.length; i++) if (b[o + i] !== s.charCodeAt(i)) return false; return true; };

  /* ---------- EXIF (TIFF) ---------- */
  const TAGS = {
    0x010e: 'ImageDescription', 0x010f: 'Make', 0x0110: 'Model', 0x0131: 'Software', 0x0132: 'DateTime',
    0x013b: 'Artist', 0x8298: 'Copyright', 0x9003: 'DateTimeOriginal', 0x9004: 'DateTimeDigitized',
    0x9011: 'OffsetTimeOriginal', 0xa002: 'PixelXDimension', 0xa003: 'PixelYDimension', 0xa430: 'CameraOwnerName',
    0xa433: 'LensMake', 0xa434: 'LensModel', 0x0201: 'ThumbnailOffset', 0x0202: 'ThumbnailLength'
  };
  const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

  /** @param {Uint8Array} b  bytes começando no cabeçalho TIFF ("II*\0" ou "MM\0*") */
  function parseTiff(b) {
    if (b.length < 8) return null;
    const le = b[0] === 0x49 && b[1] === 0x49;
    if (!le && !(b[0] === 0x4d && b[1] === 0x4d)) return null;
    const r16 = o => (le ? b[o] | (b[o + 1] << 8) : u16be(b, o));
    const r32 = o => (le ? u32le(b, o) : u32be(b, o));
    const out = {};

    function readValue(type, count, valOff) {
      const size = (TYPE_SIZE[type] || 1) * count;
      const at = size <= 4 ? valOff : r32(valOff);
      if (at + size > b.length) return undefined;
      if (type === 2) return latin1(b, at, at + count).replace(/\0[\s\S]*$/, '').trim();
      if (type === 3) return count === 1 ? r16(at) : Array.from({ length: count }, (_, i) => r16(at + 2 * i));
      if (type === 4) return count === 1 ? r32(at) : Array.from({ length: count }, (_, i) => r32(at + 4 * i));
      if (type === 5) {
        const v = Array.from({ length: count }, (_, i) => {
          const d = r32(at + 8 * i + 4);
          return d ? r32(at + 8 * i) / d : 0;
        });
        return count === 1 ? v[0] : v;
      }
      return undefined;
    }

    function readIfd(off, map, depth) {
      if (!off || off + 2 > b.length || depth > 3) return 0;
      const n = r16(off);
      for (let i = 0; i < n; i++) {
        const e = off + 2 + i * 12;
        if (e + 12 > b.length) break;
        const tag = r16(e), type = r16(e + 2), count = r32(e + 4);
        if (count > 1e6) continue;
        if (tag === 0x8769) { readIfd(r32(e + 8), map, depth + 1); continue; }
        if (tag === 0x8825) { out.gps = readGps(r32(e + 8)); continue; }
        const name = map[tag];
        if (name && out[name] === undefined) {
          const v = readValue(type, count, e + 8);
          if (v !== undefined && v !== '') out[name] = v;
        }
      }
      return off + 2 + n * 12 + 4 <= b.length ? r32(off + 2 + n * 12) : 0;
    }

    function readGps(off) {
      const g = {};
      if (!off || off + 2 > b.length) return null;
      const n = r16(off);
      for (let i = 0; i < n; i++) {
        const e = off + 2 + i * 12;
        if (e + 12 > b.length) break;
        const tag = r16(e), type = r16(e + 2), count = r32(e + 4);
        if (tag >= 1 && tag <= 4) g[tag] = readValue(type, count, e + 8);
      }
      const dms = v => (Array.isArray(v) && v.length === 3 ? v[0] + v[1] / 60 + v[2] / 3600 : null);
      const lat = dms(g[2]), lon = dms(g[4]);
      if (lat === null || lon === null || (lat === 0 && lon === 0)) return null;
      return { lat: g[1] === 'S' ? -lat : lat, lon: g[3] === 'W' ? -lon : lon };
    }

    const ifd1 = readIfd(r32(4), TAGS, 0);
    if (ifd1) {
      const thumb = {};
      readIfd(ifd1, { 0x0201: 'offset', 0x0202: 'length' }, 0);
      // readIfd grava em `out`; os nomes da miniatura não colidem com os da foto principal
      Object.assign(thumb, { offset: out.offset, length: out.length });
      delete out.offset; delete out.length;
      if (thumb.offset && thumb.length && thumb.offset + thumb.length <= b.length) out.thumbnail = b.subarray(thumb.offset, thumb.offset + thumb.length);
    }
    return out;
  }

  /* ---------- XMP ---------- */
  function xmpField(xmp, name) {
    const attr = xmp.match(new RegExp(name + '="([^"]*)"'));
    if (attr) return attr[1];
    const el = xmp.match(new RegExp('<' + name + '>([\\s\\S]*?)</' + name + '>'));
    if (!el) return '';
    const li = el[1].match(/<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/);
    return (li ? li[1] : el[1]).replace(/<[^>]+>/g, '').trim();
  }

  function parseXmp(xmp) {
    const f = {};
    for (const [key, name] of [['creatorTool', 'xmp:CreatorTool'], ['createDate', 'xmp:CreateDate'],
      ['modifyDate', 'xmp:ModifyDate'], ['digitalSourceType', 'Iptc4xmpExt:DigitalSourceType'],
      ['history', 'stEvt:softwareAgent'], ['credit', 'photoshop:Credit'], ['creator', 'dc:creator']]) {
      const v = xmpField(xmp, name);
      if (v) f[key] = v;
    }
    return f;
  }

  /* ---------- formatos ---------- */
  function parseJpeg(b, out) {
    let o = 2;
    while (o + 4 <= b.length) {
      if (b[o] !== 0xff) { o++; continue; }
      const m = b[o + 1];
      if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01 || m === 0xff) { o += m === 0xff ? 1 : 2; continue; }
      if (m === 0xda || m === 0xd9) break; // começo da imagem: acabaram os metadados
      const len = u16be(b, o + 2);
      const s = o + 4, e = Math.min(b.length, o + 2 + len);
      if (m === 0xe1 && startsWith(b, s, 'Exif\0\0')) out.exif = parseTiff(b.subarray(s + 6, e));
      else if (m === 0xe1 && startsWith(b, s, 'http://ns.adobe.com/xap/1.0/\0')) out.xmp = (out.xmp || '') + utf8(b, s + 29, e);
      else if (m === 0xeb && startsWith(b, s, 'JP')) out.c2paBytes.push(b.subarray(s, e));
      else if (m === 0xed) out.meta.push(latin1(b, s, e)); // Photoshop IRB / IPTC
      else if (m === 0xfe) out.comment = latin1(b, s, e).replace(/\0+$/, '');
      else if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc && !out.height) {
        out.height = u16be(b, s + 1); out.width = u16be(b, s + 3);
      }
      o += 2 + len;
    }
  }

  function parsePng(b, out) {
    let o = 8;
    while (o + 12 <= b.length) {
      const len = u32be(b, o);
      const type = latin1(b, o + 4, o + 8);
      const s = o + 8, e = Math.min(b.length, s + len);
      if (type === 'IHDR') { out.width = u32be(b, s); out.height = u32be(b, s + 4); }
      else if (type === 'tEXt') {
        const z = b.indexOf(0, s);
        if (z > 0 && z < e) out.text[latin1(b, s, z)] = latin1(b, z + 1, e);
      } else if (type === 'iTXt') {
        const z = b.indexOf(0, s);
        if (z > 0 && z < e) {
          const key = latin1(b, s, z);
          const compressed = b[z + 1] === 1;
          let p = z + 3;
          p = b.indexOf(0, p) + 1; // idioma
          p = b.indexOf(0, p) + 1; // palavra-chave traduzida
          const val = compressed ? '(comprimido)' : utf8(b, p, e);
          if (key === 'XML:com.adobe.xmp') out.xmp = (out.xmp || '') + val;
          else out.text[key] = val;
        }
      } else if (type === 'zTXt') {
        const z = b.indexOf(0, s);
        if (z > 0 && z < e) out.text[latin1(b, s, z)] = '(comprimido)';
      } else if (type === 'eXIf') out.exif = parseTiff(b.subarray(s, e));
      else if (type === 'caBX') out.c2paBytes.push(b.subarray(s, e));
      else if (type === 'IEND') break;
      o = s + len + 4;
    }
  }

  function parseWebp(b, out) {
    let o = 12;
    while (o + 8 <= b.length) {
      const type = latin1(b, o, o + 4);
      const len = u32le(b, o + 4);
      const s = o + 8, e = Math.min(b.length, s + len);
      if (type === 'VP8X') { out.width = 1 + (b[s + 4] | (b[s + 5] << 8) | (b[s + 6] << 16)); out.height = 1 + (b[s + 7] | (b[s + 8] << 8) | (b[s + 9] << 16)); }
      else if (type === 'VP8 ' && !out.width) { out.width = (b[s + 6] | (b[s + 7] << 8)) & 0x3fff; out.height = (b[s + 8] | (b[s + 9] << 8)) & 0x3fff; }
      else if (type === 'VP8L' && !out.width) {
        const bits = u32le(b, s + 1);
        out.width = (bits & 0x3fff) + 1; out.height = ((bits >> 14) & 0x3fff) + 1;
      } else if (type === 'EXIF') {
        const t = startsWith(b, s, 'Exif\0\0') ? s + 6 : s;
        out.exif = parseTiff(b.subarray(t, e));
      } else if (type === 'XMP ') out.xmp = (out.xmp || '') + utf8(b, s, e);
      else if (type === 'C2PA') out.c2paBytes.push(b.subarray(s, e));
      o = s + len + (len & 1);
    }
  }

  function detectFormat(b) {
    if (b[0] === 0xff && b[1] === 0xd8) return 'jpeg';
    if (startsWith(b, 0, '\x89PNG')) return 'png';
    if (startsWith(b, 0, 'RIFF') && startsWith(b, 8, 'WEBP')) return 'webp';
    if (startsWith(b, 4, 'ftyp')) {
      const brand = latin1(b, 8, 12);
      return /^(heic|heix|mif1|msf1|hevc|avif)/.test(brand) ? 'heic' : 'mp4';
    }
    if (startsWith(b, 0, 'GIF8')) return 'gif';
    return 'desconhecido';
  }

  /* ---------- marcas de IA e de edição ---------- */
  const AI_PATTERNS = [
    [/trainedAlgorithmicMedia/i, 'marca oficial IPTC de mídia gerada por IA'],
    [/compositeWithTrainedAlgorithmicMedia/i, 'marca IPTC de montagem com partes geradas por IA'],
    [/DALL[·\-\s]?E|OpenAI|ChatGPT|GPT-4o|Sora/i, 'OpenAI (DALL·E / ChatGPT / Sora)'],
    [/Midjourney/i, 'Midjourney'],
    [/Stable ?Diffusion|sd-metadata|Steps: \d+.*Sampler/i, 'Stable Diffusion'],
    [/ComfyUI|"class_type"/i, 'ComfyUI'],
    [/Adobe Firefly|Firefly/i, 'Adobe Firefly'],
    [/Imagen|Gemini|SynthID|Google AI|Nano ?Banana/i, 'Google (Imagen / Gemini)'],
    [/Bing Image Creator|Microsoft Designer|Copilot Designer/i, 'Microsoft (Bing / Designer)'],
    [/Meta AI|Imagine with Meta/i, 'Meta AI'],
    [/Grok|Aurora by xAI|xAI/i, 'Grok (xAI)'],
    [/Leonardo\.Ai|Ideogram|NovelAI|InvokeAI|Flux\.1|FLUX\.1|Black Forest Labs|Runway|Kling|Pika|Hailuo|Luma Dream/i, 'gerador de imagem ou vídeo por IA']
  ];
  const EDITORS = /Photoshop|Lightroom|GIMP|Affinity|Pixelmator|Snapseed|PicsArt|Canva|Meitu|FaceApp|Facetune|CapCut|InShot|Remini|Paint\.NET|Fotor|VSCO|Premiere|After Effects|DaVinci|Final Cut/i;

  function summarize(out) {
    const e = out.exif || {};
    const text = [out.xmp || '', out.comment || '', ...out.meta, ...Object.entries(out.text).map(([k, v]) => k + ': ' + v),
      ...out.c2paBytes.map(c => latin1(c, 0, Math.min(c.length, 200000))), e.Software || '', e.ImageDescription || '', out.encoder || ''].join('\n');
    const ai = [];
    for (const [re, label] of AI_PATTERNS) if (re.test(text) && !ai.includes(label)) ai.push(label);
    const sdKeys = Object.keys(out.text).filter(k => /^(parameters|prompt|workflow|Dream|sd-metadata|invokeai_metadata|negative_prompt)$/i.test(k));
    if (sdKeys.length && !ai.includes('Stable Diffusion') && !ai.includes('ComfyUI')) ai.push('parâmetros de gerador de imagem (' + sdKeys.join(', ') + ')');
    const c2pa = out.c2paBytes.length > 0 || /c2pa|contentauth/i.test(out.xmp || '');
    const editorMatch = text.match(EDITORS);
    const xmp = out.xmp ? parseXmp(out.xmp) : {};
    return {
      format: out.format,
      width: out.width || e.PixelXDimension || null,
      height: out.height || e.PixelYDimension || null,
      camera: [e.Make, e.Model].filter(Boolean).join(' ').replace(/^(\S+) \1/i, '$1') || null,
      software: e.Software || xmp.creatorTool || out.encoder || null,
      editor: editorMatch ? editorMatch[0] : null,
      taken: e.DateTimeOriginal || e.DateTimeDigitized || xmp.createDate || out.created || null,
      modified: e.DateTime || xmp.modifyDate || null,
      gps: (e.gps) || out.gps || null,
      author: e.Artist || e.CameraOwnerName || xmp.creator || null,
      thumbnail: e.thumbnail || null,
      hasExif: !!out.exif && Object.keys(out.exif).length > 0,
      hasXmp: !!out.xmp,
      digitalSourceType: xmp.digitalSourceType || null,
      c2pa,
      ai,
      textKeys: Object.keys(out.text),
      duration: out.duration || null,
      brand: out.brand || null
    };
  }

  /** Data "2024:05:01 10:20:30" (EXIF) ou ISO -> Date (ou null). */
  function parseDate(s) {
    if (!s) return null;
    const m = String(s).match(/^(\d{4})[:-](\d{2})[:-](\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m || m[1] === '0000') return null;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 12), +(m[5] || 0), +(m[6] || 0)));
    return isNaN(d) || d.getUTCFullYear() < 1990 ? null : d;
  }

  /** @param {Uint8Array} bytes  o arquivo inteiro (imagem) */
  function parseImage(bytes) {
    const out = { format: detectFormat(bytes), text: {}, meta: [], c2paBytes: [] };
    try {
      if (out.format === 'jpeg') parseJpeg(bytes, out);
      else if (out.format === 'png') parsePng(bytes, out);
      else if (out.format === 'webp') parseWebp(bytes, out);
      else if (out.format === 'heic') {
        // HEIC: não decodificamos as caixas; procuramos EXIF e marcas pelo texto
        const i = latin1(bytes, 0, Math.min(bytes.length, 400000));
        const x = i.indexOf('Exif\0\0');
        if (x >= 0) out.exif = parseTiff(bytes.subarray(x + 6));
        const xs = i.indexOf('<x:xmpmeta');
        if (xs >= 0) out.xmp = i.slice(xs, i.indexOf('</x:xmpmeta>', xs) + 12);
        if (/c2pa/.test(i)) out.c2paBytes.push(bytes.subarray(0, Math.min(bytes.length, 400000)));
      }
    } catch (err) { out.error = err.message; }
    return summarize(out);
  }

  /* ---------- MP4 / MOV ---------- */
  const MAC_EPOCH = Date.UTC(1904, 0, 1);

  /** Lista as caixas de um trecho: [{ type, start, size, body }] */
  function boxes(b, s = 0, e = b.length) {
    const list = [];
    let o = s;
    while (o + 8 <= e) {
      let size = u32be(b, o);
      const type = latin1(b, o + 4, o + 8);
      let head = 8;
      if (size === 1 && o + 16 <= e) { size = u32be(b, o + 8) * 4294967296 + u32be(b, o + 12); head = 16; }
      else if (size === 0) size = e - o;
      if (size < head || o + size > e) break;
      list.push({ type, start: o, size, body: o + head, end: o + size });
      o += size;
    }
    return list;
  }

  /** @param {Uint8Array} moov  bytes da caixa "moov" inteira (com cabeçalho) */
  function parseMp4Moov(moov, extra = {}) {
    const out = { format: 'mp4', text: {}, meta: [], c2paBytes: [], brand: extra.brand || null };
    const top = boxes(moov);
    const m = top.find(x => x.type === 'moov');
    if (!m) return summarize(out);
    const kids = boxes(moov, m.body, m.end);
    const mvhd = kids.find(x => x.type === 'mvhd');
    if (mvhd) {
      const v = moov[mvhd.body];
      const p = mvhd.body + 4;
      const created = v === 1 ? u32be(moov, p) * 4294967296 + u32be(moov, p + 4) : u32be(moov, p);
      const scale = v === 1 ? u32be(moov, p + 16) : u32be(moov, p + 8);
      const dur = v === 1 ? u32be(moov, p + 20) * 4294967296 + u32be(moov, p + 24) : u32be(moov, p + 12);
      if (created > 0) out.created = new Date(MAC_EPOCH + created * 1000).toISOString();
      if (scale) out.duration = dur / scale;
    }
    const all = latin1(moov, 0, Math.min(moov.length, 3000000));
    // ©too (programa que gravou), ©day (data), ©xyz (GPS) e as chaves da Apple em "mdta"
    const tag = name => {
      const i = all.indexOf(name);
      if (i < 0) return null;
      const d = all.indexOf('data', i);
      if (d < 0 || d - i > 40) {
        // formato antigo de QuickTime: tamanho(2) idioma(2) texto
        const len = (all.charCodeAt(i + 4) << 8) | all.charCodeAt(i + 5);
        return len > 0 && len < 300 ? utf8(moov, i + 8, i + 8 + len) : null;
      }
      const size = u32be(moov, d - 4);
      return size > 16 && size < 1000 ? utf8(moov, d + 12, d - 4 + size) : null;
    };
    out.encoder = tag('\xa9too') || tag('\xa9swr') || null;
    const day = tag('\xa9day');
    if (day && !out.created) out.created = day;
    const xyz = tag('\xa9xyz');
    // Chaves Apple: os valores ficam na mesma ordem das chaves em "keys"
    const keysAt = all.indexOf('mdta');
    if (keysAt >= 0) {
      const names = [...all.matchAll(/mdta(com\.apple\.quicktime\.[a-z.]+|com\.android\.[a-z.]+)/gi)].map(x => x[1]);
      const ilst = all.indexOf('ilst');
      if (ilst >= 0) {
        const vals = [...all.slice(ilst).matchAll(/data\0\0\0\x01\0\0\0\0([^\0]{1,200})/g)].map(x => x[1]);
        names.forEach((n, i) => {
          const v = vals[i];
          if (!v) return;
          const val = utf8(new Uint8Array([...v].map(c => c.charCodeAt(0))));
          if (/make$/i.test(n)) out.exifMake = val;
          else if (/model$/i.test(n)) out.exifModel = val;
          else if (/software$/i.test(n)) out.encoder = out.encoder || val;
          else if (/creationdate$/i.test(n)) out.created = val;
          else if (/location\.ISO6709$/i.test(n)) out.iso6709 = val;
        });
      }
    }
    const loc = out.iso6709 || xyz;
    const g = loc && loc.match(/([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/);
    if (g) out.gps = { lat: parseFloat(g[1]), lon: parseFloat(g[2]) };
    // "loci" (3GPP, usado pelo ffmpeg e por alguns Android): versão(4) idioma(2) nome\0 papel(1) lon lat alt (16.16)
    const li = all.indexOf('loci');
    if (!out.gps && li >= 0) {
      const z = moov.indexOf(0, li + 10);
      const p = z + 2;
      if (z > 0 && p + 8 <= moov.length) {
        const fx = o => { const v = u32be(moov, o); return (v > 0x7fffffff ? v - 4294967296 : v) / 65536; };
        const lon = fx(p), lat = fx(p + 4);
        if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat || lon)) out.gps = { lat, lon };
      }
    }
    if (out.exifMake || out.exifModel) out.exif = { Make: out.exifMake, Model: out.exifModel };
    if (/c2pa/i.test(all)) out.c2paBytes.push(moov.subarray(0, Math.min(moov.length, 200000)));
    const xs = all.indexOf('<x:xmpmeta');
    if (xs >= 0) out.xmp = all.slice(xs, all.indexOf('</x:xmpmeta>', xs) + 12);
    return summarize(out);
  }

  /**
   * Datas no nome do arquivo sobrevivem quando as redes apagam os metadados:
   * "WhatsApp Image 2024-05-01 at 10.20.30.jpeg", "IMG-20240501-WA0012.jpg", "Screenshot_20240501-102030.png",
   * "photo_2024-05-01_10-20-30.jpg" (Telegram), "PXL_20240501_102030123.jpg"...
   */
  function filenameDate(name) {
    const s = String(name || '');
    const m = s.match(/(20\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])(?:\D{1,4}([01]\d|2[0-3])[-_.]?([0-5]\d)[-_.]?([0-5]\d))?/);
    if (!m) return null;
    const date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 12), +(m[5] || 0), +(m[6] || 0)));
    if (isNaN(date) || date.getUTCDate() !== +m[3]) return null;
    const source = /WhatsApp|-WA\d/i.test(s) ? 'whatsapp' : /^(photo|video|file)_\d{4}-/i.test(s) ? 'telegram'
      : /screenshot|captura|print|screen ?shot|scr_/i.test(s) ? 'print' : 'camera';
    return { date, source, hasTime: !!m[4] };
  }

  /* ---------- sinais ---------- */
  const fmtDate = d => d.toLocaleString('pt-BR', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' });

  /**
   * @param {object} m       resultado de parseImage / parseMp4Moov
   * @param {'image'|'video'} kind
   * @param {{ thumbDiff?: number|null, thumbAspect?: boolean, now?: Date }} extra
   * @returns {{ signals: Array<{level,title,detail,map?}>, verdict: string }}
   */
  function signalsFor(m, kind, extra = {}) {
    const signals = [];
    const add = (level, title, detail, more) => signals.push(Object.assign({ level, title, detail }, more));
    const now = extra.now || new Date();
    const what = kind === 'video' ? 'o vídeo' : 'a imagem';

    if (m.ai.length) {
      const composite = m.ai.length === 1 && /montagem/.test(m.ai[0]);
      add(composite ? 'warn' : 'danger', composite ? 'PARTES FEITAS POR IA' : 'MARCA DE INTELIGÊNCIA ARTIFICIAL',
        `Os dados escondidos no arquivo dizem que ${what} passou por: ${m.ai.join('; ')}. Não é um registro real de câmera.`);
    }
    if (extra.thumbDiff != null && (extra.thumbDiff > 0.12 || extra.thumbAspect === false)) {
      add('danger', 'MINIATURA NÃO BATE COM A FOTO',
        'A câmera guarda uma miniatura da foto original dentro do arquivo. Aqui ela é diferente da foto que você vê: ' +
        'a imagem foi cortada ou alterada depois de tirada. Compare as duas abaixo.', { thumb: true });
    } else if (extra.thumbDiff != null) {
      add('ok', 'MINIATURA CONFERE', 'A miniatura guardada pela câmera é igual à foto. Não há sinal de corte ou montagem por esse lado.', { thumb: true });
    }
    if (m.editor) {
      add('warn', `PASSOU PELO ${m.editor.toUpperCase()}`,
        `${kind === 'video' ? 'O vídeo foi editado' : 'A imagem foi aberta ou salva'} no ${m.editor}. Ajustar brilho ou cortar é normal; ` +
        'veja se algo pode ter sido colocado ou tirado.');
    }
    if (m.c2pa) {
      add('info', 'TEM CONTENT CREDENTIALS',
        'O arquivo tem um selo C2PA com o histórico de quem criou e editou. Envie o arquivo no verificador oficial para ler o selo ' +
        '(o link abre o site deles; o arquivo sobe só se você escolher).', { link: { label: 'VERIFICAR SELO ↗', href: 'https://contentcredentials.org/verify' } });
    }

    const taken = parseDate(m.taken);
    const modified = parseDate(m.modified);
    if (taken) {
      const days = Math.floor((now - taken) / 86400000);
      if (days > 7) {
        add('warn', `GRAVADO EM ${fmtDate(taken).split(',')[0]}`,
          `Pelos dados do arquivo, ${what} é de ${fmtDate(taken)}, há ${days} dias. ` +
          'Se está circulando como coisa de hoje, desconfie: material antigo fora de contexto é o boato mais comum. ' +
          'A data pode estar errada se o relógio do aparelho estava errado.');
      } else {
        add('info', `GRAVADO EM ${fmtDate(taken).split(',')[0]}`, `Data registrada no arquivo: ${fmtDate(taken)}. A data pode ser alterada, mas ajuda a conferir a história.`);
      }
      if (modified && Math.abs(modified - taken) > 60000 && kind === 'image') {
        add('info', 'SALVA DE NOVO DEPOIS', `O arquivo foi gravado de novo em ${fmtDate(modified)}, depois de tirado (edição ou exportação).`);
      }
    }
    const nd = extra.nameDate;
    if (nd && !(taken && Math.abs(taken - nd.date) < 86400000 * 2)) {
      const days = Math.floor((now - nd.date) / 86400000);
      const when = nd.hasTime ? fmtDate(nd.date) : fmtDate(nd.date).split(',')[0];
      const how = { whatsapp: 'chegou ou foi salvo pelo WhatsApp', telegram: 'foi salvo pelo Telegram', print: 'é um print feito', camera: 'foi gravado ou salvo' }[nd.source];
      if (days >= 0) {
        add(days > 7 ? 'warn' : 'info', `NOME DO ARQUIVO: ${when.split(',')[0]}`,
          `Pelo nome, o arquivo ${how} em ${when}${days > 7 ? `, há ${days} dias` : ''}. Essa é a data em que chegou no aparelho, ` +
          'não necessariamente quando foi feito: se já existia antes disso, não é de hoje.');
      }
    }
    if (m.camera) add('info', 'APARELHO', `Registrado como ${m.camera}${m.software && !m.editor ? ` (programa: ${m.software})` : ''}.`);
    else if (m.software && !m.editor && !m.ai.length) {
      add('info', 'PROGRAMA', `O arquivo foi gravado por "${m.software}".` +
        (/Lavf|ffmpeg|HandBrake/i.test(m.software) ? ' Isso indica que foi convertido ou reprocessado, não que veio direto da câmera.' : ''));
    }
    if (m.gps) {
      const lat = m.gps.lat.toFixed(4), lon = m.gps.lon.toFixed(4);
      add('warn', 'TEM LOCALIZAÇÃO (GPS)',
        `O arquivo diz onde foi feito: ${lat}, ${lon}. Confira se bate com o lugar da notícia. ` +
        'Se o arquivo é seu, apague a localização antes de postar: ela mostra onde você estava.',
        { link: { label: 'VER NO MAPA ↗', href: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}` } });
    }
    if (m.author) add('info', 'AUTOR NO ARQUIVO', `O arquivo traz o nome "${m.author}". Procure esse autor: o material original costuma estar com ele.`);
    if (/screenCapture/i.test(m.digitalSourceType || '')) add('info', 'PRINT DE TELA', 'O próprio arquivo diz que é um print de tela.');

    const empty = !m.hasExif && !m.hasXmp && !m.c2pa && !m.ai.length && !m.textKeys.length && !m.camera && !taken && !m.software;
    if (empty) {
      add('info', 'SEM DADOS ESCONDIDOS',
        `${kind === 'video' ? 'O vídeo' : 'A imagem'} não traz dados de câmera, data ou programa. É o normal em arquivos que passaram pelo ` +
        'WhatsApp, Instagram, X ou por um print: as redes apagam tudo. Não prova nada, nem que é falso nem que é verdadeiro. ' +
        'Use a busca reversa abaixo para achar a primeira vez que apareceu.');
      if (m.format === 'png' && kind === 'image') {
        add('info', 'PODE SER UM PRINT', 'PNG sem dados de câmera costuma ser print de tela. Prints de posts e conversas são fáceis de forjar: procure o post original no perfil de quem supostamente publicou.');
      }
    }
    if (m.format === 'heic') add('info', 'ARQUIVO ORIGINAL DE CELULAR', 'HEIC é o formato que o iPhone grava. Arquivos assim normalmente ainda não passaram por redes sociais.');

    const rank = { danger: 2, warn: 1 };
    const top = signals.reduce((a, s) => Math.max(a, rank[s.level] || 0), 0);
    return { signals, verdict: top === 2 ? 'danger' : top === 1 ? 'warn' : 'unknown' };
  }

  const api = { parseImage, parseMp4Moov, parseTiff, parseDate, detectFormat, boxes, latin1, signalsFor, filenameDate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FactCheckMeta = api;
})(typeof window !== 'undefined' ? window : globalThis);
