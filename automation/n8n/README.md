# Automação diária com n8n

O n8n roda no PC de casa, gera o conteúdo com IA e faz commit dos arquivos em `data/`.
O GitHub Pages publica o site com esses arquivos. Se o PC estiver desligado, o site continua
no ar com o último conteúdo, e as páginas avisam "SEM ATUALIZAÇÃO HÁ N DIAS".

| Feed | Arquivo que o n8n grava | Página | Validador |
|---|---|---|---|
| W4K3 PR0T0C0L | `data/reflections.json` | `w4k3-protocol.html` | `validateW4K3` |
| Motivação Diária | `data/motivations.json` | `motivacao.html` | `validateMotivacao` |
| Organize-se | `data/organize.json` | `organize-se.html` (a fazer) | `validateOrganize` |

O formato de cada arquivo está documentado em [`../validators.js`](../validators.js).

## 1. Validar antes de publicar

Em cada fluxo, coloque um nó **Code** entre o nó que monta o JSON final e o nó do GitHub
que faz o commit:

```
[Cron] → [IA gera conteúdo] → [Monta arquivo final] → [Code: validar] → [GitHub: editar arquivo]
```

No nó Code (modo *Run Once for All Items*), cole **o conteúdo inteiro** de
`automation/validators.js` e, logo abaixo, este trecho:

```js
// ---- ajuste estas duas linhas ----
const FEED = 'w4k3';                       // 'w4k3' | 'motivacao' | 'organize'
const conteudo = $input.first().json.conteudo; // campo com o JSON final do arquivo

const validar = { w4k3: validateW4K3, motivacao: validateMotivacao, organize: validateOrganize }[FEED];
const data = typeof conteudo === 'string' ? JSON.parse(conteudo) : conteudo;
const erros = validar(data);
if (erros.length) {
  throw new Error('Conteúdo inválido, nada foi publicado:\n' + erros.join('\n'));
}
return [{ json: { ...$input.first().json, conteudo: JSON.stringify(data, null, 2) } }];
```

Se a IA devolver algo quebrado, o nó dá erro, o fluxo para antes do commit e o site
continua com o conteúdo de ontem.

**Para W4K3 e Motivação**, monte o arquivo final com `addEntry` (também está em
`validators.js`). Essa função coloca a entrada nova no topo, substitui a do mesmo dia e guarda só as 60 mais recentes:

```js
const atual = JSON.parse($('GitHub: ler arquivo').first().json.conteudo || '[]');
const novo = addEntry(atual, { date: '2026-11-12', content: 'frase gerada', author: 'DEDSEC' });
```

### Receber aviso quando falhar

Em **Settings → Error workflow** de cada fluxo, aponte para um fluxo com o gatilho
*Error Trigger* que mande e-mail ou Telegram para você. Além disso, o GitHub Actions
(`.github/workflows/validate-data.yml`) valida `data/` a cada push e manda e-mail se
algo inválido chegar ao repositório.

Para validar no seu PC: `node automation/validate.js`

## 2. Organize-se

- A IA busca manifestações do **Brasil inteiro** e grava todas em `data/organize.json`.
  O site filtra pelo estado e pela cidade que a pessoa escolher, sem enviar nada a servidores.
- `uf` é a sigla do estado (`SP`, `RJ`...). `cidade` vai com o nome oficial e acentos
  (`São Paulo`, `Belo Horizonte`), para o filtro do site encontrar.
- **Toda manifestação precisa de `fonte.url`.** Sem revisão humana, o link da fonte é a única forma
  de o visitante conferir a informação, e o validador recusa eventos sem ela.
- Tire do arquivo as manifestações que já passaram, para ele não crescer sem limite.
- `oQueLevar` (por evento) e `dicasGerais` (para todos) são gerados pela IA.

## 3. Guardar os fluxos no repositório

Assim, se o PC quebrar, você não perde as automações. Exporte sempre que mudar um fluxo:

- **Pela interface:** abra o fluxo → menu `⋯` → *Download* → salve em
  `automation/n8n/workflows/<nome>.json`.
- **Pela linha de comando** (no PC onde o n8n roda):
  ```
  n8n export:workflow --all --separate --output=automation/n8n/workflows/
  ```

O export **não inclui as credenciais** salvas no n8n, só o nome delas. Mas se você colou
alguma chave direto num nó (num cabeçalho HTTP, por exemplo), ela vai junto. O repositório é
público, então o `validate.js` procura chaves conhecidas (GitHub, OpenAI, Google, Groq,
Telegram) nos arquivos desta pasta e falha se achar alguma. Guarde chaves sempre em
*Credentials* do n8n.
