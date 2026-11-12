# Fluxos n8n do 0FF-GR1D_WEB (W4K3 PR0T0C0L)

Guia para o Claude (e para humanos) entenderem como o conteúdo dinâmico deste site
é gerado pelo n8n. Levantamento feito em 2026-11-12 olhando o PC local e o histórico do git.

## Resumo em 30 segundos

- O site é estático (GitHub Pages). As páginas leem arquivos JSON em `data/` via `fetch()`.
- Um fluxo n8n busca notícias de IA por RSS, pede para um modelo local (Ollama `qwen2.5:14b`)
  escrever uma reflexão e **faz commit direto no GitHub** em `data/reflections.json`
  (nó GitHub "Edit a file"). Não depende do clone local.
- **Estado atual: parado.** Os últimos commits automáticos são de 2026-02-04.
  Os fluxos têm só gatilho manual (ou webhook), nenhum agendamento ativo, e o n8n não fica
  rodando no PC.
- `data/daily-content.json` (página W4K3 Protocol / motivação diária) e `data/motivations.json`
  **não têm fluxo n8n**: o primeiro ainda é o conteúdo de exemplo de 2024, o segundo é `[]`.

## Quem lê o quê no site

| Página / script | Arquivo lido | Quem escreve |
|---|---|---|
| `js/content-loader.js` (home / news) | `data/reflections.json` | n8n (fluxos W4K3) |
| `js/content-loader.js` | `data/motivations.json` | ninguém (vazio) |
| `w4k3-protocol.html` | `data/daily-content.json` | ninguém (placeholder manual) |
| `js/blog-loader.js` | `posts/index.json` | manual |
| `tarot.html` | `data/tarot.json` | manual |
| chatbot (`js/chatbot.js`) | `data/chatbot.json` | manual |

## Onde estão os fluxos

Não estão versionados neste repo. Existem como exports JSON em `C:\Users\AAA-DESKTOP\Downloads\`:

| Arquivo | Data | O que faz | Saída |
|---|---|---|---|
| `IA como Editor-Chefe + GitHub.json` | 2026-02-04 | **Versão mais recente.** Contém os dois fluxos abaixo (Gerador + Editor-Chefe) | GitHub |
| `W4K3 PR0T0C0L - Gerador + GitHub.json` | 2026-02-03 | Só o Gerador, salvando via GitHub | GitHub |
| `W4K3 PR0T0C0L - Gerador de Reflexões sobre Notícias (2).json` | 2026-02-03 | Versão intermediária (disco + GitHub, commit "update") | disco/GitHub |
| `W4K3 PR0T0C0L - Gerador de Reflexões sobre Notícias.json` e `(1)` | 2025-12-26 | Versões antigas: gravam no disco local | disco |
| `daily-content-generator V2.json` | 2025-12-26 | Junta RSS em markdown; agendado seg 07h. Apesar do nome, grava em `data/reflections.json` no disco | disco |

Todos os W4K3 têm o mesmo id de workflow (`OVuF9tjS4s7AnbBD`) — são versões do mesmo fluxo.

## Fluxo 1 — Gerador de Reflexões (commit "W4K3 PR0T0C0L: nova reflexão")

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

## Fluxo 2 — IA como Editor-Chefe (commit "W4K3 PR0T0C0L: post Editor-Chefe")

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
sobrescreveu o arquivo. Vale revisar antes de reativar.

## Formato de `data/reflections.json`

Array de objetos, mais recente primeiro:

```json
{
  "id": "AAAA-MM-DD",
  "date": "AAAA-MM-DD",
  "news": { "title": "", "link": "", "summary": "", "source": "", "publishedDate": "" },
  "reflection": { "title": "", "content": "<p>HTML</p>" },
  "sources": [ { "title": "", "link": "", "source": "", "date": "" } ],
  "tags": []
}
```

## Onde o n8n roda (e por que não está rodando)

- Instalado via npm global: `n8n@2.1.5` (`%APPDATA%\npm\n8n.ps1`). Inicia com `n8n` e abre em
  `http://localhost:5678`. Não há serviço, tarefa agendada nem atalho de inicialização para ele.
- A pasta de dados padrão `C:\Users\AAA-DESKTOP\.n8n` **não contém os fluxos W4K3**: tem só
  2 workflows de teste ("Files Write / Code Edit - PowerShell"), nenhuma credencial, nenhuma
  execução, e não é modificada desde 2025-10-31. O `instanceId` dos exports também não bate com
  essa instalação. Ou seja, os fluxos rodaram em **outra instância n8n** (outro diretório de
  dados, outra máquina ou n8n Cloud) que não está ativa neste PC.
- Ollama está instalado e sobe com o Windows (atalho em Startup). Os fluxos usam a credencial
  "Ollama account" (normalmente `http://localhost:11434`) — então a instância n8n precisa
  enxergar o Ollama deste PC.
- Credenciais necessárias no n8n: **GitHub account** (token com permissão de escrita no repo)
  e **Ollama account**. Ao importar os JSONs elas precisam ser recriadas.

## Como reativar

1. Rodar `n8n` neste PC e abrir `http://localhost:5678`.
2. Importar `IA como Editor-Chefe + GitHub.json` (Workflows → Import from file).
3. Criar as credenciais GitHub e Ollama e associar aos nós.
4. Corrigir/testar o "Build Full JSON" para não apagar entradas antigas.
5. Para rodar sozinho: trocar o gatilho manual por um **Schedule Trigger**, ativar o workflow
   e deixar o n8n sempre ligado (ex.: tarefa agendada do Windows rodando `n8n start` no logon).
6. Se quiser motivação diária / `daily-content.json` automáticos, é preciso criar um fluxo novo —
   hoje não existe.

## Dicas para o Claude

- Nunca editar `data/reflections.json` à mão sem preservar o formato acima — o site e o n8n
  dependem dele.
- O clone local costuma ficar atrás do `origin/main` porque o n8n commita direto no GitHub:
  faça `git pull` antes de mexer.
- Os exports em Downloads podem conter IDs de credenciais (não os segredos). Não commitar
  `~/.n8n/config` (tem a encryptionKey).
