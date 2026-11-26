// Ícones vetoriais da Game-icons (game-icons.net, CC BY 3.0: crédito no fim do vídeo) para cada trecho.
// O modelo de texto local (Ollama) diz em inglês o que aparece em cada fala; o código acha os candidatos pelo
// nome dos arquivos; o modelo escolhe os que melhor mostram a ideia. Nada sai deste PC.
const fs = require('fs');
const os = require('os');
const path = require('path');

const PASTA = path.join(os.homedir(), '.w4k3', 'icones');
const OLLAMA = process.env.W4K3_OLLAMA || 'http://127.0.0.1:11434';
const MODELO = process.env.W4K3_MODELO || 'gemma4:26b-a4b-it-qat';
// ícones que não servem para notícia real (fantasia, jogo, gore) ficam de fora
const FORA = /dragon|wizard|elf|orc|goblin|troll|unicorn|sword|axe|mace|dice|card-|chess|spell|magic|potion|rune|demon|vampire|zombie|ghost|skull-crack|guts|decapitat|beheaded|severed|blood|gore|pentagram|ankh|tarot|mana|sauron|lightsaber|pokecog/;
// reserva sem modelo de texto: palavras por assunto
const RESERVA = [
  [/saude|hospital|medic|remedio|paciente/, ['hospital', 'medicines', 'heart beats', 'syringe']], [/escola|educa|aluno|crianc/, ['school bag', 'book', 'child']],
  [/trabalh|emprego|salari|entregador|motorista/, ['factory', 'worker', 'delivery', 'pay money']], [/dados|servidor|nuvem|algoritm/, ['server rack', 'database', 'cloud']],
  [/inteligencia artificial|\bia\b|robo|automa/, ['robot', 'processor', 'brain']], [/policia|pres|prisao|crime|investig/, ['handcuffed', 'police', 'prison']],
  [/justica|tribunal|juiz|lei\b|multa/, ['scales', 'gavel', 'law']], [/empresa|corpora|bilionari|ceo/, ['office', 'skyscraper', 'money stack', 'suitcase']],
  [/lucro|preco|inflac|mercado/, ['chart', 'price tag', 'money stack']], [/localiz|rastre|vigi|camera|espion/, ['cctv camera', 'eye', 'radar', 'target']],
  [/hack|ataque|senha|golpe|virus/, ['hacker', 'padlock', 'computer', 'bug']], [/aluguel|moradia|casa|despejo/, ['house', 'house keys', 'eviction']],
  [/clima|petroleo|calor|carbono|polui/, ['factory', 'oil', 'thermometer', 'earth']], [/dinheiro|cobra|paga|divida|conta/, ['wallet', 'pay money', 'coins']],
  [/celular|aplicativo|\bapp|rede social|internet/, ['smartphone', 'eye', 'chat']], [/eleic|voto|governo|president/, ['ballot box', 'puppet', 'capitol']],
];

let _indice = null;
function indice() {
  if (_indice) return _indice;
  const mapa = new Map();
  if (fs.existsSync(PASTA)) {
    for (const autor of fs.readdirSync(PASTA)) {
      const dir = path.join(PASTA, autor);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.svg')) continue;
        const nome = f.slice(0, -4);
        if (FORA.test(nome) || mapa.has(nome)) continue;
        // só os que têm o fundo preto padrão (que tiramos ao copiar) e um único traço branco
        if (!fs.readFileSync(path.join(dir, f), 'utf8').includes('<path d="M0 0h512v512H0z"/>')) continue;
        mapa.set(nome, { nome, arquivo: path.join(dir, f), autor, partes: nome.split('-') });
      }
    }
  }
  return (_indice = [...mapa.values()]);
}
const sa = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const raiz = (w) => w.replace(/(ies)$/, 'y').replace(/(es|s)$/, '');
// candidatos para uma palavra: nome igual > todas as partes > parte inicial > alguma parte
function candidatos(termo, n = 8) {
  const ws = sa(termo).replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w.length > 2).map(raiz);
  if (!ws.length) return [];
  const alvo = ws.join('-');
  return indice().map((i) => {
    const ps = i.partes.map(raiz), tem = ws.filter((w) => ps.includes(w)).length;
    let nota = i.partes.join('-') === alvo || ps.join('-') === alvo ? 100 : tem === ws.length ? 50 + tem : tem ? 10 * tem : 0;
    if (nota && ps.length > ws.length) nota -= (ps.length - ws.length) * 2;
    return [i, nota];
  }).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, n).map((x) => x[0]);
}
async function chat(conteudo, ms = 150000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(OLLAMA + '/api/chat', { method: 'POST', signal: ctl.signal, body: JSON.stringify({
      model: MODELO, stream: false, think: false, format: 'json', keep_alive: '2m', options: { temperature: 0.3 },
      messages: [{ role: 'user', content: conteudo }] }) });
    return JSON.parse((await r.json()).message.content);
  } finally { clearTimeout(t); }
}

// segmentos: [{ k, fala }] → { [k]: [{ nome, arquivo, autor }] } (até 3 ícones por trecho)
async function escolher(segmentos, log = () => {}) {
  if (!indice().length || !segmentos.length) return {};
  const t0 = Date.now();
  let termos = null;
  try {
    const r = await chat('For each Portuguese sentence below, list 5 concrete things (objects, places, people, symbols) in English, 1 or 2 words each, ' +
      'that an illustrator would draw to show its meaning for ordinary people. No names of people, companies, brands or countries.\n' +
      segmentos.map((s, i) => `${i + 1}. ${s.fala}`).join('\n') + `\nAnswer JSON: {"itens": [["...", ...], ...]} with exactly ${segmentos.length} lists.`);
    if (Array.isArray(r.itens)) termos = r.itens;
  } catch (e) { log('ícones: o modelo de texto não respondeu (' + e.message + '), uso as palavras de reserva'); }
  const fila = segmentos.map((s, i) => {
    const ts = (termos && Array.isArray(termos[i]) && termos[i].length ? termos[i] : RESERVA.filter(([re]) => re.test(sa(s.fala))).flatMap(([, l]) => l)).slice(0, 6);
    const vistos = new Set(), cs = [];
    for (const t of ts.length ? ts : ['eye', 'money stack', 'crowd']) for (const c of candidatos(t, 5)) if (!vistos.has(c.nome)) { vistos.add(c.nome); cs.push(c); }
    return cs.slice(0, 16);
  });
  // o modelo escolhe entre os candidatos de cada trecho
  let escolha = null;
  if (termos) {
    try {
      const r = await chat('Pick the icons that best illustrate each Portuguese sentence for a protest video (strong, clear symbols). ' +
        'Use only names from each list; pick 1 to 3 per sentence, the best first. Pick only icons that really fit: fewer is better than a wrong one.\n' +
        segmentos.map((s, i) => `${i + 1}. "${s.fala}"\n   icons: ${fila[i].map((c) => c.nome).join(', ')}`).join('\n') +
        `\nAnswer JSON: {"escolha": [["icon-name", ...], ...]} with exactly ${segmentos.length} lists.`);
      if (Array.isArray(r.escolha)) escolha = r.escolha;
    } catch (e) { log('ícones: escolha pelo modelo falhou (' + e.message + '), uso os primeiros candidatos'); }
  }
  const usados = new Set(), res = {};
  segmentos.forEach((s, i) => {
    const porNome = new Map(fila[i].map((c) => [c.nome, c]));
    const pedidos = (escolha && Array.isArray(escolha[i]) ? escolha[i] : []).map((n) => porNome.get(String(n).trim())).filter(Boolean);
    const lista = [];
    // só o que o modelo escolheu; sem escolha, o melhor candidato pelo nome
    for (const c of pedidos.length ? pedidos : fila[i].slice(0, 1)) if (!usados.has(c.nome) && lista.length < 3) { usados.add(c.nome); lista.push(c); }
    if (lista.length) res[s.k] = lista;
  });
  log(`ícones: ${Math.round((Date.now() - t0) / 1000)} s; ` + segmentos.map((s) => (res[s.k] || []).map((c) => c.nome).join('+') || '-').join(' | '));
  return res;
}

// copia os escolhidos para a pasta do vídeo (com tamanho fixo: o Chrome precisa dele para desenhar o SVG)
function copiar(escolhidos, pastaPublica, prefixo) {
  fs.rmSync(pastaPublica, { recursive: true, force: true });
  fs.mkdirSync(pastaPublica, { recursive: true });
  const out = {}, autores = new Set();
  for (const [k, lista] of Object.entries(escolhidos)) {
    out[k] = lista.map((c) => {
      const svg = fs.readFileSync(c.arquivo, 'utf8').replace('<svg ', '<svg width="512" height="512" ').replace('<path d="M0 0h512v512H0z"/>', '');   // sem o quadrado preto do fundo
      fs.writeFileSync(path.join(pastaPublica, c.nome + '.svg'), svg);
      autores.add(c.autor);
      return prefixo + c.nome + '.svg';
    });
  }
  return { icones: out, autores: [...autores] };
}

module.exports = { escolher, copiar, indice, candidatos };

if (require.main === module) {
  const frases = process.argv.slice(2);
  escolher(frases.map((f, k) => ({ k, fala: f })), console.log).then((r) => console.log(JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, l]) => [k, l.map((c) => c.nome)])), null, 1)));
}
