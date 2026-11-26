# Fluxos n8n do 0FF-GR1D_WEB (W4K3 PR0T0C0L)

Guia para o Claude (e para humanos) entenderem como o conteúdo dinâmico deste site
é gerado pelo n8n. Levantamento feito em 2026-11-12 olhando o PC local e o histórico do git,
atualizado depois do commit `796c1f0` ("Reconnect W4K3 and Motivação to n8n feeds…").

O **passo a passo de configuração** (nó de validação, `addEntry`, aviso de erro, export dos
fluxos) está em [`automation/n8n/README.md`](../automation/n8n/README.md). Este documento
descreve **o estado real**: quais fluxos existem, onde estão e o que está ou não rodando.

## Resumo em 30 segundos

- O site é estático (GitHub Pages). As páginas leem arquivos JSON em `data/` via `fetch()`
  em `js/content-loader.js`.
- Um fluxo n8n busca notícias de IA por RSS, pede para um modelo local (Ollama `qwen2.5:14b`)
  escrever uma reflexão e grava `data/reflections.json`.
- **Estado atual (2026-11-16): W4K3 com notícia do dia aprovada no Telegram.** Todo dia às 09:00
  o fluxo `w4k3-pauta.json` lê os RSS de sites de tecnologia e sociedade e escolhe uma notícia real;
  o `w4k3-link.json` escreve a denúncia (nome real, fato e impacto na vida das pessoas) e o rascunho vai para você aprovar ou ajustar no
  Telegram, como na Motivação Diária. Veja [Notícia do dia](#notícia-do-dia-desde-2026-11-16).
  O n8n grava os arquivos e `automation/run-w4k3.ps1` valida, faz commit e push no `main`.
  Os exports antigos (seções abaixo) ficam só como histórico.
- **Motivação Diária automatizada (2026-11-13)** com aprovação pelo Telegram: veja
  [Motivação Diária](#motivação-diária-desde-2026-11-13).
- **Organize-se roda no GitHub Actions, não no n8n (desde 2026-11-17).** `.github/workflows/organize.yml`
  roda `automation/organize/fetch.js` duas vezes por dia: busca no Google Notícias (RSS) os atos de esquerda e
  de movimentos populares em cada estado, tira estado/cidade/data/hora da manchete e grava `data/organize.json`.

## Quem lê o quê no site

| Página | Arquivo lido | Quem escreve hoje |
|---|---|---|
| `w4k3-protocol.html` (`#w4k3-feed`) | `data/reflections.json` | n8n (`w4k3-pauta.json` + `w4k3-link.json`), aprovado por você no Telegram |
| `motivacao.html` (`#motivacao-feed`) | `data/motivations.json` | n8n (`motivacao-diaria.json`), aprovado por você no Telegram |
| `organize-se.html` | `data/organize.json` | **GitHub Actions**: `.github/workflows/organize.yml` roda `automation/organize/fetch.js` às 06:17 e 15:41 (Brasília) e faz commit no `main`. Validado por `validateOrganize`; testes em `tests/organize/fetch.test.js` |
| blog (`js/blog-loader.js`) | `posts/index.json` | manual |
| `tarot.html` | `data/tarot.json` | manual |
| chatbot (`js/chatbot.js`) | `data/chatbot.json` | manual |
| `fact-check.html` (`js/fact-check/`) | `data/factcheck.json` (regras: sites oficiais, encurtadores, palavras de golpe, agências) | manual; validado por `validateFactCheck` |
| `fact-check.html`, aba MENSAGEM | `data/factchecks.json` (checagens recentes das agências) | **GitHub Actions**, não o n8n: `.github/workflows/factchecks.yml` roda `automation/factchecks/fetch.js` a cada 6 h e faz commit no `main`. Validado por `validateFactChecks` |

Testes do Fact Check (também rodam na Action "Validar feeds"): `node tests/fact-check/link.test.js`,
`node tests/fact-check/media.test.js` e `node tests/fact-check/text.test.js`.

O coletor das checagens não usa IA nem o PC de casa, por isso roda no GitHub. Ele faz `git pull --rebase`
antes do push; os scripts locais (`run-w4k3.ps1`, `run-motivacao.ps1`) atualizam o clone logo antes de
publicar, então a chance de um push atropelar o outro é pequena. Se um push local falhar com
"non-fast-forward", é só rodar de novo.

As páginas W4K3 e Motivação mostram o selo "ATUALIZADO EM" (data da entrada mais recente) e
o aviso de conteúdo velho depois de `STALE_DAYS = 2` dias. O HTML gerado pela IA passa por uma
lista de tags permitidas antes de ser exibido.

`data/daily-content.json` **não é mais lido por nenhuma página**: é o placeholder de 2024 e
pode ser apagado.

## Validação (já no repo)

- `automation/validators.js` define o formato de cada feed (`validateW4K3`,
  `validateMotivacao`, `validateOrganize`) e a função `addEntry`, que põe a entrada nova no
  topo, substitui a do mesmo dia e guarda as 60 mais recentes.
- `node automation/validate.js` valida `data/` e procura chaves de API nos fluxos exportados
  em `automation/n8n/workflows/`.
- O GitHub Action `.github/workflows/validate-data.yml` roda esse script a cada push que mexe em
  `data/` ou `automation/`.
- **Os fluxos ainda não usam isso.** Os exports abaixo não têm o nó Code de validação nem o
  `addEntry`; é preciso adicionar ao reativar (veja o README de automação).

## Onde estão os fluxos

A pasta `automation/n8n/workflows/` existe para guardá-los, mas **está vazia**. Os fluxos só
existem como exports JSON em `C:\Users\AAA-DESKTOP\Downloads\`:

| Arquivo | Data | O que faz | Saída |
|---|---|---|---|
| `IA como Editor-Chefe + GitHub.json` | 2026-02-04 | **Versão mais recente.** Contém os dois fluxos abaixo (Gerador + Editor-Chefe) | GitHub |
| `W4K3 PR0T0C0L - Gerador + GitHub.json` | 2026-02-03 | Só o Gerador, salvando via GitHub | GitHub |
| `W4K3 PR0T0C0L - Gerador de Reflexões sobre Notícias (2).json` | 2026-02-03 | Versão intermediária (disco + GitHub, commit "update") | disco/GitHub |
| `W4K3 PR0T0C0L - Gerador de Reflexões sobre Notícias.json` e `(1)` | 2025-12-26 | Versões antigas: gravam no disco local | disco |
| `daily-content-generator V2.json` | 2025-12-26 | Junta RSS em markdown; agendado seg 07h. Apesar do nome, grava em `data/reflections.json` no disco | disco |

Todos os W4K3 têm o mesmo id de workflow (`OVuF9tjS4s7AnbBD`): são versões do mesmo fluxo.
Antes de copiar um export para `automation/n8n/workflows/`, rode `node automation/validate.js`
para garantir que não há chave colada em nenhum nó (o repositório é público).

## Fluxo 1: Gerador de Reflexões (commit "W4K3 PR0T0C0L: nova reflexão")

```
Gatilho manual
  → 3 RSS (testingcatalog.com, marktechpost.com, artificial-intelligence.blog)
  → Merge → Transform Date → Filtra últimos 7 dias → Ordena → Limita a 10
  → Select Main News (pega a mais recente + lista de fontes)
  → Prepare Prompt (reflexão crítica / "antisistema", PT-BR)
  → AI Agent (Ollama qwen2.5:14b)
  → Format and Save1 (monta newEntry: id, date, news, reflection, sources, tags)
  → GitHub "Get a file" data/reflections.json  ─┐
  → Merge for GitHub ←──────────────────────────┘
  → Build Full JSON (decodifica base64 do arquivo atual, adiciona newEntry)
  → GitHub "Edit a file" data/reflections.json
```

## Fluxo 2: IA como Editor-Chefe (commit "W4K3 PR0T0C0L: post Editor-Chefe")

Recebe uma reflexão escrita pelo autor e transforma em post.

```
Webhook POST /editor-chefe  { "reflection": "texto" }   (ou manual → "Set Reflexão Teste")
  → Prepare Reflection
  → AI Editor-Chefe (ângulo editorial, temas, necessidades de pesquisa)
  → AI Gera Queries → Busca DuckDuckGo (api.duckduckgo.com) → Agregar Fontes
  → AI Curadoria (insights + referências)
  → AI Escrita Final (post 400–600 palavras)
  → Format and Save → GitHub Get file → Merge → Build Full JSON1 → GitHub Edit file
  → Respond to Webhook
```

Observação: nos commits do Editor-Chefe (2026-02-04) o `reflections.json` encolheu e hoje tem
**só 1 entrada**. Provavelmente o "Build Full JSON" não conseguiu ler o conteúdo existente e
sobrescreveu o arquivo. Ao reativar, troque essa montagem por `addEntry` de
`automation/validators.js`.

## Automação diária (desde 2026-11-12)

```
08:50  tarefa "W4K3 - Acordar PC 08h50"  acorda o PC (suspensão/hibernação) e o segura ligado
09:00  tarefa "W4K3 - Gerador 09h"       %USERPROFILE%\.w4k3\bin\run-w4k3.ps1
         → espera Ollama e internet
         → atualiza o clone dedicado %USERPROFILE%\.w4k3\0FF-GR1D_WEB (= origin/main)
         → se há rascunho aprovado "para as 09h" (pending.json), publica ele e para aqui
         → monta a notícia do dia (veja abaixo) e manda o rascunho no Telegram
12:00  tarefa "W4K3 - Noticia 12h"       run-w4k3.ps1 -AutoPublish
         → se o dia ainda não tem reflexão e a notícia do dia está esperando aprovação, publica e avisa
```

## Notícia do dia (desde 2026-11-16)

Substitui o antigo `w4k3-gerador.json` (3 RSS de IA, publicava sem revisão).

```
run-w4k3.ps1 (09:00, ou o bot com /noticia)
  → pauta-request.json { today, topic, exclude (links já publicados ou recusados hoje) }
  → n8n execute --id=W4K3pautaDiaria1  (automation/n8n/workflows/w4k3-pauta.json)
       Fontes (13 RSS) → Ler RSS (um feed fora do ar não derruba) → Escolher pautas → pautas.json
  → para a melhor candidata (tenta até 3): n8n execute --id=W4K3linkNoticia1 (w4k3-link.json)
       com { url, mode: "pauta", fallback: texto do RSS } → draft.json
  → telegram-w4k3.ps1 -AnnounceDaily manda o rascunho: [✅ Publicar agora] [✏️ Sugerir mudanças] [🔄 Outra notícia] [🗑 Descartar]
```

- **Fontes** (nó "Fontes" do `w4k3-pauta.json`; edite a lista lá): MIT Technology Review Brasil,
  Nexo Jornal, Intercept Brasil, TecMundo, Canaltech, WIRED (geral e Security), MIT Technology
  Review, Rest of World, The Verge (Policy e Science), Ars Technica (geral e Tech Policy).
- **Como escolhe:** notícias das últimas 72 h (7 dias se houver poucas), sem repetir link já
  publicado. Pontua por temas (vigilância, privacidade, big techs, IA, algoritmos, trabalho de
  plataforma, polícia, censura, neurotecnologia...), com bônus para veículos de análise e para as
  mais recentes, e penaliza ofertas, reviews e guias de compra. No máximo 2 por fonte entre as 8.
- **Paywall:** Nexo, Intercept e Ars Technica não deixam ler a página; nesses casos a análise usa
  o texto que vem no próprio RSS (`fallback`).
- **A análise** (nó "Escrever (denúncia)" do `w4k3-link.json`, que também vale para links
  que você manda): formato **denúncia**, veja a seção abaixo. O alvo vira tag da
  entrada, junto com `notícia-do-dia` (ou `link-enviado`).
- **No Telegram:** o botão ✏️ Sugerir mudanças (ou só escrever o que quer mudar) reescreve o rascunho; "Outra notícia" pula as já
  propostas hoje; `/noticia` gera na hora; `/noticia vigilância` procura uma notícia sobre o tema
  (se não houver, avisa e usa as gerais). Descartar = nada é publicado nesse dia.
- **Sem Telegram configurado**, a execução das 09:00 publica a notícia direto.
- A Motivação Diária das 09:10 usa o rascunho da notícia do dia como tema enquanto ele não é publicado.
- Pelo terminal: `run-w4k3.ps1 -Pauta [-Topic "tema"] [-Another]` só gera o rascunho
  (`%USERPROFILE%\.w4k3\draft.json`); `-Publish draft.json` publica; `-AutoPublish -DryRun` testa o das 12h.

- Instalar ou atualizar (depois de mudar o fluxo ou o script):
  `powershell -ExecutionPolicy Bypass -File automation\install-w4k3-task.ps1`
- Testar sem publicar:
  `powershell -ExecutionPolicy Bypass -File %USERPROFILE%\.w4k3\bin\run-w4k3.ps1 -DryRun`
- Log de cada dia: `%USERPROFILE%\.w4k3\logs\AAAA-MM-DD.log`
- Credencial no n8n: só "Ollama account" (`http://localhost:11434`, sem segredo). O push usa o
  Git Credential Manager do Windows, então não há token do GitHub no n8n.
- Se o PC estava **desligado** às 9h, a tarefa roda assim que você entrar no Windows. Para ligar
  sozinho a partir do desligado é preciso ativar "Power On By RTC" na BIOS (ASUS: Advanced →
  APM Configuration) e entrar no Windows (a tarefa roda na sua sessão).

### Formato "denúncia" (desde 2026-11-25; antes era o "espelho direto", com ficção)

Transmissão ativista curta: o nome real de quem fez, o que fez e o que isso tira de quem assiste. Tom
ácido e de manchete; **o exagero fica no tom, nunca no fato**. Nada de ficção.

Desde 2026-11-26 o tom é de **transmissão clandestina que revela um esquema** (estudado na mensagem do
DedSec em Watch Dogs 2): abre com uma chamada fixa sorteada ("Interrompemos a sua programação.",
"Atenção, cidadãos conectados."...), fala de "eles" contra "você", ironia amarga ("você paga para ser
vendido") e "Hora de acordar." antes da escolha. É **teoria da conspiração na forma, nunca no conteúdo**:
o código barra "não é coincidência", "querem te controlar", "nova ordem", "elite global" e insinuação
de segredo, acobertamento ou combinação que a matéria não sustente (lista `INSINUA`), e a segunda
leitura conta como erro ligar dois fatos como causa e efeito quando a matéria não liga.

O texto é um **manifesto, não divulgação de notícia**: a batida `leitura` (entre o rosto e a faca) diz o
que os fatos significam, como opinião do W4K3 ("Para nós,", "Na prática,", "Sejamos claros:"), e quem
fornece os meios responde pelo fim (ex.: "quem fornece a inteligência para o ataque também é
responsável pela morte"). A conclusão pode ser dura, mas parte dos fatos da matéria: não traz lugar,
vítima, número ou ataque que ela não tenha (a segunda leitura confere isso). O nó
`Escrever (denúncia)` (fonte editável em `automation/n8n/code/escrever-denuncia.js`;
`node automation/n8n/build-link.js` copia para o fluxo) fala com o Ollama em etapas:

```
1. dossiê     há denúncia? (lançamento, dica e promoção são recusados e a pauta tenta a próxima) alvo, vítima, promessa, estrago e fatos; cada fato traz o TRECHO da matéria que o prova
              e o código confere se o trecho existe (fato sem trecho é descartado)
2. batidas    chamado → acusação → promessa → prova (com a fonte) → rosto → leitura → faca
              + escolha ("Hora de acordar. Dá para X. Ou dá para Y": Y vem da lista ACOES, escrita à mão)
              + assinatura fixa ("Agora você sabe a verdade. Resistir é sua única opção.")
3. checagem   por código: números, nomes próprios, fonte, alvo citado, frases longas, jargão, ficção,
              frases copiadas dos exemplos ou das 3 últimas edições, e CRIME (roubo, fraude, mentira,
              espionagem...) só se a matéria disser; acusação em aberto precisa dizer que é acusação
4. conferir   uma segunda leitura da IA compara título e batidas com a matéria
              (até 2 reescritas; o que sobrar aparece como aviso no Telegram)
```

- Ação final: a Lei de Acesso à Informação só vale para órgão público brasileiro (`PUBLICO_BR`); contra
  empresa estrangeira vira "descobrir quem compra dessa empresa e cobrar em público" (`cumplices`).
- Título: palavra vaga (caos, polêmica, problema, crise) é barrada; pede o detalhe mais concreto.
- A entrada guarda `reflection.beats` e `reflection.denuncia` (alvo, situação, vítima, jaz); o texto do
  site é a junção das batidas. `analise`, `avisos` e `denuncia.bruto` só existem no rascunho.
- As 3 últimas denúncias publicadas vão no pedido só para o texto novo não repetir as frases delas.
- Um tema vindo de reel não libera nomes nem números: só a matéria e o que você escrever liberam.
- **Crime** só vale se estiver no título, no resumo ou nas frases escolhidas, porque a página traz chamadas
  de outras matérias.
- **Rede de segurança:** acusação em aberto sem "é acusado/investigado" é reescrita por código, e o
  rascunho sai com `segurar: true` quando sobra alerta sério: aí o `-AutoPublish` das 12:00 não publica e
  o bot mostra os alertas e exige uma segunda confirmação (só pelo botão) antes de publicar ou agendar.
- **A aprovação é sua:** a checagem reduz o erro, não garante. Empresa real + acusação errada = processo.
  Leia os avisos e a matéria antes de publicar.
- Num ajuste, o dossiê é reaproveitado.
- **Modelo:** `gemma4:26b-a4b-it-qat` (2026-11-25). No teste com as mesmas notícias escreveu a ~11 tokens/s
  (o `qwen2.5:14b` fez ~3,5) e recusou uma notícia sem denúncia que o Qwen transformou em acusação.
- No CPU leva de 4 a 8 minutos. Por isso o `run-w4k3.ps1` sobe o limite do nó de código do n8n
  (`N8N_RUNNERS_TASK_TIMEOUT=2400`).
- Com a 3090: trocar `MODELO` no nó por um de ~30B melhora o tom e a fidelidade aos fatos.

### Vídeo da análise (desde 2026-11-17)

Cada rascunho que o bot manda (notícia do dia, link ou ajuste) ganha um vídeo narrado, feito só
neste PC (sem GPU e sem serviço pago), no estilo colagem/ASCII/glitch.

```
telegram-w4k3.ps1 Show-Draft → Start-Video (segundo plano)
  → %USERPROFILE%\.w4k3\video\scripts\gerar.js <draft.json> --telegram
       título + cada frase → fala.js (números por extenso, siglas, endereços, pausas, tom por batida)
       → Chatterbox pt-BR (scripts/voz.py, uma frase por arquivo) → Whisper ouve cada frase de volta:
         errou, gera de novo (até 3 vezes); nada prestou, a frase sai na Supertonic F3
         (a mesma síntese que serviu de referência do timbre, em video/voz; não é voz de pessoa real)
       → sem Chatterbox: Piper (scripts/tts.py)
       → FFmpeg: junta, voz um pouco mais grave/"rádio"/glitch, volume por quadro
       → ícones: o modelo de texto (Ollama) diz em inglês o que aparece em cada batida, o código acha os
         candidatos pelo nome entre ~3.900 silhuetas da Game-icons e o modelo escolhe até 3 por batida
         (scripts/icones.js, ~30 s); viram cena própria (cenas2.js: icones, em 3 composições) e parede
         atrás da personagem
       → cada batida vira cortes de ~1,5 s, sempre no começo de uma palavra (fazerPlanos no gerar.js),
         alternando a personagem com cenas:
           - por assunto (as palavras da batida e do texto escolhem): hospital, escola, fábrica, servidor,
             algemas, balança, prédio, gráfico, radar, terminal, casa, planeta, robô, cadeado, carteira,
             família, leilão, fantoche, vigilância, celular, contrato, dinheiro, janelas, lápide...
           - versões sorteadas das batidas fixas: acusação (nome derretendo, letreiro, cartaz), promessa
             (comercial, outdoor, palco), prova (manchete, documento), golpe final (cartela, tela dividida,
             pilha de palavras), escolha (portas, estrada)
           - o que saiu nos 2 últimos vídeos vai para o fim da fila (videos/historico-cenas.json)
       → uma cor de destaque por batida, o resto em preto e branco pontilhado
       → Remotion (src/desenho.js monta o quadro; src/cenas.js tem as cenas; src/base.js os efeitos)
       → fim: logo e depois a tela FONTES (veículo, título da matéria, data e site) com o crédito dos
         ícones, ~5 s a mais
       → vertical 1080x1920 (tela cheia, faixa ALVO/FONTE, legenda pequena) → sendVideo
       → horizontal 1280x720 (fica só em %USERPROFILE%\.w4k3\videos)
```

- Código em `video/` (copiado pelo instalador para `%USERPROFILE%\.w4k3\video`, com `npm ci`);
  vozes em `%USERPROFILE%\.w4k3\tts` (`chatterbox\`: venv, modelo pt-BR e Supertonic 3; e a Piper
  `pt_BR-faber-medium` de reserva). A conferência usa o faster-whisper de `%USERPROFILE%\.w4k3\reels`, e
  as palavras que ele ouviu dão o tempo da legenda. Notas e frases duvidosas ficam em `logs\video.log`.
- A Chatterbox põe uma marca d'água inaudível (Perth) no áudio.
- Ícones: `%USERPROFILE%\.w4k3\icones` (repositório game-icons/icons, ~4 MB). Licença CC BY 3.0: o crédito
  (autores + game-icons.net) aparece no fim de cada vídeo. Ícones de fantasia, armas e gore ficam de fora
  (lista `FORA` no icones.js). Sem os ícones ou sem resposta do Ollama, usa palavras de reserva por assunto
  ou só as cenas desenhadas.
- Uns 9 a 11 minutos no total para 1 minuto de vídeo (vertical, envio, horizontal). Vídeos ficam em
  `%USERPROFILE%\.w4k3\videos` (os 30 últimos). `--so-vertical` pula o horizontal.
- Ajuste, outra notícia, link novo ou descarte interrompem o vídeo em andamento; se o rascunho mudar
  durante o render, o vídeo velho não é enviado. Publicar não interrompe.
- **No site:** ao publicar, o `automation/video-site.js` (chamado pelo `run-w4k3.ps1`) acha o vídeo
  vertical da versão aprovada pelo hash do rascunho (`%USERPROFILE%\.w4k3ideos\indice.json`, que o
  `gerar.js` grava), recomprime para a web (540x960, uns 4 MB por 50 s) em
  `assets/videos/w4k3/<data>.mp4` com uma capa `.jpg` e grava `video: { src, poster }` na entrada. A
  página do W4K3 mostra o player acima do texto. Se o render ainda estiver rodando, espera até 12 min;
  sem vídeo desta versão, publica só o texto.
- Cada vídeo soma uns 2 MB ao repositório (uns 700 MB por ano publicando todo dia); se crescer
  demais, apague os vídeos antigos de `assets/videos/w4k3` (a página só mostra o da entrada mais nova).
- Log: `%USERPROFILE%\.w4k3\logs\video.log`. Testar à mão:
  `node video\scripts\gerar.js %USERPROFILE%\.w4k3\draft.json --saida teste.mp4`.
- Editar o visual ao vivo: `npm run exemplo` e `npm run estudio` dentro de `video\`.
- Personagem e marca são próprios: a personagem é a arte do autor (`03.11.26_2B`, Asset-1 neutra, Asset-3 de olhos fechados e
  Asset-2 de boca aberta), redesenhada em `video/src/personagem.js` com as formas do SVG, toda na cor neon da batida; a boca abre
  com o volume da voz (feminina, Chatterbox com timbre da Supertonic F3). Não usar caveira, logo ou
  cenas do Watch Dogs (direitos autorais).

### Temas a partir de reels e posts (desde 2026-11-18; posts de imagem desde 2026-11-23)

Reels e posts que você recebe viram uma lista de temas para edições futuras. Mande ao bot o link
(Instagram, TikTok ou YouTube Shorts; reel, carrossel ou post de imagem), o próprio arquivo de
vídeo ou imagens (prints, slides; um álbum do Telegram vira um post só), com um comentário se
quiser ("compara com a Amazon de verdade"):

```
link/vídeo → automation/reels/reel-tema.js (em segundo plano, fila; o bot continua respondendo)
  → yt-dlp, sem login: legenda, vídeos e as imagens do carrossel (privado: mande o arquivo,
    até 20 MB pelo bot)
  → vídeos: faster-whisper (transcrever.py; "small" no CPU, uns 35 s para 1min45 de reel)
  → imagens (até 6 por post): qwen2.5vl:7b no Ollama transcreve o texto de cada slide e
    descreve a imagem (uns 1 a 1,5 min por imagem no CPU; segundos com a 3090)
  → Ollama: título, mecanismo real, quem ganha/paga, alvo,
    palavras de busca e afirmações a checar
  → junta com um tema parecido ou cria um novo em %USERPROFILE%\.w4k3\temas.json
  → mensagem no Telegram com [✍️ Escrever agora] [🗑 Apagar tema]
```

- O vídeo baixado é apagado depois; ficam o link, a legenda, um trecho da transcrição e a análise.
- **Reel não é fonte.** O tema vira pauta buscando uma notícia real com as palavras do tema
  (`run-w4k3.ps1 -Pauta -Tema 7`), com o mecanismo do tema e o seu comentário como
  direcionamento. Se não houver notícia recente sobre ele, a pauta é geral e o tema fica na lista.
- Às 09h, a notícia do dia parte do 1º tema da fila (mais reels sobre o mesmo assunto primeiro,
  depois o mais antigo). Sem temas, segue como antes.
- No bot: `/temas` (lista), `usar 7` (escreve agora), `apagar 7`.
- Não usa cookies nem a sua conta do Instagram: é o que leva o Instagram a bloquear contas.
- Teste sem mexer no Telegram nem na lista: `W4K3_TESTE=1 node automation\reels\reel-tema.js testar
  <url> [comentário]` (usa `temas-teste.json`). Com a 3090: `W4K3_WHISPER=large-v3`.
- Outro modelo de visão: `W4K3_VISAO=<modelo>`. Log em `%USERPROFILE%\.w4k3\logs\reels.log`.

### Reflexão a partir de um link (desde 2026-11-12)

Fluxo `automation/n8n/workflows/w4k3-link.json` (id `W4K3linkNoticia1`) gera só um **rascunho**:
`link.json {url, direction, feedback?, previousDraft?} → Baixar notícia (HTTP) → Extrair notícia
(og:title, og:description, data, parágrafos) → Escrever (denúncia) (texto da matéria +
direcionamento + versão anterior e ajustes; Ollama em etapas) → Validar rascunho → draft.json`.
O mesmo fluxo escreve a notícia do dia (`mode: "pauta"`).
Quem publica é o `run-w4k3.ps1 -Publish` (usa `automation/publish-entry.js`: data de hoje,
`addEntry`, validação). A entrada recebe a tag `link-enviado`.

**Bot do Telegram** (`automation/telegram-w4k3.ps1`, tarefa "W4K3 - Telegram", inicia ao entrar
no Windows; log em `%USERPROFILE%\.w4k3\logs\telegram.log`):

```
você: <link> + o que quer que ele fale      → bot: rascunho
você: ajustes em texto livre (n vezes)      → bot: rascunho reescrito
você: ✅ Aprovar (ou "ok")                   → bot: publicar agora ou às 09:00?
  🚀 agora   → run-w4k3.ps1 -Publish          (commit "reflexão aprovada")
  ⏰ 09:00   → %USERPROFILE%\.w4k3\pending.json; a execução das 09h publica ele no lugar
               da reflexão automática e avisa no Telegram
```
Comandos: `/status`, `/cancelar`, `/ajuda`. Configurar uma vez com
`install-w4k3-task.ps1 -TelegramToken "<token do @BotFather>"`; o token fica só em
`%USERPROFILE%\.w4k3\telegram.json` e o primeiro chat que falar com o bot vira o dono.

Pelo terminal: `run-w4k3.ps1 -Url <link> [-Direction "..."]` gera e publica sem revisão;
`-Request pedido.json` só gera o rascunho; `-Publish draft.json` publica.
Uma reflexão por dia: publicar de novo no mesmo dia substitui; a execução das 09:00 não roda se
o dia já tiver reflexão (`-Force` força). Execuções simultâneas esperam a anterior terminar.

## Motivação Diária (desde 2026-11-13)

Frases de filmes, séries, jogos e livros que motivam a resistência contra o sistema (V de Vingança,
Jogos Vorazes, Cyberpunk 2077, Matrix, Andor, 1984...). Elas vêm de um **banco curado**,
`automation/motivacao/frases.json`, e não da memória da IA: assim o site não publica citação
inventada ou atribuída à obra errada. A IA só **escolhe** qual frase usar.

```
09:10  tarefa "W4K3 - Motivacao 09h10"   run-motivacao.ps1
         → atualiza o clone; monta %USERPROFILE%\.n8n-files\motivacao
equest.json
           { today, direction, exclude, recentIds, recentTexts, reflection (W4K3 de hoje), bank }
         → n8n execute --id=MOTIVACAOdiaria1  (automation/n8n/workflows/motivacao-diaria.json)
              Ler request.json → Escolher candidatas (até 8, sem repetir as últimas 60, filtradas pelo tema)
              → Prepare Prompt → AI Agent (Ollama) escolhe {id, motivo} → Montar proposta
              → Validar proposta (validateMotivacao) → proposal.json
         → manda a proposta no Telegram: [✅ Publicar agora] [🔄 Outra]
12:00  tarefa "W4K3 - Motivacao 12h"     run-motivacao.ps1 -AutoPublish
         → se o dia ainda não tem frase, publica a proposta pendente (ou escolhe uma) e avisa no Telegram
```

Publicar = `publish-entry.js` (data de hoje, `addEntry`, validação) + `validate.js` + commit
"Motivação Diária: frase de AAAA-MM-DD" + push no `main`. Sem o Telegram configurado, a execução das
09:10 publica direto. A entrada guarda `work`, `kind` e `bankId` além de `date`, `content` e `author`
(o `bankId` evita repetir a frase).

**No Telegram** (mesmo bot do W4K3):

| Você manda | O bot faz |
|---|---|
| botão ✅ Publicar agora | publica a proposta |
| botão 🔄 Outra | escolhe outra (não repete as recusadas), mantendo o tema |
| `/frase` | proposta nova na hora |
| `/frase jogos vorazes` (obra, tema, personagem ou `jogo`/`série`) | proposta nessa linha; se o banco não tiver nada, avisa e escolhe entre as gerais |
| `frase: texto — obra` | a sua própria frase vira a proposta (autor = o que vem depois do travessão, ou DEDSEC) |

Para **acrescentar frases**, edite `automation/motivacao/frases.json`
(`id` único, `text` em português, `speaker`, `work`, `kind`, `year`, `tags`) e rode o
`install-w4k3-task.ps1` de novo para copiar o banco. Pelo terminal:
`run-motivacao.ps1 -Propose [-Direction "tema"]` só gera a proposta;
`-Publish %USERPROFILE%\.w4k3\motivacao-proposal.json [-DryRun]` publica.

### O que foi corrigido em relação ao export de 2026-02-04

- O gatilho manual estava ligado só ao Editor-Chefe: os 3 RSS do Gerador não tinham gatilho.
- "Merge for GitHub" combinava por `newEntry`, campo que o "Get a file" não tem, e o "Get a file"
  devolve o arquivo como binário; o "Build Full JSON" lia `[]` e sobrescrevia o histórico (por
  isso o arquivo ficou com 1 entrada). Trocado por leitura local + `addEntry` + validação.
- Datas no fuso de Brasília; texto da IA convertido em `<p>`; um feed RSS fora do ar não derruba
  o fluxo; a fonte mostra o domínio em vez de "RSS Feed".

## Formatos dos arquivos

A referência oficial é o comentário de cada validador em `automation/validators.js`. Resumo:

`data/reflections.json` (W4K3): lista, mais recente primeiro, datas sem repetir.

```json
{
  "id": "AAAA-MM-DD",
  "date": "AAAA-MM-DD",
  "news": { "title": "", "link": "", "summary": "", "source": "", "publishedDate": "" },
  "reflection": { "title": "", "content": "<p>HTML simples, 50+ caracteres</p>", "excerpt": "" },
  "sources": [ { "title": "", "link": "", "source": "", "date": "" } ],
  "tags": []
}
```

`data/motivations.json` (Motivação): lista, mais recente primeiro.

```json
{ "date": "AAAA-MM-DD", "content": "frase de 10 a 500 caracteres", "author": "DEDSEC" }
```

`data/organize.json` (Organize-se): objeto com `updatedAt`, `buscas` e `eventos`
(cada evento tem `tipo`, `uf` ou `BR` para nacional, `publicadoEm` e `fonte`; `cidade`, `data` e `hora`
só quando a manchete diz). Formato completo em `automation/validators.js`.

## Onde o n8n roda (e por que não está rodando)

- Instalado via npm global: `n8n@2.1.5` (`%APPDATA%\npm\n8n.ps1`). Inicia com `n8n` e abre em
  `http://localhost:5678`. Não há serviço, tarefa agendada nem atalho de inicialização para ele.
- A pasta de dados padrão `C:\Users\AAA-DESKTOP\.n8n` **não contém os fluxos W4K3**: tem só
  2 workflows de teste ("Files Write / Code Edit - PowerShell"), nenhuma credencial, nenhuma
  execução, e não é modificada desde 2025-10-31. O `instanceId` dos exports também não bate com
  essa instalação. Ou seja, os fluxos rodaram em **outra instância n8n** (outro diretório de
  dados, outra máquina ou n8n Cloud) que não está ativa neste PC.
- Ollama está instalado e sobe com o Windows (atalho em Startup). Os fluxos usam a credencial
  "Ollama account" (normalmente `http://localhost:11434`), então a instância n8n precisa
  enxergar o Ollama deste PC.
- Credenciais necessárias no n8n: **GitHub account** (token com permissão de escrita no repo)
  e **Ollama account**. Ao importar os JSONs elas precisam ser recriadas.

## Como reativar

1. Rodar `n8n` neste PC e abrir `http://localhost:5678`.
2. Importar `IA como Editor-Chefe + GitHub.json` (Workflows → Import from file).
3. Criar as credenciais GitHub e Ollama e associar aos nós.
4. Trocar o "Build Full JSON" por `addEntry` e pôr o nó Code de validação antes do nó do GitHub
   (código pronto em `automation/n8n/README.md`).
5. Para rodar sozinho: trocar o gatilho manual por um **Schedule Trigger** diário, ativar o
   workflow e deixar o n8n sempre ligado (ex.: tarefa agendada do Windows rodando `n8n start`
   no logon). Configurar um Error workflow para receber aviso de falha.
6. Exportar o fluxo para `automation/n8n/workflows/` e commitar.
7. (Feito) O Organize-se não usa n8n: roda no GitHub Actions (`organize.yml`).

## Dicas para o Claude

- Não editar os arquivos de `data/` à mão sem respeitar os formatos acima; rode
  `node automation/validate.js` antes de commitar.
- O clone local costuma ficar atrás do `origin/main` porque o n8n commita direto no GitHub:
  faça `git pull` antes de mexer.
- Não commitar `~/.n8n/config` (tem a encryptionKey) nem exports com chaves coladas nos nós.
