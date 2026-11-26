// Texto para a voz: o que a tela mostra ("US$ 1,5 bilhão") não é o que se lê em voz alta
// ("um vírgula cinco bilhão de dólares"). Também decide onde respirar e o tom de cada trecho.
const UN = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CT = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
const fem = (s) => s.replace(/\bum\b/g, 'uma').replace(/\bdois\b/g, 'duas').replace(/entos\b/g, 'entas');
function ate999(n) {
  if (n < 20) return UN[n];
  if (n < 100) return DZ[Math.floor(n / 10)] + (n % 10 ? ' e ' + UN[n % 10] : '');
  if (n === 100) return 'cem';
  return CT[Math.floor(n / 100)] + (n % 100 ? ' e ' + ate999(n % 100) : '');
}
function extenso(n, f = false) {
  const g = f ? fem : (s) => s;
  if (n < 1000) return g(ate999(n));
  for (const [v, s, p] of [[1e12, 'trilhão', 'trilhões'], [1e9, 'bilhão', 'bilhões'], [1e6, 'milhão', 'milhões'], [1e3, 'mil', 'mil']]) {
    if (n < v) continue;
    const q = Math.floor(n / v), r = n % v;
    const cab = v === 1e3 ? (q === 1 ? 'mil' : g(ate999(q)) + ' mil') : extenso(q) + ' ' + (q === 1 ? s : p);
    return cab + (r ? (r < 100 || (r < 1000 && r % 100 === 0) ? ' e ' : ' ') + extenso(r, f) : '');
  }
  return String(n);
}
// "1.500", "7,50", "2.3" (decimal em inglês), "18"
function numero(s, f = false) {
  const t = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) ? s.replace(/\./g, '') : s.replace('.', ',');
  const [i, d] = t.split(',');
  if (i.length > 15) return s;
  return extenso(parseInt(i, 10), f) + (d ? ' vírgula ' + (d.startsWith('0') || d.length > 2 ? [...d].map((c) => UN[+c]).join(' ') : extenso(parseInt(d, 10), f)) : '');
}
const N = '(\\d[\\d.,]*\\d|\\d)';
const ESCALA = '(?:mil(?!h)|milh(?:ão|ões)|bilh(?:ão|ões)|trilh(?:ão|ões))';
// substantivos femininos comuns depois de número ("duas mulheres", "duzentas pessoas")
const FEM = '(?:pessoas?|mulheres?|crianças?|famílias?|empresas?|vezes|horas?|semanas?|mil pessoas|vítimas?|cidades?|escolas?|contas?|câmeras?|vagas?|casas?|mortes?|meninas?|toneladas?|páginas?|reclamações|demissões|multas?|denúncias?)';

const LETRA = { A: 'á', B: 'bê', C: 'cê', D: 'dê', E: 'é', F: 'éfe', G: 'gê', H: 'agá', I: 'í', J: 'jota', K: 'cá', L: 'éle', M: 'ême', N: 'ene', O: 'ó', P: 'pê', Q: 'quê', R: 'érre', S: 'ésse', T: 'tê', U: 'ú', V: 'vê', W: 'dáblio', X: 'xis', Y: 'ípsilon', Z: 'zê' };
const letras = (s) => [...s].map((c) => LETRA[c.toUpperCase()] || c).join(' ');
// siglas que se leem como palavra; as demais siglas são soletradas
const PALAVRA = new Set('CISA NASA ONU OTAN OMS ANVISA PROCON PIX SUS ENEM IBAMA INSS FUNAI USAID UNESCO UNICEF FIFA OPEP ANATEL ANEEL SERPRO DETRAN ICE'.split(' '));
const FIXO = [
  [/\bIAs\b/g, 'inteligências artificiais'], [/\b(?:IA|I\.A\.|AI)\b/g, 'inteligência artificial'],
  [/\bapps\b/gi, 'aplicativos'], [/\bapp\b/gi, 'aplicativo'], [/\bTVs\b/g, 'tevês'], [/\bTV\b/g, 'tevê'],
  [/\bINSS\b/g, 'í ene ésse ésse'], [/\bOMS\b/g, 'ó ême ésse'], [/\bICE\b/g, 'aice'], [/\bCEOs?\b/g, 'cê í ô'], [/\bEUA\b/g, 'Estados Unidos'],
  [/\bArs Technica\b/g, 'Ars Téquinica'], [/\bRest of World\b/g, 'Rést ov Uôrld'], [/\bThe Intercept\b/g, 'Íntercept'], [/\bWired\b/g, 'Uáired'],
  [/\bBig Techs?\b/gi, 'big téc'], [/\bdata ?centers?\b/gi, 'centro de dados'], [/\bYouTube\b/g, 'Iutúbi'], [/\bGoogle\b/g, 'Gúgou'], [/\bMicrosoft\b/g, 'Máicrossoft'],
  [/\bonline\b/gi, 'onláine'], [/\bsoftwares?\b/gi, 'sóftuer'], [/\bStarlink\b/g, 'Istárlinc'], [/\bdeepfakes?\b/gi, 'dípi fêique'],
  [/\bDr\.\s/g, 'doutor '], [/\bDra\.\s/g, 'doutora '], [/\bSr\.\s/g, 'senhor '], [/\bSra\.\s/g, 'senhora '], [/\bn[º°]\s?(?=\d)/gi, 'número '], [/\bart\.\s?(?=\d)/gi, 'artigo '],
];
// "consumidor.gov.br" → "consumidor ponto góvi ponto bê érre"
const ender = (s) => s.replace(/^https?:\/\//, '').replace(/\/$/, '').split('.').map((p) => (p === 'gov' ? 'góvi' : p === 'com' ? 'com' : p === 'org' ? 'org' : p.length <= 2 ? letras(p) : p.replace(/[-/]/g, ' '))).join(' ponto ');

function falar(txt) {
  let s = String(txt);
  s = s.replace(/(?:https?:\/\/)?\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:gov|com|org|net|br)(?:\.br)?\b\/?/gi, ender);
  for (const [a, b] of FIXO) s = s.replace(a, b);
  // dinheiro
  s = s.replace(new RegExp(`(US\\$|R\\$|€|£|\\$)\\s?${N}(\\s+${ESCALA})?`, 'g'), (_, m, n, u) => {
    const [um, pl, ce] = m === 'R$' ? ['real', 'reais', 'centavos'] : m === '€' ? ['euro', 'euros', 'centavos'] : m === '£' ? ['libra', 'libras', 'centavos'] : ['dólar', 'dólares', 'centavos'];
    if (u) return `${numero(n)}${u}${/mil$/.test(u) ? '' : ' de'} ${pl}`;
    const c = n.match(/^([\d.]+),(\d\d)$/);
    if (c) { const i = parseInt(c[1].replace(/\./g, ''), 10), ct = parseInt(c[2], 10); return [i ? `${extenso(i)} ${i === 1 ? um : pl}` : '', ct ? `${extenso(ct)} ${ct === 1 ? 'centavo' : ce}` : ''].filter(Boolean).join(' e '); }
    return `${numero(n)} ${n === '1' ? um : pl}`;
  });
  s = s.replace(new RegExp(`${N}\\s?°\\s?C\\b`, 'g'), (_, n) => `${numero(n)} ${/^1(,|\.|$)/.test(n) ? 'grau' : 'graus'}`)
    .replace(new RegExp(`${N}\\s?%`, 'g'), (_, n) => `${numero(n)} por cento`)
    .replace(/\b(\d{1,2})h(\d{2})\b/g, (_, a, b) => `${extenso(+a, true)} e ${extenso(+b)}`).replace(/\b(\d{1,2})h\b/g, (_, a) => `${extenso(+a, true)} horas`)
    .replace(/\b(\d+)[º]/g, (_, a) => ['', 'primeiro', 'segundo', 'terceiro', 'quarto', 'quinto', 'sexto', 'sétimo', 'oitavo', 'nono', 'décimo'][+a] || extenso(+a))
    .replace(/\b(\d+)ª/g, (_, a) => ['', 'primeira', 'segunda', 'terceira', 'quarta', 'quinta', 'sexta', 'sétima', 'oitava', 'nona', 'décima'][+a] || extenso(+a))
    .replace(new RegExp(`\\b${N}(?=\\s+${FEM}\\b)`, 'gi'), (_, n) => numero(n, true))
    .replace(new RegExp(`(?<![\\p{L}\\d])${N}(?![\\p{L}\\d])`, 'gu'), (_, n) => numero(n));
  // siglas: 2 a 5 maiúsculas seguidas
  s = s.replace(/(?<![\p{L}\d])[A-Z]{2,5}(?![\p{L}\d])/gu, (w) => (PALAVRA.has(w) ? w.charAt(0) + w.slice(1).toLowerCase() : letras(w)));
  // sinais que a voz não entende viram pausa de vírgula; ponto no meio da frase não fica
  s = s.replace(/["“”‘’«»*_#]/g, '').replace(/\s*[([]\s*/g, ', ').replace(/\s*[)\]]\s*/g, ', ').replace(/\s*(?:—|–|;|:|\s-\s)\s*/g, ', ')
    .replace(/\s*&\s*/g, ' e ').replace(/\s*\/\s*/g, ' ou ').replace(/\+/g, ' mais ').replace(/…/g, '...')
    .replace(/\s+,/g, ',').replace(/,(?:\s*,)+/g, ',').replace(/,\s*([.!?])/g, '$1').replace(/^\s*,\s*/, '').replace(/([!?])[.!?]+/g, '$1').replace(/\s+/g, ' ').trim();
  // verbo no infinitivo + "é": sem a pausa a voz engole o "é" ("Resistir a sua única opção")
  s = s.replace(/^(\p{Lu}\p{Ll}+(?:ar|er|ir|or)) é /u, '$1, é ');
  if (!/[.!?]$/.test(s)) s += '.';
  return s;
}

// junta "Dá para X. Ou dá para Y." numa frase só: separadas, soam como duas afirmações soltas
const juntarOu = (fala) => String(fala).replace(/[.!]\s+Ou\s+(?=d[áa]\s+(?:para|pra)\b)/g, ', ou ');

// silêncio (s) depois da última frase de cada batida e tom (0 = frio, 1 = exaltado)
const PAUSA = { abertura: 0.6, chamado: 0.5, acusacao: 0.6, promessa: 0.4, prova: 0.45, rosto: 0.5, leitura: 0.6, faca: 0.6, escolha: 0.75, assinatura: 0.3 };
const TOM = { abertura: 0.75, chamado: 0.6, acusacao: 0.9, promessa: 0.35, prova: 0.5, rosto: 0.55, leitura: 0.9, faca: 0.85, escolha: 0.6, assinatura: 0.5 };
// velocidade de cada trecho (1 = normal)
const RITMO = { abertura: 1, chamado: 1.02, acusacao: 1.04, promessa: 1, prova: 1.02, rosto: 0.97, leitura: 0.96, faca: 0.95, escolha: 1.02, assinatura: 0.93 };

// tempo de cada palavra mostrada, a partir das palavras que o Whisper ouviu: as iguais são âncoras,
// as outras ("R$ 500" x "quinhentos reais") se espalham entre elas pelo tamanho
const chave = (w) => w.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
function alinhar(mostradas, ouvidas, ini, fim) {
  const a = mostradas.map(chave), b = ouvidas.map((o) => chave(o.w)), n = a.length, m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Int16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] && a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const t = new Array(n).fill(null);
  for (let i = 0, j = 0; i < n && j < m;) { if (a[i] && a[i] === b[j]) { t[i++] = ouvidas[j++].ini; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++; }
  if (n && t[0] === null) t[0] = ini;
  const peso = a.map((w) => w.length + 2);
  for (let i = 0; i < n;) {
    let k = i + 1;
    while (k < n && t[k] === null) k++;
    const t0 = t[i], t1 = k < n ? t[k] : fim, tot = peso.slice(i, k).reduce((x, y) => x + y, 0);
    let ac = 0;
    for (let q = i; q < k; q++) { if (q > i) t[q] = t0 + (t1 - t0) * ac / tot; ac += peso[q]; }
    i = k;
  }
  return mostradas.map((w, i) => ({ w, ini: t[i], fim: i + 1 < n ? t[i + 1] : fim }));
}

module.exports = { falar, juntarOu, alinhar, PAUSA, TOM, RITMO };

if (require.main === module) process.argv.slice(2).forEach((x) => console.log(falar(x)));
