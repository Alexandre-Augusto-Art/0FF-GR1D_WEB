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
  o `w4k3-link.json` escreve a análise crítica com referências de cyberpunk, Watch Dogs, V de
  Vingança, Jogos Vorazes, Blade Runner etc., e o rascunho vai para você aprovar ou ajustar no
  Telegram, como na Motivação Diária. Veja [Notícia do dia](#notícia-do-dia-desde-2026-11-16).
  O n8n grava os arquivos e `automation/run-w4k3.ps1` valida, faz commit e push no `main`.
  Os exports antigos (seções abaixo) ficam só como histórico.
- **Motivação Diária automatizada (2026-11-13)** com aprovação pelo Telegram: veja
  [Motivação Diária](#motivação-diária-desde-2026-11-13).
- **Organize-se não tem fluxo n8n ainda.** `data/organize.json` tem só a estrutura, sem eventos.

## Quem lê o quê no site

| Página | Arquivo lido | Quem escreve hoje |
|---|---|---|
| `w4k3-protocol.html` (`#w4k3-feed`) | `data/reflections.json` | n8n (`w4k3-pauta.json` + `w4k3-link.json`), aprovado por você no Telegram |
| `motivacao.html` (`#motivacao-feed`) | `data/motivations.json` | n8n (`motivacao-diaria.json`), aprovado por você no Telegram |
| `organize-se.html` (a fazer) | `data/organize.json` | ninguém ainda; fluxo a criar |
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
- **A análise** (nó "Escrever (espelho direto)" do `w4k3-link.json`, que também vale para links
  que você manda): formato **espelho direto**, veja a seção abaixo. A obra escolhida vira tag da
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

### Formato "espelho direto" (desde 2026-11-17)

Inspirado em reels que dizem que a notícia real **é** a coisa da ficção com outro nome (não que
ela "lembra"). O nó `Escrever (espelho direto)` (fonte editável em
`automation/n8n/code/escrever-espelho.js`; `node automation/n8n/build-link.js` copia para o fluxo)
fala com o Ollama em etapas curtas, porque o modelo local erra menos com tarefas pequenas:

```
1. mecanismo  só os fatos da matéria, quem faz o quê com quem, quem ganha, quem paga
2. espelho    a obra com a MESMA engrenagem (fichas com temas) + tradução real → ficção
              (ex.: Meta = Arasaka, treinar IA = Soulkiller)
3. batidas    6 a 9 falas curtas, 130 a 190 palavras: abre dentro da obra ("Em Night City...")
              → "Aqui, o nome é..." → fatos com a fonte → virada ("Não é falha. É o modelo
              de negócio.") → chamado; cada batida tem legenda de 2 a 5 palavras e a cena do vídeo
4. checagem   por código: números que não estão na matéria nem na ficha, fonte citada, ordem das
              batidas, palavras proibidas ("lembra", "remete"...); se falhar, uma reescrita
```

- A entrada guarda `reflection.beats` (as batidas) e `reflection.espelho`; o texto do site é a
  junção das batidas. `analise` e `avisos` só existem no rascunho (o `publish-entry.js` tira).
- **Aprende com você:** o `run-w4k3.ps1` manda as 3 últimas análises publicadas com batidas como
  exemplo de tom (você aprova, e os seus ajustes viram o padrão).
- Num ajuste, a etapa 1 é reaproveitada; a 2 só roda de novo se você pedir outra obra.
- No CPU leva uns 8 a 12 minutos (4 chamadas). Por isso o `run-w4k3.ps1` sobe o limite do nó de
  código do n8n (`N8N_RUNNERS_TASK_TIMEOUT=2400`).
- No Telegram, o rascunho mostra o espelho (obra, elemento e tradução) e o que a checagem ainda
  apontou, se apontou algo.
- Com a 3090: trocar `MODELO` no nó por um de ~30B (Qwen2.5-32B ou Gemma 3 27B) melhora o tom e a
  fidelidade aos fatos.

### Vídeo da análise (desde 2026-11-17)

Cada rascunho que o bot manda (notícia do dia, link ou ajuste) ganha um vídeo narrado, feito só
neste PC (sem GPU e sem serviço pago), no estilo colagem/ASCII/glitch.

```
telegram-w4k3.ps1 Show-Draft → Start-Video (segundo plano)
  → %USERPROFILE%\.w4k3\video\scripts\gerar.js <draft.json> --telegram
       título + cada frase → Piper pt-BR (scripts/tts.py, uma frase por arquivo = tempo exato)
       → FFmpeg: junta, voz grave/"rádio"/glitch, volume por quadro
       → uma cena por batida (a cena e a legenda de impacto vêm do roteiro; textos antigos sem
         batidas usam cenas por parágrafo): apresentador, cidade (a torre troca o nome real pelo
         da ficção), manchete, plataforma, vigilância, marionete, obra, virada, pergunta
       → Remotion (src/desenho.js, tudo desenhado em canvas)
       → vertical 1080x1920 (faixa da obra, cena, legenda grande no centro) → sendVideo
       → horizontal 1280x720 (fica só em %USERPROFILE%\.w4k3\videos)
```

- Código em `video/` (copiado pelo instalador para `%USERPROFILE%\.w4k3\video`, com `npm ci`);
  voz em `%USERPROFILE%\.w4k3\tts` (venv com `piper-tts` + `pt_BR-faber-medium`).
- Uns 4 a 5 minutos no total para 1 minuto de vídeo (vertical, envio, horizontal). Vídeos ficam em
  `%USERPROFILE%\.w4k3\videos` (os 30 últimos). `--so-vertical` pula o horizontal.
- Ajuste, outra notícia, link novo ou descarte interrompem o vídeo em andamento; se o rascunho mudar
  durante o render, o vídeo velho não é enviado. Publicar não interrompe.
- **No site:** ao publicar, o `automation/video-site.js` (chamado pelo `run-w4k3.ps1`) acha o vídeo
  vertical da versão aprovada pelo hash do rascunho (`%USERPROFILE%\.w4k3ideos\indice.json`, que o
  `gerar.js` grava), recomprime para a web (540x960, uns 2 MB por 45 s) em
  `assets/videos/w4k3/<data>.mp4` com uma capa `.jpg` e grava `video: { src, poster }` na entrada. A
  página do W4K3 mostra o player acima do texto. Se o render ainda estiver rodando, espera até 6 min;
  sem vídeo desta versão, publica só o texto.
- Cada vídeo soma uns 2 MB ao repositório (uns 700 MB por ano publicando todo dia); se crescer
  demais, apague os vídeos antigos de `assets/videos/w4k3` (a página só mostra o da entrada mais nova).
- Log: `%USERPROFILE%\.w4k3\logs\video.log`. Testar à mão:
  `node video\scripts\gerar.js %USERPROFILE%\.w4k3\draft.json --saida teste.mp4`.
- Editar o visual ao vivo: `npm run exemplo` e `npm run estudio` dentro de `video\`.
- Personagem e marca são próprios (máscara com boca de equalizador); não usar caveira, logo ou
  cenas do Watch Dogs (direitos autorais).

### Reflexão a partir de um link (desde 2026-11-12)

Fluxo `automation/n8n/workflows/w4k3-link.json` (id `W4K3linkNoticia1`) gera só um **rascunho**:
`link.json {url, direction, feedback?, previousDraft?} → Baixar notícia (HTTP) → Extrair notícia
(og:title, og:description, data, parágrafos) → Escrever (espelho direto) (texto da matéria +
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
         → atualiza o clone; monta %USERPROFILE%\.n8n-files\motivacaoequest.json
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

`data/organize.json` (Organize-se): objeto com `updatedAt`, `dicasGerais` e `eventos`
(cada evento precisa de `uf`, `cidade`, `data` e `fonte.url`).

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
7. Criar o fluxo novo do Organize-se (`data/organize.json`) seguindo o mesmo padrão
   (Motivação já foi feito: `motivacao-diaria.json`).

## Dicas para o Claude

- Não editar os arquivos de `data/` à mão sem respeitar os formatos acima; rode
  `node automation/validate.js` antes de commitar.
- O clone local costuma ficar atrás do `origin/main` porque o n8n commita direto no GitHub:
  faça `git pull` antes de mexer.
- Não commitar `~/.n8n/config` (tem a encryptionKey) nem exports com chaves coladas nos nós.
