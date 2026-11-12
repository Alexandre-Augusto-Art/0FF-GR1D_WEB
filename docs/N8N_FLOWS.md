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
- **Estado atual (2026-11-12): W4K3 automatizado.** O fluxo corrigido está em
  `automation/n8n/workflows/w4k3-gerador.json` e roda **todo dia às 09:00** pelo Agendador de
  Tarefas do Windows (veja [Automação diária](#automação-diária-desde-2026-11-12)). Não usa mais
  o nó GitHub: o n8n grava o arquivo e `automation/run-w4k3.ps1` valida, faz commit e push no
  `main`. Os exports antigos (seções abaixo) ficam só como histórico.
- **Motivação Diária e Organize-se não têm fluxo n8n ainda.** `data/motivations.json` tem só
  uma frase inicial colocada à mão (2026-11-12) e `data/organize.json` tem só a estrutura,
  sem eventos.

## Quem lê o quê no site

| Página | Arquivo lido | Quem escreve hoje |
|---|---|---|
| `w4k3-protocol.html` (`#w4k3-feed`) | `data/reflections.json` | n8n (fluxos W4K3), parado desde 2026-02-04 |
| `motivacao.html` (`#motivacao-feed`) | `data/motivations.json` | manual (só a frase inicial); fluxo a criar |
| `organize-se.html` (a fazer) | `data/organize.json` | ninguém ainda; fluxo a criar |
| blog (`js/blog-loader.js`) | `posts/index.json` | manual |
| `tarot.html` | `data/tarot.json` | manual |
| chatbot (`js/chatbot.js`) | `data/chatbot.json` | manual |

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
         → copia data/reflections.json para %USERPROFILE%\.n8n-files\w4k3\current.json
         → n8n import:workflow + n8n execute --id=W4K3gerador09h01   (sem abrir o n8n)
              Manual Trigger → 3 RSS → … → AI Agent (Ollama) → Format and Save1
              → Ler current.json → Validar e montar (validators.js + addEntry) → Gravar saída
         → node automation/validate.js → commit "W4K3 PR0T0C0L: nova reflexão AAAA-MM-DD" → push
```

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

### Reflexão a partir de um link (desde 2026-11-12)

Fluxo `automation/n8n/workflows/w4k3-link.json` (id `W4K3linkNoticia1`):
`link.json → Baixar notícia (HTTP) → Extrair notícia (og:title, og:description, data, parágrafos)
→ Prepare Prompt (com o texto da matéria) → AI Agent → … → Validar e montar → Gravar saída`.
A entrada recebe a tag `link-enviado` e o commit sai como "W4K3 PR0T0C0L: reflexão a partir de link".

- Pelo terminal: `powershell -ExecutionPolicy Bypass -File %USERPROFILE%\.w4k3\bin\run-w4k3.ps1 -Url <link>`
- Pelo Telegram: `automation/telegram-w4k3.ps1` fica ouvindo o seu bot (tarefa "W4K3 - Telegram",
  inicia ao entrar no Windows). Configurar uma vez com
  `install-w4k3-task.ps1 -TelegramToken "<token do @BotFather>"`; o token fica só em
  `%USERPROFILE%\.w4k3\telegram.json`. O primeiro chat que falar com o bot vira o dono.
- Uma reflexão por dia: o link substitui a do dia, e a execução das 09:00 não roda se o dia já
  tiver reflexão (`-Force` força). Execuções simultâneas esperam a anterior terminar.

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
7. Criar os fluxos novos de Motivação (`data/motivations.json`) e Organize-se
   (`data/organize.json`) seguindo o mesmo padrão.

## Dicas para o Claude

- Não editar os arquivos de `data/` à mão sem respeitar os formatos acima; rode
  `node automation/validate.js` antes de commitar.
- O clone local costuma ficar atrás do `origin/main` porque o n8n commita direto no GitHub:
  faça `git pull` antes de mexer.
- Não commitar `~/.n8n/config` (tem a encryptionKey) nem exports com chaves coladas nos nós.
