// Nó "Escrever (espelho direto)" do fluxo w4k3-link.json. Fonte editável: automation/n8n/code/escrever-espelho.js
// (rode `node automation/n8n/build-link.js` para copiar este código para dentro do fluxo).
//
// Escreve a análise no formato "espelho direto": a notícia real É a coisa da ficção com outro nome.
// Fala com o Ollama local em etapas curtas (modelo local erra menos com tarefas pequenas):
//   1. mecanismo: só os fatos da matéria, quem faz o quê com quem, quem ganha, quem paga
//   2. espelho: a obra cuja engrenagem é a mesma + tabela de tradução real → ficção
//   3. batidas: falas curtas (texto do site e roteiro do vídeo)
//   4. checagem por código (números, fonte, ordem, palavras proibidas) e, se falhar, uma reescrita
const OLLAMA = 'http://127.0.0.1:11434/api/chat';
const MODELO = 'qwen2.5:14b';
const helpers = this.helpers;

const n = $input.first().json;
const req = $('Extrair link').first().json.data || {};
const news = n.mainNews;
const fonte = String(news.source || '').trim();
const corpo = String(n.fullText || news.summary || '').slice(0, 9000);
const direcao = String(req.direction || '').trim();
const ajuste = String(req.feedback || '').trim();
const anterior = (req.previousDraft && req.previousDraft.reflection) || null;
const exemplos = Array.isArray(req.examples) ? req.examples.slice(0, 3) : [];

const FICHAS = [
  { obra: 'Cyberpunk 2077', ficha: 'jogo de 2020. Night City, cidade dominada por megacorporações como a Arasaka e a Militech, acima do governo. Implantes cibernéticos (cyberware) vendidos como upgrade criam dependência e desigualdade. Ciberpsicose: quem instala implantes demais perde a ligação com a própria humanidade, e a cidade trata isso como problema individual, não do sistema que vende os implantes. Soulkiller: programa da Arasaka que copia a mente de uma pessoa num "engrama" e guarda a cópia no servidor da empresa, como propriedade dela. Johnny Silverhand, roqueiro que lutou contra a Arasaka, ficou mais de 50 anos preso como engrama; V carrega essa cópia num chip na cabeça. Trauma Team: socorro médico de elite só para quem paga assinatura.', temas: 'megacorporação acima do Estado, dados e mente como mercadoria, IA, implantes e dependência, saúde privatizada, trabalho precário' },
  { obra: 'Cyberpunk: Edgerunners', ficha: 'anime de 2022, em Night City. David Martinez, jovem pobre, perde a mãe, entra para um grupo de mercenários e instala cada vez mais implantes militares para sobreviver e subir na vida, até a ciberpsicose; as corporações lucram com cada implante e o descartam depois.', temas: 'juventude pobre, dívida, sobrevivência, implantes, descarte de pessoas, ascensão social impossível' },
  { obra: 'Watch Dogs', ficha: 'jogos de 2014 a 2020. O ctOS, sistema da corporação Blume, conecta câmeras, semáforos, celulares e os dados de todos os cidadãos. No 1, Aiden Pearce hackeia Chicago pelo ctOS. No 2, a DedSec, coletivo hacker de São Francisco, expõe o ctOS 2.0, que cria perfis preditivos das pessoas, vende esses dados e é usado para manipular eleições. No Legion, Londres vira um Estado de vigilância com drones, entregue à empresa militar privada Albion.', temas: 'vigilância, dados pessoais, perfis e algoritmos, cidade inteligente, eleições, polícia privatizada, hackers' },
  { obra: 'V de Vingança', ficha: 'HQ de Alan Moore e David Lloyd (1988) e filme (2005). Inglaterra governada pelo partido fascista Norsefire, com câmeras e escutas por toda parte, toque de recolher, listas de "indesejáveis" e mídia controlada. V, de máscara de Guy Fawkes, ataca os símbolos do regime e desperta a população: "o povo não deveria temer seu governo".', temas: 'autoritarismo, censura, mídia controlada, medo, resistência, protesto' },
  { obra: 'Jogos Vorazes', ficha: 'livros de Suzanne Collins (2008) e filmes. Em Panem, a Capital rica domina 12 distritos pobres que produzem tudo; todo ano sorteia jovens para lutarem até a morte num reality show transmitido como entretenimento, com patrocinadores. Katniss Everdeen e o tordo viram símbolos da revolta. Pão e circo.', temas: 'desigualdade, espetáculo, entretenimento que anestesia, exploração de regiões pobres, jovens, revolta' },
  { obra: 'Blade Runner', ficha: 'filme de Ridley Scott (1982), baseado em Philip K. Dick, e Blade Runner 2049 (2017). A Tyrell Corporation fabrica replicantes, humanos artificiais usados como mão de obra escrava, com prazo de validade de 4 anos; o caçador Deckard "aposenta" os que fogem. O teste Voight-Kampff mede a empatia para separar humano de máquina. No 2049, a Wallace Corporation.', temas: 'trabalho, IA e humanidade, descarte de trabalhadores, empatia, corporação dona da vida' },
  { obra: '1984', ficha: 'livro de George Orwell (1949). O Grande Irmão; teletelas que vigiam dentro das casas; o Ministério da Verdade reescreve o passado; a Polícia do Pensamento; a novilíngua encolhe o que dá para pensar.', temas: 'vigilância estatal, desinformação, reescrever a história, censura, linguagem' },
  { obra: 'Matrix', ficha: 'filme de 1999. Humanos vivem presos numa simulação enquanto as máquinas usam seus corpos como fonte de energia; a escolha entre a pílula vermelha (a verdade) e a azul (o conforto).', temas: 'realidade fabricada, telas, pessoas como recurso, despertar' },
  { obra: 'Black Mirror', ficha: 'série de 2011 em diante, episódios independentes. Em "Nosedive" as notas que as pessoas dão umas às outras decidem acesso a moradia e serviços. Em "Fifteen Million Merits" as pessoas pedalam o dia todo por créditos, cercadas de telas e anúncios.', temas: 'redes sociais, notas e reputação, trabalho por créditos, anúncios, economia da atenção' },
  { obra: 'Mr. Robot', ficha: 'série de 2015 a 2019. Elliot, hacker, e o grupo fsociety atacam a E Corp, conglomerado que ele chama de Evil Corp, para apagar as dívidas das pessoas.', temas: 'dívida, bancos, conglomerados, hackers, sistema financeiro' },
  { obra: 'Minority Report', ficha: 'filme de 2002, baseado em Philip K. Dick. A divisão Pré-Crime prende pessoas antes de cometerem crimes, com base em previsões; anúncios personalizados reconhecem as pessoas pela retina.', temas: 'policiamento preditivo, algoritmos, reconhecimento facial, publicidade personalizada' },
  { obra: 'Deus Ex', ficha: 'jogos Human Revolution (2011) e Mankind Divided (2016). Aumentos cibernéticos dependem de um remédio caro, o Neuropozyne, vendido pelas corporações; os aumentados acabam segregados num "apartheid mecânico".', temas: 'dependência de produto, remédios, segregação, corporações' },
  { obra: 'Elysium', ficha: 'filme de 2013. Os ricos vivem numa estação espacial com cura para todas as doenças; a Terra pobre é policiada por robôs.', temas: 'desigualdade, saúde, fronteiras, robôs na polícia' },
  { obra: 'Admirável Mundo Novo', ficha: 'livro de Aldous Huxley (1932). Castas fabricadas em laboratório e controle pelo prazer, pelo consumo e pela droga soma, sem precisar de violência.', temas: 'controle pelo prazer e consumo, distração, castas' },
  { obra: 'Psycho-Pass', ficha: 'anime de 2012. O Sistema Sibyl escaneia a mente das pessoas e calcula um "coeficiente criminal"; a arma Dominator decide sozinha quem é preso ou executado.', temas: 'algoritmo decide punição, pontuação de risco, polícia automatizada' },
  { obra: 'Neuromancer', ficha: 'livro de William Gibson (1984). Inventou o "ciberespaço"; o hacker Case é contratado por corporações e por uma IA (Wintermute) que agem acima dos Estados.', temas: 'IA, corporações acima dos Estados, ciberespaço' },
  { obra: 'Ghost in the Shell', ficha: 'mangá de 1989 e anime de 1995. A Major Motoko Kusanagi, ciborgue da Seção 9; cérebros ligados à rede podem ser hackeados e receber memórias falsas.', temas: 'corpo e mente na rede, memória manipulada, identidade' },
];
const PREFERIDAS = ['Cyberpunk 2077', 'Watch Dogs', 'V de Vingança', 'Jogos Vorazes', 'Blade Runner'];
const MUNDOS = {
  'Cyberpunk 2077': 'Night City', 'Cyberpunk: Edgerunners': 'Night City', 'Watch Dogs': 'a cidade do ctOS',
  'V de Vingança': 'a Inglaterra do Norsefire', 'Jogos Vorazes': 'Panem', 'Blade Runner': 'a Los Angeles da Tyrell',
  '1984': 'a Oceania do Grande Irmão', 'Matrix': 'a Matrix', 'Black Mirror': 'Black Mirror', 'Mr. Robot': 'Mr. Robot',
  'Minority Report': 'a cidade do Pré-Crime', 'Deus Ex': 'o mundo de Deus Ex', 'Elysium': 'a Terra de Elysium',
  'Admirável Mundo Novo': 'o Admirável Mundo Novo', 'Psycho-Pass': 'o Japão do Sistema Sibyl',
  'Neuromancer': 'o ciberespaço de Neuromancer', 'Ghost in the Shell': 'o mundo de Ghost in the Shell',
};
const semAcento = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
// "raízes" de 6 letras das palavras longas: comparação grosseira, mas sem dicionário
const raizes = (t) => new Set((semAcento(t).match(/[a-z0-9]{5,}/g) || []).map((w) => w.slice(0, 6)));
const CENAS = {
  apresentador: 'o apresentador mascarado do W4K3 no telejornal, com a faixa da obra (bom para abrir no mundo da ficção)',
  cidade: 'cidade neon dominada por uma torre corporativa que troca de nome entre o real e a ficção',
  obra: 'o nome da obra em letras gigantes',
  manchete: 'recorte de jornal com a manchete real e a fonte',
  plataforma: 'celular/aplicativo engolindo conteúdo e dados',
  vigilancia: 'câmeras marcando o rosto das pessoas',
  marionete: 'multidão controlada por fios',
  virada: 'frase de impacto em tela cheia, com glitch',
  pergunta: 'fechamento com a pergunta na tela',
};
const LADOS = ['ficcao', 'real', 'virada', 'chamado'];
const PROIBIDAS = ['lembra', 'remete', 'de certa forma', 'nos faz refletir', 'faz pensar', 'é como se', 'paralelo', 'analogia'];
const EXEMPLO_PADRAO = {
  titulo: 'A Arasaka já tem nome aqui: treinamento de IA',
  batidas: [
    'Em Night City, a Arasaka tem um programa chamado Soulkiller. Ele copia a sua mente, guarda num servidor e a cópia passa a ser dela.',
    'Aqui, o nome é mais bonito: treinar inteligência artificial.',
    'Seu texto, sua foto, sua voz. Copiados, guardados, transformados em produto. Sem pedir. Sem pagar.',
    'Segundo o Nexo Jornal, uma liminar contra a Meta reabriu a pergunta: de quem é o que você cria?',
    'Não é falha. É o modelo de negócio. Quanto mais você posta, mais matéria-prima você entrega.',
    'Johnny Silverhand ficou 50 anos preso num servidor da Arasaka. Quanto tempo a sua obra vai ficar presa no deles?',
  ],
};

async function ia(sistema, pedido, maxTok, temp) {
  const r = await helpers.httpRequest({
    method: 'POST', url: OLLAMA, json: true, timeout: 1200000,
    body: {
      model: MODELO, stream: false, format: 'json',
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
const SISTEMA = 'Você trabalha para o W4K3 PR0T0C0L, do coletivo 0FF-GR1D, que lê notícias reais de tecnologia e poder pelo espelho da ficção distópica. Escreve em português brasileiro. Nunca inventa fatos, números, nomes nem cenas de obras. Responde SOMENTE com JSON válido.';
const lista = (xs) => (Array.isArray(xs) ? xs : []).map((x) => '- ' + x).join('\n');
const fichaDe = (nome) => FICHAS.find((f) => f.obra.toLowerCase() === String(nome || '').toLowerCase().trim());

// ---------- 1. mecanismo ----------
let analise = anterior && anterior.analise;
if (!analise || !ajuste) {
  analise = await ia(SISTEMA, `NOTÍCIA (fonte: ${fonte})
Título: ${news.title}
Resumo: ${news.summary || ''}
Texto:
${corpo}

Extraia da notícia, em português, usando SÓ o que está escrito acima:
{"fatos": ["3 a 5 fatos curtos, cada um numa frase, com números e nomes exatamente como no texto"],
 "mecanismo": "uma frase: quem faz o quê com quem, e para quê",
 "quem_ganha": "quem ganha poder ou dinheiro com isso",
 "quem_perde": "quem perde autonomia, privacidade, renda ou direitos",
 "atores": ["empresas, governos ou pessoas citados"]}`, 700, 0.2);
}

// ---------- 2. espelho ----------
const pedeOutraObra = ajuste && (/outra (obra|refer)/i.test(ajuste) || FICHAS.some((f) => ajuste.toLowerCase().includes(f.obra.toLowerCase().split(':')[0]) && (!anterior || !anterior.espelho || f.obra !== anterior.espelho.obra)));
let espelho = anterior && anterior.espelho;
if (!espelho || pedeOutraObra || !ajuste) {
  const alvo = raizes([analise.mecanismo, analise.quem_ganha, analise.quem_perde, ...(analise.fatos || []), news.title].join(' '));
  const pedidas = FICHAS.filter((f) => semAcento(direcao + ' ' + ajuste).includes(semAcento(f.obra.split(':')[0])));
  const nota = (f) => { let k = 0; for (const r of raizes(f.temas + ' ' + f.ficha)) if (alvo.has(r)) k++; return k + (PREFERIDAS.includes(f.obra) ? 2 : 0); };
  const candidatas = [...new Set([...pedidas, ...FICHAS.slice().sort((a, b) => nota(b) - nota(a))])].slice(0, 4);
  espelho = await ia(SISTEMA, `MECANISMO DA NOTÍCIA: ${analise.mecanismo}
QUEM GANHA: ${analise.quem_ganha}
QUEM PERDE: ${analise.quem_perde}
FATOS:
${lista(analise.fatos)}
${direcao ? '\nDIRECIONAMENTO DO AUTOR (prioridade): ' + direcao : ''}${ajuste ? '\nPEDIDO DE AJUSTE DO AUTOR (prioridade): ' + ajuste : ''}

OBRAS CANDIDATAS (use só o que está escrito em cada ficha):
${candidatas.map((f) => `- ${f.obra}: ${f.ficha}`).join('\n')}

Escolha UMA destas obras cuja ENGRENAGEM seja a mesma da notícia: o mesmo tipo de poder fazendo a mesma coisa com as pessoas (não basta o tema ser parecido).
"elemento": o sistema, programa, empresa ou personagem que aparece ESCRITO na ficha e faz na obra o que acontece na notícia.
"traducao": de 2 a 4 pares; o lado "ficcao" tem de usar palavras que estão na ficha (ex.: Meta = Arasaka; treinar IA = Soulkiller).
{"obra": "nome exato da obra", "elemento": "...", "por_que": "uma frase", "traducao": [{"real": "...", "ficcao": "..."}]}`, 400, 0.3);
}
if (!fichaDe(espelho.obra)) {
  const achada = FICHAS.find((f) => semAcento(espelho.obra).includes(semAcento(f.obra.split(':')[0])));
  espelho.obra = achada ? achada.obra : 'Watch Dogs';
}
const ficha = fichaDe(espelho.obra);
espelho.mundo = MUNDOS[ficha.obra] || ficha.obra;
// o lado "ficcao" da tradução tem de estar na ficha (o modelo inventava, ex.: "células cerebrais")
const naFicha = (t) => { const ws = (semAcento(t).match(/[a-z0-9]{4,}/g) || []); const fx = semAcento(ficha.ficha + ' ' + ficha.obra); return ws.length > 0 && ws.filter((w) => fx.includes(w.slice(0, 5))).length / ws.length >= 0.5; };
espelho.traducao = (Array.isArray(espelho.traducao) ? espelho.traducao : []).filter((t) => t && t.real && t.ficcao && naFicha(t.ficcao)).slice(0, 4);
if (!naFicha(espelho.elemento || '')) espelho.elemento = espelho.traducao[0] ? espelho.traducao[0].ficcao : ficha.obra;

// ---------- 3. batidas ----------
const exs = (exemplos.length ? exemplos : [EXEMPLO_PADRAO]).map((e) => `Título: ${e.titulo}\n${lista(e.batidas)}`).join('\n\n');
const pedidoBatidas = `Escreva o roteiro do W4K3 no formato ESPELHO DIRETO: a notícia real não "lembra" a obra, ela É a coisa da obra com outro nome.

NOTÍCIA REAL (fonte: ${fonte}) — mecanismo: ${analise.mecanismo}
Quem ganha: ${analise.quem_ganha} | Quem perde: ${analise.quem_perde}
Fatos (os ÚNICOS que você pode usar):
${lista(analise.fatos)}

ESPELHO: ${ficha.obra} — ${espelho.elemento} (${espelho.mundo || ''})
Ficha da obra (os ÚNICOS detalhes da obra que você pode usar): ${ficha.ficha}
Tradução real → ficção: ${espelho.traducao.map((t) => `${t.real} = ${t.ficcao}`).join('; ')}
${direcao ? '\nDIRECIONAMENTO DO AUTOR (prioridade máxima): ' + direcao : ''}

ESCREVA EXATAMENTE 7 BATIDAS, nesta ordem. Cada batida tem de 18 a 28 palavras, em 1 a 3 frases curtas:
1. "ficcao": comece com "Em ${espelho.mundo}, ..." e apresente ${espelho.elemento} com os detalhes da ficha.
2. "ficcao": o que isso faz com as pessoas na obra e quem lucra lá (só o que está na ficha).
3. "real": a troca de nome. "Aqui, o nome é ..." ou "No nosso mundo, ... se chama ..." (use a tradução).
4. "real": o fato principal, citando a fonte: "Segundo o/a ${fonte}, ...".
5. "real": mais um fato da lista (números e nomes exatos) e quem ganha, quem paga.
6. "virada": uma frase seca, com palavras SUAS, mostrando que não é acidente, é o sistema funcionando.
7. "chamado": volte à obra citando ${espelho.elemento} ou ${espelho.mundo} pelo nome e termine com uma pergunta direta para quem assiste (ex.: "Em Night City, ninguém assinou nada. E você, assinou?").
- Fale com quem assiste ("você", "sua"). Frases curtas, de no máximo 15 palavras. Nada de introdução, jargão ou "talvez".
- Não repita frases dos exemplos: escreva frases novas para esta notícia.
- Proibido: ${PROIBIDAS.map((p) => '"' + p + '"').join(', ')}.
- Cada batida traz uma informação nova: não repita na batida 5 o fato da batida 4.
- "legenda": de 2 a 5 palavras, o soco da batida, para aparecer grande na tela. NUNCA as primeiras palavras da fala: use o nome ou a ideia mais forte (ex.: "META = ARASAKA", "SUA MENTE É DELES", "SUSPENSO PELA JUSTIÇA").
- "cena": uma destas: ${Object.entries(CENAS).map(([k, v]) => `${k} (${v})`).join('; ')}.
- Título de até 10 palavras cruzando o real e a ficção.

EXEMPLOS DE TOM (só o jeito; o conteúdo e as frases têm de ser novos):
${exs}

{"titulo": "...", "batidas": [{"lado": "ficcao", "fala": "...", "legenda": "...", "cena": "apresentador"}], "resumo": "1 frase para chamada"}`;

const ajustePedido = (anterior && ajuste && Array.isArray(anterior.beats)) ? `\n\nVERSÃO ANTERIOR:\nTítulo: ${anterior.title}\n${lista(anterior.beats.map((b) => `[${b.lado}] ${b.fala}`))}\n\nAJUSTES PEDIDOS PELO AUTOR (aplique todos; mantenha o que não foi criticado; se ele não pedir outro tamanho, mantenha 130 a 190 palavras):\n${ajuste}`
  : (ajuste ? `\n\nAJUSTES PEDIDOS PELO AUTOR (prioridade): ${ajuste}` : '');

const baseNumeros = (corpo + ' ' + news.title + ' ' + (news.summary || '') + ' ' + ficha.ficha + ' ' + (analise.fatos || []).join(' ')).replace(/\s/g, '');
function checar(o) {
  const p = [];
  const b = Array.isArray(o.batidas) ? o.batidas : [];
  const texto = b.map((x) => String(x.fala || '')).join(' ');
  const pal = texto.split(/\s+/).filter(Boolean).length;
  if (b.length < 6 || b.length > 8) p.push(`escreva exatamente 7 batidas (vieram ${b.length})`);
  if (pal < 100) p.push(`texto curto demais (${pal} palavras): cada batida precisa de 18 a 28 palavras`);
  b.forEach((x, i) => { const k = String(x.fala || '').split(/\s+/).filter(Boolean).length; if (x.lado !== 'virada' && k < 12) p.push(`batida ${i + 1} curta demais (${k} palavras): escreva de 18 a 28`); });
  const fim = b[b.length - 1];
  const daObra = raizes(espelho.elemento + ' ' + espelho.mundo);
  if (fim && fim.lado === 'chamado' && ![...raizes(fim.fala)].some((r) => daObra.has(r))) p.push(`o chamado tem de voltar à obra: cite ${espelho.elemento} ou ${espelho.mundo}`);
  if (pal > 220) p.push(`texto longo demais (${pal} palavras): cada batida precisa de 18 a 28 palavras`);
  // nomes próprios no meio da frase: os da ficção têm de estar na ficha, os do real na matéria
  const fx = semAcento(ficha.ficha + ' ' + ficha.obra + ' ' + espelho.mundo), rl = semAcento(corpo + ' ' + news.title + ' ' + fonte + ' ' + (analise.fatos || []).join(' '));
  b.forEach((x, i) => {
    for (const m of String(x.fala || '').matchAll(/(?<![.!?:]\s)(?<!^)\b(\p{Lu}[\p{L}-]{3,})/gu)) {
      const w = semAcento(m[1]);
      if (x.lado === 'ficcao' ? !fx.includes(w) : !(rl.includes(w) || fx.includes(w))) p.push(`batida ${i + 1}: "${m[1]}" não está na ${x.lado === 'ficcao' ? 'ficha da obra' : 'notícia'}; tire ou troque`);
    }
  });
  if (b[0] && b[0].lado !== 'ficcao') p.push('a 1ª batida tem de ser do lado "ficcao", abrindo dentro da obra');
  if (!b.some((x) => x.lado === 'virada')) p.push('falta a batida "virada"');
  if (b.length && b[b.length - 1].lado !== 'chamado') p.push('a última batida tem de ser do lado "chamado"');
  const low = texto.toLowerCase();
  for (const w of PROIBIDAS) if (low.includes(w)) p.push(`tire "${w}": diga direto que é a mesma coisa`);
  for (const num of texto.match(/\d[\d.,]*\d|\d/g) || []) if (!baseNumeros.includes(num.replace(/[.,]$/, ''))) p.push(`o número ${num} não está na notícia nem na ficha: tire ou corrija`);
  if (fonte && !low.includes(fonte.toLowerCase().split(/\s+/)[0])) p.push(`cite a fonte pelo nome (${fonte}) uma vez`);
  b.forEach((x, i) => { const k = String(x.legenda || '').split(/\s+/).filter(Boolean).length; if (k < 1 || k > 6) p.push(`a legenda da batida ${i + 1} precisa ter de 2 a 5 palavras`); });
  return p;
}

let roteiro = await ia(SISTEMA, pedidoBatidas + ajustePedido, 1200, 0.7);
let problemas = checar(roteiro);
if (problemas.length) {
  const anteriorTxt = (Array.isArray(roteiro.batidas) ? roteiro.batidas : []).map((x) => `[${x.lado}] ${x.fala}`).join('\n');
  const novo = await ia(SISTEMA, pedidoBatidas + ajustePedido + `\n\nSUA VERSÃO TEVE ESTES PROBLEMAS (corrija todos e devolva o JSON completo):\n${lista(problemas)}\n\nVERSÃO COM PROBLEMAS:\n${anteriorTxt}`, 1200, 0.5);
  const p2 = checar(novo);
  if (p2.length <= problemas.length) { roteiro = novo; problemas = p2; }
}

// ---------- normaliza ----------
let batidas = (Array.isArray(roteiro.batidas) ? roteiro.batidas : []).map((x) => ({
  lado: LADOS.includes(x.lado) ? x.lado : 'real',
  fala: String(x.fala || '').replace(/\s+/g, ' ').trim(),
  legenda: String(x.legenda || '').replace(/\s+/g, ' ').trim(),
  cena: CENAS[x.cena] ? x.cena : null,
})).filter((x) => x.fala);
if (!batidas.length) throw new Error('A IA não escreveu nenhuma batida');
const PADRAO = { ficcao: 'apresentador', real: 'manchete', virada: 'virada', chamado: 'pergunta' };
// escolhe o trecho de 2 a 4 palavras mais "pesado" da fala: nomes próprios e palavras longas, sem começar/terminar em conectivo
const VAZIAS = new Set(['a', 'o', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas', 'e', 'ou', 'que', 'um', 'uma', 'para', 'por', 'com', 'se', 'seu', 'sua', 'ao', 'aos', 'é', 'aqui', 'segundo', 'mais', 'como']);
function legendaDe(fala, troca, ja = new Set()) {
  if (troca) return troca;
  const pergunta = String(fala).split(/(?<=[.!])\s+/).find((f) => /\?$/.test(f) && f.split(/\s+/).length <= 6);
  if (pergunta) return pergunta;
  const trechos = String(fala).split(/[.,;:!?—–()"]+/).map((t) => t.trim().split(/\s+/).filter(Boolean)).filter((t) => t.length);
  let melhor = null, nota = -1;
  for (const ws of trechos) for (let n = 2; n <= 4; n++) for (let i = 0; i + n <= ws.length; i++) {
    const j = ws.slice(i, i + n);
    if (VAZIAS.has(j[0].toLowerCase()) || VAZIAS.has(j[n - 1].toLowerCase())) continue;
    const v = j.reduce((s, w, k) => s + (w.length >= 5 ? Math.min(w.length, 8) : 1) + (/^\p{Lu}/u.test(w) && !(i === 0 && k === 0) ? 8 : 0) - (ja.has(semAcento(w)) ? 12 : 0), 0) / n + (n === 3 ? 0.5 : 0);
    if (v > nota) { nota = v; melhor = j.join(' '); }
  }
  return melhor || String(fala).split(/\s+/).slice(0, 3).join(' ');
}
// o mundo e a fonte já aparecem na faixa do vídeo: não gastar a legenda com eles
const JA = new Set(semAcento(espelho.mundo + ' ' + fonte).split(/[^a-z0-9]+/).filter((w) => w.length > 2));
batidas.forEach((x, i) => {
  const nl = x.legenda ? x.legenda.split(/\s+/).length : 0;
  // legenda que só repete o começo da fala ("Em Night City, a") não diz nada na tela
  const comeco = nl && semAcento(x.fala).replace(/[^a-z0-9 ]/g, '').startsWith(semAcento(x.legenda).replace(/[^a-z0-9 ]/g, ''));
  // a batida da troca de nome ganha a própria tradução ("Meta = Arasaka")
  const t0 = (espelho.traducao || [])[0];
  const troca = x.lado === 'real' && t0 && i === batidas.findIndex((y) => y.lado === 'real') && t0.real.split(/\s+/).length + t0.ficcao.split(/\s+/).length <= 5 ? `${t0.real} = ${t0.ficcao}` : '';
  if (nl < 2 || nl > 6 || comeco) x.legenda = legendaDe(x.fala, troca, JA);
  if (!x.cena) x.cena = i === 0 ? 'apresentador' : PADRAO[x.lado];
});
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// parágrafos do site: batidas seguidas do mesmo lado ficam juntas
const pars = [];
batidas.forEach((x) => { const u = pars[pars.length - 1]; if (u && u.lado === x.lado) u.t.push(x.fala); else pars.push({ lado: x.lado, t: [x.fala] }); });
const content = pars.map((p) => `<p>${p.lado === 'virada' ? '<strong>' + esc(p.t.join(' ')) + '</strong>' : esc(p.t.join(' '))}</p>`).join('\n');

const today = n.today;
const origin = req.mode === 'pauta' ? 'notícia-do-dia' : 'link-enviado';
const entry = {
  id: today,
  date: today,
  news: { title: news.title || 'Notícia não disponível', link: news.link || '#', summary: news.summary || news.title || '', source: fonte || 'RSS Feed', publishedDate: news.publishedDate || today },
  reflection: {
    title: String(roteiro.titulo || analise.mecanismo || 'W4K3').trim(),
    content,
    excerpt: String(roteiro.resumo || batidas[0].fala).trim(),
    beats: batidas,
    espelho: { obra: ficha.obra, elemento: espelho.elemento || '', mundo: espelho.mundo || '', traducao: espelho.traducao },
    analise,
    avisos: problemas,
  },
  sources: (n.allSources || []).map((s) => ({ title: s.title || 'Fonte não disponível', link: s.link || '#', source: s.source || 'RSS Feed', date: s.date || today })),
  tags: ['reflexão', 'notícia', 'antisistema', 'crítica', origin, ficha.obra],
};
return [{ json: { newEntry: entry, date: today } }];
