// Nó "Escrever (denúncia)" do fluxo w4k3-link.json. Fonte editável: automation/n8n/code/escrever-denuncia.js
// (rode `node automation/n8n/build-link.js` para copiar este código para dentro do fluxo).
//
// Escreve a análise como transmissão ativista: nome real de quem fez, o que fez, o que isso tira de você.
// Tom ácido e de manchete; o exagero fica no TOM, nunca no FATO. Etapas curtas no Ollama local:
//   1. dossiê: as frases da matéria vão numeradas; a IA escolhe as mais fortes e traduz (o código confere os números)
//   2. batidas: 6 falas secas + a ação (de uma lista pronta) + a assinatura fixa
//   3. checagem por código: números, nomes, fonte, acusação de crime sem apoio na matéria, frases longas,
//      frases copiadas dos exemplos ou das últimas edições
//   4. checagem de fatos por uma segunda leitura da IA; se algo falhar, uma reescrita
const OLLAMA = 'http://127.0.0.1:11434/api/chat';
const MODELO = 'gemma4:26b-a4b-it-qat';   // MoE: no processador escreve ~3x mais rápido que o qwen2.5:14b
const ASSINATURA = 'Agora você sabe a verdade. Resistir é sua única opção.';
// abertura de transmissão clandestina (fixa, sorteada pelo título): chama a atenção sem afirmar nada sobre ninguém
const ABERTURAS = ['Interrompemos a sua programação.', 'Atenção, cidadãos conectados.', 'Isto é uma transmissão do W4K3.', 'Acorda. Isso é com você.', 'Olha bem para a sua tela.', 'Larga o feed um minuto.'];
// insinuação de conspiração só vale se a própria notícia disser (sigilo, acordo escondido, plano...)
// Lei de Acesso à Informação: só para órgão público brasileiro
const PUBLICO_BR = /prefeitur|governo (federal|do estado|estadual|lula|bolsonaro|de sao paulo|do rio)|ministerio|secretaria|camara (dos deputados|municipal)|senado federal|assembleia legislativa|policia (militar|civil|federal)|tribunal|municipio|anvisa|ibama|inss|\bsus\b|petrobras|correios|caixa economica|banco do brasil|serpro|dataprev|detran/;
const INSINUA = [
  [/plano secreto|secretamente|em segredo|\bsecret/, /secret|sigil|confidenc|em segredo|vazad/], [/escond|acobert|abafa/, /escond|ocult|acobert|abaf|omit/],
  [/combinad|conchav|conluio|mancomun/, /acordo|combin|conluio|cartel/], [/te vigia[mr]? 24|vigiam tudo|sabem tudo sobre voce/, /vigil|monitor|rastre|espion/],
  // estas nunca valem: afirmam uma intenção que nenhuma notícia sustenta sozinha
  [/nao e coincid|coincidencia|querem (te|nos|voce) controlar|controle total|nova ordem|elite global|conspira/, /(?!)/],
  // "é azar? pensa de novo" afirma que há uma causa por trás: só se a matéria ligar os fatos (aí reescreva sem a pergunta)
  [/\b(so |por )?(azar|acaso|sorte)\b[^.?!]*[?!.]\s*(pensa|repara|olha) de novo|nao (foi|e) (por )?(azar|acaso|sorte)/, /(?!)/],
];
const helpers = this.helpers;

const n = $input.first().json;
const req = $('Extrair link').first().json.data || {};
const news = n.mainNews;
const fonte = String(news.source || '').replace(/\s*\(.*\)\s*$/, '').trim();
const corpo = String(n.fullText || news.summary || '').replace(/\s+/g, ' ').slice(0, 9000);
const direcao = String(req.direction || '').trim();
// o que veio de um reel não é fonte: só o pedido escrito pelo autor libera nomes e números
const doAutor = /^Tema vindo de reels/.test(direcao) ? (direcao.split('Pedido do editor:')[1] || '') : direcao;
const ajuste = String(req.feedback || '').trim();
const anterior = (req.previousDraft && req.previousDraft.reflection) || null;
const publicados = Array.isArray(req.examples) ? req.examples.slice(0, 3) : [];

const semAcento = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const raizes = (t) => new Set((semAcento(t).match(/[a-z0-9]{4,}/g) || []).map((w) => w.slice(0, 5)));
const palavras = (t) => String(t || '').split(/\s+/).filter(Boolean);
const limpo = (t) => String(t || '').replace(/\s+/g, ' ').replace(/ ?,(?=\p{L})/gu, ', ').trim();
const minus = (t) => { const s = limpo(t).replace(/[.!]+$/, ''); return s.charAt(0).toLowerCase() + s.slice(1); };
const fim = (t) => { const s = limpo(t); return !s || /[.!?…]$/.test(s) ? s : s + '.'; };
const lista = (xs) => (Array.isArray(xs) ? xs : []).map((x) => '- ' + x).join('\n');
const frasesDe = (t) => limpo(t).split(/(?<=[.!?…])\s+/).filter(Boolean);

// ---------- o que dá para fazer (pronto, para a IA não inventar lei, site nem telefone) ----------
const ACOES = {
  permissoes: ['abrir o celular e cortar as permissões desse aplicativo hoje', 'apps, celular, câmera, microfone, localização'],
  dados: ['exigir, pela Lei Geral de Proteção de Dados, tudo o que a empresa sabe sobre você', 'dados pessoais, perfis, vazamento, IA treinada com dados'],
  apagar: ['apagar a conta e mandar excluir os seus dados', 'redes sociais, plataformas'],
  consumidor: ['registrar no consumidor.gov.br quando fizerem o mesmo com você', 'cobrança, produto, serviço, assinatura, banco'],
  trabalho: ['denunciar ao Ministério Público do Trabalho quando fizerem o mesmo com você', 'trabalho, demissão, salário, aplicativos de entrega, plataformas'],
  voto: ['guardar esses nomes e cobrar na urna', 'leis, governo, eleições, regulação, congresso'],
  transparencia: ['pedir os documentos pela Lei de Acesso à Informação', 'governo, polícia, câmeras, contratos públicos, licitação'],
  livre: ['trocar pelo programa livre e levar mais gente junto', 'software, sistema, monopólio, nuvem, assinatura'],
  escola: ['perguntar na escola quem guarda os dados das crianças', 'crianças, adolescentes, escola, educação'],
  organizar: ['se juntar a quem já está lutando contra isso na sua cidade', 'moradia, ambiente, data center, guerra, desigualdade, saúde'],
  cumplices: ['descobrir quem compra dessa empresa e cobrar em público', 'empresa que vende vigilância, armas ou tecnologia para governos, polícia, exército ou outras empresas'],
  espalhar: ['mandar isso para quem ainda acha que é de graça', 'qualquer assunto'],
};

// crime e má-fé: só entram se a matéria disser (raiz em português → raízes que precisam estar na matéria)
const CRIMES = [
  [/\broub\w+|\bfurt\w+/, /roub|furt|steal|stole|theft|robb/], [/\bfraud\w+/, /fraud/], [/\bgolp\w+/, /golp|scam|coup|fraud/],
  [/\bcorrup\w+|\bsuborn\w+|\bpropina\w*/, /corrup|suborn|propina|brib/], [/\bcrim\w+/, /crim|indict|felon|illegal/],
  [/\bilega\w+/, /ilega|illegal|unlawful|violat|viola/], [/\bassassin\w+|\bmatou\b|\bmatam\b|\bmata\b|\bmatar\b/, /assassin|mat(ou|ar|a|am)\b|mort|kill|murder|death|dead|died/],
  [/\bment(iu|e|em|ir|ira|iram|irou)\w*/, /ment(iu|ir|ira)|lied|lying|\blie|false|mislead|engan|decept/], [/\bchantag\w+|\bextor\w+/, /chantag|extor|blackmail/],
  [/\bespion\w+/, /espion|\bspy|spie|surveil|vigil|monitor|track|rastre/], [/\bescrav\w+/, /escrav|slave|forced lab/],
  [/\btortur\w+/, /tortur/], [/\bestupr\w+|\babus\w+/, /estupr|abus|rape|assault/], [/\bsequestr\w+/, /sequestr|kidnap|abduct|ransom/],
  [/\blavagem\b/, /lavagem|launder/], [/\bmanipul\w+/, /manipul|influenc|persua|rig/], [/\bcensur\w+/, /censur|censor|block|ban|remov|bloque|suspen/],
];
const RESSALVA = /acusad|acusa[cç][aã]o|acusam|suspeit|processad|\bprocesso\b|investig|denunci|julgad|condenad|\br[eé]u\b/i;
const FICCAO = /arasaka|night city|cyberpunk|watch ?dogs|\bctos\b|\bblume\b|dedsec|soulkiller|silverhand|panem|jogos vorazes|norsefire|blade runner|tyrell|black mirror|mr\.? robot|minority report|orwell|grande irm[aã]o|\bmatrix\b|distopi|fic[cç][aã]o/i;
const ENROLACAO = ['é importante', 'vale ressaltar', 'vale lembrar', 'nesse contexto', 'neste contexto', 'no âmbito', 'ecossistema', 'stakeholder', 'de certa forma', 'nos faz refletir', 'faz pensar', 'por outro lado', 'além disso', 'talvez', 'é preciso', 'desafios', 'erário', 'mitigar', 'obscurec', 'impacto significativo', 'cenário atual', 'levanta questões', 'levanta preocupações'];

const CENA_DO_LADO = { chamado: 'mascara', acusacao: 'marca', promessa: 'comercial', prova: 'manchete', rosto: 'multidao', leitura: 'mascara', faca: 'cartela', escolha: 'portas', assinatura: 'assinatura' };
// a metáfora do "rosto" sai das palavras da própria batida (a primeira que combinar)
const METAFORAS = [
  [/rosto|camera|vigi|espi|rastre|localiza|reconhec|policia|filma/, 'vigilancia'], [/contrato|termos|assin|aceit|permiss/, 'contrato'],
  [/morr|mort|matou|doenc|cancer|hospital|saude|suicid/, 'lapide'], [/voto|vota|eleic|lei\b|deputad|senad|govern|president|manipul/, 'fantoche'],
  [/salari|demit|demiss|empreg|trabalh|hora|motorista|entregador|vendid|venda/, 'leilao'], [/celular|aplicativo|\bapp|rede social|feed|video|tela|internet|dados|mensagen/, 'olhocelular'],
  [/apag|sistema|pane|hack|virus|golpe|senha|fora do ar/, 'janelas'], [/pag|cobr|preco|dinheiro|dolar|real\b|reais|conta|lucr|bilh|milh/, 'dinheiro'],
];
const LADOS = ['chamado', 'acusacao', 'promessa', 'prova', 'rosto', 'leitura', 'faca'];

// exemplos fixos, sobre casos conhecidos: ensinam o JEITO (o código barra qualquer frase copiada daqui)
const EXEMPLOS = [
  {
    titulo: 'O Facebook deixou levarem 87 milhões de vidas',
    chamado: 'Você já respondeu um teste bobo de personalidade na internet? Então escuta.',
    acusacao: 'O Facebook abriu a porta da sua casa e deixou levarem a sua vida.',
    promessa: 'O discurso era lindo: aproximar você das pessoas que ama.',
    prova: 'Segundo o Guardian, dados de até 87 milhões de pessoas foram parar na Cambridge Analytica. Para fazer campanha política.',
    rosto: 'Seus medos, seus likes, suas brigas de família. Tudo virou propaganda feita sob medida para você.',
    leitura: 'Para nós, isso tem nome: quem vende o seu medo para uma campanha também está votando no seu lugar.',
    faca: 'Você nunca pagou pelo Facebook. Você era o pagamento.',
    esperar: 'acreditar no próximo pedido de desculpas',
  },
  {
    titulo: 'A Clearview engoliu 3 bilhões de rostos',
    chamado: 'Você já postou uma foto sorrindo? Seu rosto já tem dono.',
    acusacao: 'A Clearview AI arrancou a sua cara da internet e botou para vender.',
    promessa: 'A desculpa é sempre a mesma: é para a sua segurança.',
    prova: 'Segundo o New York Times, ela juntou mais de 3 bilhões de fotos de sites como o Facebook. Sem perguntar a ninguém.',
    rosto: 'A foto do aniversário do seu filho agora pode aparecer na tela de um policial.',
    leitura: 'Sejamos claros: quem guarda o seu rosto sem pedir já decidiu que você é suspeito.',
    faca: 'Você posou para a família. Saiu na ficha da polícia.',
    esperar: 'torcer para o computador nunca confundir você com outro',
  },
  {
    titulo: 'Amazon: nem banheiro os motoristas têm',
    chamado: 'Você adora quando a encomenda chega no mesmo dia, né?',
    acusacao: 'A Amazon espreme motorista até ele não ter tempo de ir ao banheiro.',
    promessa: 'Na sua tela, o que aparece é um sorriso e a entrega grátis.',
    prova: 'Segundo a BBC, a empresa negou, voltou atrás e admitiu: tem motorista urinando em garrafa.',
    rosto: 'Gente com fome, com dor, com a bexiga estourando. E o aplicativo mandando correr.',
    leitura: 'Na prática, quem lucra com a pressa assina junto cada garrafa escondida no banco do carro.',
    faca: 'O frete era grátis para você. Alguém pagou com o corpo.',
    esperar: 'fingir que o pacote chegou sozinho',
  },
];

async function ia(sistema, pedido, maxTok, temp) {
  const r = await helpers.httpRequest({
    method: 'POST', url: OLLAMA, json: true, timeout: 1200000,
    body: {
      model: MODELO, stream: false, think: false, format: 'json',
      options: { temperature: temp, num_ctx: 8192, num_predict: maxTok },
      messages: [{ role: 'system', content: sistema }, { role: 'user', content: pedido }],
    },
  });
  const txt = (r.message && r.message.content) || '';
  try { return JSON.parse(txt); } catch (e) {
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('A IA não devolveu JSON: ' + txt.slice(0, 200));
  }
}
const SISTEMA = 'Você escreve para o W4K3 PR0T0C0L, transmissão hacker clandestina brasileira que expõe, com nome e sobrenome, o que empresas e governos fazem com as pessoas. Não é jornal neutro: é um MANIFESTO, que toma partido e diz o que os fatos significam (quem dá os meios responde pelo que é feito com eles). Tom de alerta máximo, sensacionalista e direto, como quem revela um esquema e acorda quem ouve: "eles" contra "você", ironia amarga, frases curtas como tapa. Português brasileiro falado, simples, que qualquer um entende de primeira. Nunca inventa fatos, números, nomes nem crimes. Nunca cita filmes, jogos ou livros. Responde SOMENTE com JSON válido.';

// ---------- 1. dossiê ----------
const digitos = (t) => new Set((String(t).match(/\d[\d.,]*/g) || []).map((x) => x.replace(/[.,]+$/, '').replace(/[.,]/g, '')));
const tiraZeros = (x) => x.replace(/0+$/, '');
// frases da matéria, numeradas (o título e o resumo entram como as primeiras)
const frasesMateria = [news.title, ...frasesDe(news.summary), ...frasesDe(corpo)].map(limpo).filter((f, i, a) => palavras(f).length >= 5 && f.length < 420 && a.indexOf(f) === i).slice(0, 70);
let dossie = anterior && anterior.analise && anterior.analise.alvo && Array.isArray(anterior.analise.fatos) ? anterior.analise : null;
if (!dossie || !ajuste) {
  const r = await ia(SISTEMA, `FRASES DA NOTÍCIA (fonte: ${fonte}), numeradas:
${frasesMateria.map((f, i) => `${i + 1}. ${f}`).join('\n')}
${direcao ? '\nDIRECIONAMENTO DO AUTOR (prioridade, se a notícia permitir): ' + direcao + '\n' : ''}
1) Escolha as 6 frases que mais revoltam um leitor comum: pessoa de carne e osso, criança, dinheiro exato, número chocante, abuso, contradição, ameaça. Prefira cenas concretas a frases gerais. Copie o número da frase e TRADUZA para português simples, fiel, sem somar nem mudar nada, mantendo nomes e números.
Ignore chamadas para outras matérias, propaganda e avisos do próprio site: só valem frases sobre o assunto do título.
2) Diga quem tem o poder nessa história. Use SÓ as frases acima, nada de fora.
3) "denuncia": true SÓ se a notícia mostra alguém com poder prejudicando, vigiando, explorando, enganando ou tirando direito de pessoas. Lançamento de produto, teste, dica, promoção, resultado de empresa, curiosidade ou falha sem responsável: false. Na dúvida, false. Não force um culpado.
{"denuncia": true ou false, "motivo": "até 12 palavras",
 "frases": [{"n": 12, "pt": "tradução fiel"}],
 "alvo": "nome próprio, curto, da empresa, governo ou pessoa com mais PODER e responsabilidade (ex.: Meta, Amazon, Governo Trump)",
 "fez_o_que": "o que o alvo fez, concreto, até 15 palavras",
 "situacao": "fato" se a notícia dá como certo, "acusacao" se é processo, denúncia ou suspeita, "plano" se ainda vai acontecer,
 "promessa": "o que o alvo promete, anuncia ou usa de desculpa na notícia (vazio se não disser)",
 "vitima": "quem sofre, concreto (ex.: mães, entregadores, alunos)",
 "estrago": "o que muda no bolso, no corpo, na casa ou na rotina dessas pessoas"}`, 1000, 0.15);
  const fatos = [], descartados = [], originais = [];
  for (const x of Array.isArray(r.frases) ? r.frases : []) {
    const orig = frasesMateria[Number(x && x.n) - 1], pt = limpo(x && x.pt);
    if (!orig || !pt) continue;
    const nums = digitos(orig);   // a tradução não pode ter número que a frase original não tem
    const ruim = [...digitos(pt)].some((d) => !nums.has(d) && ![...nums].some((y) => tiraZeros(y) === tiraZeros(d)));
    if (ruim) descartados.push(pt); else { fatos.push(pt); originais.push(orig); }
  }
  // notícia sem denúncia não vira acusação: na pauta, passa para a próxima candidata
  const semDenuncia = r.denuncia === false || /^(false|n[aã]o)$/i.test(String(r.denuncia));
  if (semDenuncia && req.mode === 'pauta') throw new Error(`SEM DENÚNCIA: ${news.title} (${limpo(r.motivo)})`);
  dossie = { ...r, frases: undefined, fatos, descartados, originais, sem_denuncia: semDenuncia, sem_prova: fatos.length < 2 };
  if (fatos.length < 2) dossie.fatos = [...fatos, ...frasesMateria.slice(0, 5)];
  dossie.alvo = limpo(r.alvo).split(/[,;(/]| e /)[0].trim().slice(0, 40);
}
const alvo = dossie.alvo || fonte;
// crime só vale se estiver no título, no resumo ou nas frases escolhidas (a página traz chamadas de outras matérias)
const fonteCrime = semAcento([news.title, news.summary, ...(dossie.originais || []), ...dossie.fatos].join(' ')).replace(/[^a-z0-9]+/g, ' ');
const acusacaoAberta = /acus/i.test(dossie.situacao || '');

// ---------- 2. batidas ----------
const exTxt = EXEMPLOS.map((e) => Object.entries(e).map(([k, v]) => `${k}: ${v}`).join('\n')).join('\n\n');
const pedido = `Escreva uma transmissão de 40 segundos. Quem ouve está no celular e vai embora se não levar um tapa na primeira frase.

NOTÍCIA: ${news.title} (fonte: ${fonte})
ALVO: ${alvo} — ${dossie.fez_o_que}
SITUAÇÃO: ${acusacaoAberta ? 'é ACUSAÇÃO ou processo: diga que é acusada ou processada; não dê como provado' : /plano/i.test(dossie.situacao || '') ? 'é PLANO: ainda vai acontecer; use o futuro ou "quer"' : 'fato'}
O QUE O ALVO PROMETE OU DIZ: ${dossie.promessa || '(a notícia não diz: mostre a fachada dele, sem inventar frase)'}
QUEM SOFRE: ${dossie.vitima} | ESTRAGO: ${dossie.estrago}
FATOS (os ÚNICOS que você pode usar):
${dossie.fatos.map((f, i) => `${i + 1}. ${f}`).join('\n')}
${direcao ? '\nDIRECIONAMENTO DO AUTOR (prioridade máxima): ' + direcao : ''}

ESCREVA FRASES COMPLETAS, FALADAS, com sujeito e verbo (nada de telegrama):
- "chamado" (8 a 13 palavras): alerta que acorda quem ouve, a partir de uma cena do dia a dia dela, como quem diz "você acha que é só isso? pensa de novo". Ex. de jeito: "Você acha que está só pedindo comida? Repara no que pedem de volta."
- "acusacao" (9 a 14 palavras): a revelação, em manchete de escândalo: ${alvo} + verbo + COISA CONCRETA que dá para ver (salário, casa, rosto, remédio, voo, filho, salvar o emprego) + de quem tirou. Nada de ideia abstrata ("segurança", "privacidade", "confiança").
- "promessa" (8 a 14 palavras): a história bonita que te venderam, com ironia ácida (ex.: "Te venderam conveniência. Embrulhada para presente.").
- "prova": {"fato": número do fato mais chocante, "texto": "Segundo o ${fonte}, ..." (14 a 24 palavras) contando SÓ esse fato, com pessoa e número exatos}.
- "rosto": {"fato": número de OUTRO fato, com gente comum sofrendo, "texto": 12 a 22 palavras contando SÓ esse fato: quem é, o que perdeu, quanto sobrou}. Não junte dois fatos. Não invente causa.
- "leitura" (12 a 20 palavras): a LEITURA do W4K3, o manifesto: a conclusão moral que esses fatos permitem, dita sem rodeio e como opinião nossa. Quem fornece o meio responde pelo fim: cumplicidade, consequência, o que isso faz com você. Pode começar com "Para nós,", "Na prática," ou "Sejamos claros:". A conclusão pode ser dura, mas parte dos fatos acima: não traga fato novo (lugar, vítima, número ou ataque que não está neles).
- "facas": 3 opções, cada uma {"a": "frase de 4 a 7 palavras: o que VOCÊ fez, deu ou acreditou", "b": "frase de 4 a 7 palavras: o que ELES ganharam ou o que sobrou para você"}. A "b" vira a "a" do avesso, com ironia amarga (ex.: "Você paga a mensalidade." / "Eles vendem você de brinde.").
- "esperar" (4 a 9 palavras): a saída covarde, começando com verbo no infinitivo, sem ponto final.
- "acao": a chave que combina: ${Object.entries(ACOES).map(([k, v]) => `${k} (${v[1]})`).join('; ')}
${acusacaoAberta ? '- ATENÇÃO: nada foi provado. O título, a "acusacao" e a "prova" TÊM de dizer "é acusado de", "é investigado por" ou "é processado por". Sem isso, o texto não serve.\n' : ''}- "titulos": 3 manchetes sensacionalistas (5 a 9 palavras), com ${alvo}, verbo e o detalhe mais CONCRETO e chocante dos fatos (um número, uma frase dita, quem sofre). Nada vago como "caos", "polêmica", "problema" ou "crise".
- "jaz": o que morreu nesta história, até 3 palavras, começando com "SEU" ou "SUA".
- "resumo": 1 frase para a chamada do site.

REGRAS:
- Palavra simples, frase de até 12 palavras, voz ativa. Uma criança de 12 anos entende.
- Exagere no TOM, nunca no FATO. Crime (roubo, fraude, mentira, espionagem) só se a notícia usar essa palavra.
- Não ligue dois fatos como causa e efeito, nem insinuando ("acha que foi azar? pensa de novo"), se a notícia não liga os dois.
- Cara de teoria da conspiração na FORMA, nunca no CONTEÚDO: pode usar "eles", "repara", "junta as peças", "acorda", perguntas que incomodam. Não pode dizer que algo é secreto, escondido, combinado, planejado ou "não é coincidência" se os fatos não disserem isso.
- Fale "você". Proibido: "sociedade", "usuários", "indivíduos", "impacto", "cenário".
- Números em algarismos, iguais aos da notícia (US$ 7,50; 13 anos).
- Nenhum filme, jogo, série ou livro.

EXEMPLOS DO JEITO (NUNCA reuse as frases nem os fatos):
${exTxt}

{"titulos": ["...", "...", "..."], "chamado": "...", "acusacao": "...", "promessa": "...", "prova": {"fato": 1, "texto": "..."}, "rosto": {"fato": 2, "texto": "..."}, "leitura": "...", "facas": [{"a": "...", "b": "..."}, {"a": "...", "b": "..."}, {"a": "...", "b": "..."}], "esperar": "...", "acao": "chave", "jaz": "...", "resumo": "..."}`;

const versaoDe = (o) => LADOS.map((k) => `${k}: ${o[k] || ''}`).join('\n') + `\nesperar: ${o.esperar || ''}\nacao: ${o.acao || ''}\ntitulo: ${o.titulo || ''}`;
const bruto = anterior && anterior.denuncia && anterior.denuncia.bruto;
const pedidoAjuste = ajuste
  ? `\n\n${bruto ? 'VERSÃO ANTERIOR:\n' + versaoDe(bruto) + '\n\n' : ''}AJUSTES PEDIDOS PELO AUTOR (aplique todos; mantenha o que ele não criticou; se ele pedir outra ação, use "acao": "outra" e escreva "acao_texto" começando com verbo no infinitivo):\n${ajuste}`
  : '';

// ---------- 3. checagem por código ----------
const numsFonte = digitos(news.title + ' ' + (news.summary || '') + ' ' + corpo + ' ' + doAutor + ' ' + ajuste);
function numeroOk(num, depois) {
  const d = num.replace(/[.,]+$/, '').replace(/[.,]/g, '');
  if (numsFonte.has(d)) return true;
  if (/^\s*(mil|milh|bilh|trilh)/i.test(depois)) return [...numsFonte].some((x) => tiraZeros(x) === tiraZeros(d));
  return [...numsFonte].some((x) => x === d + '00' || x + '00' === d);  // 7,5 = 7,50
}
const nomesFonte = semAcento(news.title + ' ' + corpo + ' ' + fonte + ' ' + (news.source || '') + ' ' + dossie.fatos.join(' ') + ' ' + alvo + ' ' + doAutor + ' ' + ajuste);
const LIVRES = /^(voce|segundo|brasil|brasileir\w*|estados|unidos|eua|europa|china|internet|inteligencia|artificial|lei|geral|protecao|dados|ministerio|publico|trabalho|justica|filipinas|reino|uniao|europeia|alemanha|franca|japao|india|africa|coreia|russia|ucrania|israel|quenia|venezuela|california|nova|york)$/;
const sequencias = (t, k) => { const w = semAcento(t).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean), s = []; for (let i = 0; i + k <= w.length; i++) s.push(w.slice(i, i + k).join(' ')); return s; };
const vistas = new Set([...EXEMPLOS.flatMap((e) => Object.values(e)), ...publicados.flatMap((e) => (e.batidas || []).slice(0, 6))].flatMap((t) => sequencias(t, 5)));
const fonteSeq = new Set(sequencias(dossie.fatos.join(' ') + ' ' + dossie.promessa, 5));
const fichaFonte = semAcento(fonte).split(/[^a-z0-9]+/).filter((w) => w.length > 2);
const MAX = { chamado: 15, acusacao: 15, promessa: 16, prova: 32, rosto: 30, leitura: 24, faca: 20 };
const MIN = { chamado: 6, acusacao: 7, promessa: 6, prova: 11, rosto: 9, leitura: 9, faca: 4 };

function checar(o) {
  const p = [], tudo = LADOS.map((k) => String(o[k] || '')).join(' ');
  const low = tudo.toLowerCase();
  for (const k of LADOS) {
    const t = limpo(o[k]), w = palavras(t).length;
    if (!t) { p.push(`falta a batida "${k}"`); continue; }
    if (w > MAX[k]) p.push(`"${k}" tem ${w} palavras: corte para no máximo ${MAX[k] - 3}`);
    if (w < MIN[k]) p.push(`"${k}" virou telegrama (${w} palavras): escreva uma frase completa, com pelo menos ${MIN[k] + 2}`);
    for (const f of frasesDe(t)) if (palavras(f).length > (k === 'prova' ? 27 : 17)) p.push(`"${k}" tem frase de ${palavras(f).length} palavras: quebre em duas`);
    for (const s of sequencias(t, 5)) if (vistas.has(s) && !fonteSeq.has(s)) { p.push(`"${k}" copia "${s}" de outro texto: escreva com outras palavras`); break; }
    for (const m of t.matchAll(/(?<![.!?:]\s)(?<!^)\b(\p{Lu}[\p{L}-]{3,})/gu)) {
      const w2 = semAcento(m[1]);
      if (!nomesFonte.includes(w2) && !LIVRES.test(w2) && m[1] !== m[1].toUpperCase()) p.push(`"${k}" cita "${m[1]}", que não está na notícia`);
    }
  }
  // cada crime citado (no texto, no título ou na chamada) tem de estar na matéria; em aberto, com ressalva
  for (const k of [...LADOS, 'titulo', 'resumo', 'esperar']) {
    const t = limpo(o[k]), b = semAcento(t);
    for (const [re, prova] of CRIMES) {
      const m = b.match(re);
      if (!m) continue;
      if (!prova.test(fonteCrime)) p.push(`"${k}" acusa de "${m[0]}", e a notícia não fala nisso: troque por um verbo que ela sustente`);
      else if (acusacaoAberta && k !== 'esperar' && !RESSALVA.test(t)) p.push(`"${k}": fala em "${m[0]}" como se fosse provado; diga que é acusação`);
    }
  }
  for (const m of (tudo + ' ' + (o.titulo || '')).matchAll(/\d[\d.,]*\d|\d/g)) {
    const s = tudo + ' ' + (o.titulo || '');
    if (!numeroOk(m[0], s.slice(m.index + m[0].length, m.index + m[0].length + 10))) p.push(`o número ${m[0]} não está na notícia: tire ou corrija`);
  }
  const al = semAcento(alvo).split(/\s+/).filter((w) => w.length > 2).pop() || semAcento(alvo);
  if (!semAcento(o.acusacao).includes(al)) p.push(`a "acusacao" tem de dizer o nome: ${alvo}`);
  if (!semAcento(o.titulo).includes(al)) p.push(`o título tem de ter o nome: ${alvo}`);
  if (palavras(o.titulo).length > 12) p.push('título longo: até 9 palavras');
  const vago = semAcento(o.titulo).match(/\b(caos|polemica|problema|questao|crise|situacao|assunto|coisas|confusao)\b/);
  if (vago) p.push(`título vago ("${vago[0]}"): troque pelo detalhe mais concreto dos fatos (número, frase dita, quem sofre)`);
  if (o.acao === 'transparencia' && !PUBLICO_BR.test(semAcento(alvo + ' ' + dossie.fez_o_que))) p.push('a Lei de Acesso à Informação só vale para órgão público brasileiro: escolha outra "acao"');
  if (acusacaoAberta) for (const k of ['acusacao', 'titulo', 'prova']) if (!RESSALVA.test(o[k] || '')) p.push(`"${k}": ainda não foi provado; diga que ${alvo} é acusado, investigado ou processado`);
  if (fichaFonte.length && !fichaFonte.some((w) => semAcento(o.prova).includes(w))) p.push(`a "prova" tem de citar a fonte: ${fonte}`);
  if (FICCAO.test(tudo + ' ' + (o.titulo || ''))) p.push('tire a referência de ficção: só o mundo real');
  // insinuação de conspiração (segredo, acobertamento, combinação) só se a notícia sustentar
  const insin = semAcento(tudo + ' ' + (o.titulo || '') + ' ' + (o.resumo || '') + ' ' + (o.esperar || ''));
  for (const [re, prova] of INSINUA) { const m = insin.match(re); if (m && !prova.test(fonteCrime + ' ' + semAcento(corpo))) p.push(`insinua "${m[0]}", e a notícia não sustenta isso: mantenha o tom, tire a insinuação`); }
  for (const w of ENROLACAO) if (low.includes(w)) p.push(`tire "${w}": vá direto`);
  if ((tudo.match(/voc[eê]/gi) || []).length < 2) p.push('fale com "você" em pelo menos duas batidas');
  if (frasesDe(o.faca).length < 2) p.push('a "faca" precisa de duas frases que se batem');
  if (/usu[aá]rios|indiv[ií]duos|sociedade/i.test(tudo)) p.push('troque "usuários", "indivíduos" e "sociedade" por gente de verdade (você, sua mãe, o motorista)');
  // cada frase da prova e do rosto tem de caber em UM fato: número de um com nome de outro vira notícia falsa
  const apoio = raizes(dossie.fatos.join(' ') + ' ' + dossie.estrago + ' ' + dossie.vitima + ' ' + dossie.fez_o_que);
  for (const k of ['prova', 'rosto']) for (const fr of frasesDe(o[k])) {
    if (palavras(fr).length > 3 && ![...raizes(fr)].some((r) => apoio.has(r))) p.push(`"${k}": "${fr}" não está nos fatos; tire`);
    const ds = [...digitos(fr)], nomes = [...fr.matchAll(/(?<![.!?:]\s)(?<!^)\b(\p{Lu}[\p{L}-]{3,})/gu)].map((m) => semAcento(m[1])).filter((w) => !LIVRES.test(w) && !semAcento(fonte + ' ' + (news.source || '') + ' ' + alvo).includes(w));
    if (ds.length + nomes.length < 2) continue;
    const cabeEm = dossie.fatos.some((f) => { const nums = [...digitos(f)], fs = semAcento(f); return ds.every((d) => nums.some((y) => y === d || tiraZeros(y) === tiraZeros(d))) && nomes.every((w) => fs.includes(w)); });
    if (!cabeEm) p.push(`"${k}" junta pedaços de fatos diferentes em "${fr.slice(0, 80)}": conte um fato por frase, sem ligar um ao outro`);
  }
  if (o.fatos && o.fatos.prova && o.fatos.prova === o.fatos.rosto) p.push('"rosto" tem de usar um fato diferente da "prova"');
  if (!/^[a-zà-ú]+(ar|er|ir|or)\b/i.test(limpo(o.esperar))) p.push('"esperar" começa com verbo no infinitivo (ex.: "confiar...")');
  if (palavras(o.esperar).length > 12) p.push('"esperar" longo: até 9 palavras');
  if (!ACOES[o.acao] && !(o.acao === 'outra' && o.acao_texto)) p.push(`"acao" tem de ser uma das chaves: ${Object.keys(ACOES).join(', ')}`);
  return [...new Set(p)];
}

// ---------- 4. segunda leitura: cada afirmação está na matéria? ----------
async function conferir(o) {
  try {
    const r = await ia('Você é checador de fatos, rigoroso. Responde SOMENTE com JSON válido.', `MATÉRIA (${fonte}): ${news.title}
${corpo.slice(0, 7000)}

Frases de um texto sobre essa matéria:
titulo: ${o.titulo}
${['chamado', 'acusacao', 'promessa', 'prova', 'rosto', 'leitura', 'faca'].map((k) => `${k}: ${o[k]}`).join('\n')}

Para cada frase: ela afirma algum FATO (quem fez, o quê, quanto, com quem) que a matéria NÃO diz ou contradiz? Ironia, opinião, metáfora e verbo forte não contam como erro; a "leitura" é a opinião do W4K3 e só é erro se trouxer um fato novo (lugar, vítima, número, ataque) que a matéria não tem. Trocar a pessoa, o lugar, o número, o papel (quem faz e quem sofre), dar como certo o que é suspeita ou ligar dois fatos como causa e efeito (inclusive insinuando, com "pensa de novo", "não foi azar", "por isso") quando a matéria não liga CONTA como erro.
{"erros": [{"batida": "prova", "problema": "o que está errado, até 15 palavras", "certo": "o que a matéria diz"}]}
Sem erro: {"erros": []}`, 500, 0.1);
    return (Array.isArray(r.erros) ? r.erros : []).filter((e) => e && e.batida && e.problema && !/nenhum|sem erro|correto/i.test(e.problema))
      .map((e) => `"${e.batida}": ${limpo(e.problema)}${e.certo ? ' (a notícia diz: ' + limpo(e.certo).slice(0, 160) + ')' : ''}`);
  } catch (e) { return []; }
}

// entre as 3 manchetes e as 3 facas, fica a que tem menos problemas
function escolher(o) {
  const txt = (x) => limpo(Array.isArray(x) ? x.join(' ') : x && typeof x === 'object' ? x.texto || [x.a, x.b].filter(Boolean).map(fim).join(' ') : x);
  const fatoDe = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? Number(x.fato) || 0 : 0);
  const opc = (xs, um) => [...(Array.isArray(xs) ? xs : []), um].map(txt).filter(Boolean);
  const r = { ...o, fatos: { prova: fatoDe(o.prova), rosto: fatoDe(o.rosto) } };
  for (const k of ['chamado', 'acusacao', 'promessa', 'prova', 'rosto', 'leitura', 'esperar', 'acao_texto', 'resumo', 'jaz']) r[k] = txt(o[k]);
  r.titulo = txt(o.titulo) || opc(o.titulos)[0] || ''; r.faca = txt(o.faca) || opc(o.facas)[0] || '';
  const menos = (k, xs) => xs.map((x) => [x, checar({ ...r, [k]: x }).length]).sort((a, b) => a[1] - b[1]).map((x) => x[0])[0] || '';
  r.titulo = menos('titulo', opc(o.titulos, r.titulo).map((t) => t.replace(/[.]+$/, '')));
  r.faca = menos('faca', opc(o.facas, r.faca).sort((a, b) => (frasesDe(b).length === 2) - (frasesDe(a).length === 2)));
  delete r.titulos; delete r.facas;
  return r;
}
let roteiro = escolher(await ia(SISTEMA, pedido + pedidoAjuste, 900, 0.7));
let problemas = checar(roteiro), fatosRuins = await conferir(roteiro);
for (let volta = 0; volta < 2 && (problemas.length || fatosRuins.length); volta++) {
  const novo = escolher(await ia(SISTEMA, pedido + pedidoAjuste + `\n\nSUA VERSÃO TEVE ESTES PROBLEMAS (corrija todos, mantenha o resto e devolva o JSON completo):\n${lista([...fatosRuins, ...problemas])}\n\nVERSÃO COM PROBLEMAS:\n${versaoDe(roteiro)}`, 900, 0.5));
  const p2 = checar(novo), f2 = fatosRuins.length || volta === 0 ? await conferir(novo) : [];
  if (p2.length + 2 * f2.length > problemas.length + 2 * fatosRuins.length) break;
  roteiro = novo; problemas = p2; fatosRuins = f2;
}

// ---------- rede de segurança ----------
// acusação em aberto sem ressalva não passa, nem que a IA insista: o código escreve a versão segura
if (acusacaoAberta) {
  if (!RESSALVA.test(roteiro.acusacao || '')) roteiro.acusacao = `A acusação contra ${alvo} é pesada: ${minus(dossie.fez_o_que)}.`;
  if (!RESSALVA.test(roteiro.titulo || '')) roteiro.titulo = `Sob acusação: ${roteiro.titulo}`;
  if (!RESSALVA.test(roteiro.resumo || '')) roteiro.resumo = `Sob acusação: ${minus(roteiro.resumo || dossie.fez_o_que)}`;
  problemas = checar(roteiro);
}
// crime que a matéria não sustenta sai do título e da chamada; nas batidas vira alerta que segura a publicação
for (const k of ['titulo', 'resumo', 'esperar']) if (problemas.some((x) => x.startsWith(`"${k}" acusa de`))) {
  roteiro[k] = k === 'titulo' ? `${alvo}: ${minus(dossie.fez_o_que)}` : k === 'resumo' ? roteiro.acusacao : '';
}
problemas = checar(roteiro).filter((x) => !x.startsWith('"esperar"'));

// ---------- normaliza ----------
// Lei de Acesso à Informação não serve contra empresa estrangeira: cobra quem compra dela
if (roteiro.acao === 'transparencia' && !PUBLICO_BR.test(semAcento(alvo + ' ' + dossie.fez_o_que))) roteiro.acao = /governo|estado|policia|exercito|militar|pentagon|ice\b/.test(semAcento(dossie.fez_o_que + ' ' + dossie.vitima)) ? 'cumplices' : 'espalhar';
if (['consumidor', 'espalhar'].includes(roteiro.acao) && /trabalhador|empreg|salari|entregador|motorista/.test(semAcento(dossie.vitima + ' ' + dossie.estrago))) roteiro.acao = 'trabalho';
const acaoTxt = roteiro.acao === 'outra' && roteiro.acao_texto ? minus(roteiro.acao_texto) : (ACOES[roteiro.acao] || ACOES.espalhar)[0];
const esperar = /^[a-zà-ú]+(ar|er|ir|or)\b/i.test(limpo(roteiro.esperar)) ? minus(roteiro.esperar) : 'fingir que não é com você';
// soco da batida na tela: o trecho de 2 a 4 palavras mais pesado (números, nomes, palavras longas)
const VAZIAS = new Set('a o as os de da do das dos em no na nos nas e ou que um uma para por com se seu sua ao aos é foi já mais como até sem quem isso você segundo tem era sobre nunca pelo pela pelos pelas após entre ser ter está são eles elas ele ela depois quando onde mas não só até contra disse'.split(' '));
function legendaDe(fala, ja) {
  const trechos = fala.split(/[.,;:!?—–()"]+/).map(palavras).filter((t) => t.length);
  let melhor = '', nota = -1;
  for (const ws of trechos) for (let k = 2; k <= 4; k++) for (let i = 0; i + k <= ws.length; i++) {
    const j = ws.slice(i, i + k);
    if (VAZIAS.has(j[0].toLowerCase()) && !/^(sem|seu|sua)$/i.test(j[0])) continue;
    if (VAZIAS.has(j[k - 1].toLowerCase())) continue;
    const v = j.reduce((t, w) => t + (/\d/.test(w) ? 12 : 0) + (w.length >= 5 ? Math.min(w.length, 8) : 1) - (ja.has(semAcento(w)) ? 9 : 0), 0) / k + (k === 3 ? 0.6 : 0);
    if (v > nota) { nota = v; melhor = j.join(' '); }
  }
  return (melhor || palavras(fala).slice(-3).join(' ').replace(/[.!?…]+$/, '')).toUpperCase().slice(0, 32);
}
// abertura da transmissão antes do chamado
const sorteio = [...String(roteiro.titulo || news.title)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
roteiro.chamado = ABERTURAS[sorteio % ABERTURAS.length] + ' ' + fim(roteiro.chamado);
const ja = new Set(semAcento(alvo + ' ' + fonte).split(/[^a-z0-9]+/).filter((w) => w.length > 2));
const batidas = LADOS.map((k) => {
  const fala = frasesDe(fim(roteiro[k])).map((f) => f.charAt(0).toUpperCase() + f.slice(1)).join(' ');
  const m = k === 'rosto' && METAFORAS.find(([re]) => re.test(semAcento(fala)));
  return { lado: k, fala, legenda: k === 'promessa' ? (palavras(fala).length <= 9 ? minus(fala) : legendaDe(fala, ja).toLowerCase()) : legendaDe(fala, ja), cena: m ? m[1] : CENA_DO_LADO[k] };
}).filter((x) => x.fala.length > 2);
batidas.push({ lado: 'escolha', fala: `Hora de acordar. Dá para ${esperar}. Ou dá para ${acaoTxt}.`, legenda: 'E VOCÊ?', cena: 'portas' });
batidas.push({ lado: 'assinatura', fala: ASSINATURA, legenda: '', cena: 'assinatura' });

const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fortes = new Set(['acusacao', 'leitura', 'faca', 'assinatura']);
const content = batidas.map((b) => `<p>${fortes.has(b.lado) ? '<strong>' + esc(b.fala) + '</strong>' : esc(b.fala)}</p>`).join('\n');

const avisos = [...fatosRuins.map((x) => 'CONFIRA ' + x), ...problemas];
if (dossie.sem_prova) avisos.unshift('a IA não copiou os trechos que provam os fatos: leia a notícia antes de aprovar');
if (dossie.sem_denuncia) avisos.unshift(`esta notícia não parece ter denúncia (${limpo(dossie.motivo)}): o texto pode estar forçando um culpado`);
const segurar = !!dossie.sem_denuncia || fatosRuins.length > 0 || dossie.sem_prova || acusacaoAberta || problemas.some((x) => /acusa de|não está na notícia|junta pedaços|não está nos fatos|provado|ficção|insinua/.test(x));
if (acusacaoAberta) avisos.push('a notícia trata de acusação ou processo, não de fato provado');

const today = n.today;
const origin = req.mode === 'pauta' ? 'notícia-do-dia' : 'link-enviado';
const entry = {
  id: today,
  date: today,
  news: { title: news.title || 'Notícia não disponível', link: news.link || '#', summary: news.summary || news.title || '', source: news.source || 'RSS Feed', publishedDate: news.publishedDate || today },
  reflection: {
    title: limpo(roteiro.titulo).replace(/[.]+$/, '') || `${alvo}: ${dossie.fez_o_que}`,
    content,
    excerpt: limpo(roteiro.resumo) || batidas[1].fala,
    beats: batidas,
    denuncia: { alvo, situacao: dossie.situacao || 'fato', vitima: limpo(dossie.vitima), jaz: limpo(roteiro.jaz).replace(/[".]/g, '').toUpperCase().slice(0, 26), bruto: roteiro },
    analise: dossie,
    avisos,
    segurar,   // true = não publicar sozinho às 12h: precisa de um "publicar" seu
  },
  sources: (n.allSources || []).map((s) => ({ title: s.title || 'Fonte não disponível', link: s.link || '#', source: s.source || 'RSS Feed', date: s.date || today })),
  tags: ['reflexão', 'notícia', 'antisistema', 'crítica', origin, alvo],
};
return [{ json: { newEntry: entry, date: today } }];
