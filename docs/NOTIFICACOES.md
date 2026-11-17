# Avisos da 2B no Telegram

A 2B, personagem do projeto, posta num **canal público do Telegram** sempre que sai conteúdo novo no site.
Quem quer receber os avisos só precisa entrar no canal. Não tem cadastro e não guardamos nada de quem segue.

| Ferramenta | Quando a 2B avisa | Hashtag |
|---|---|---|
| W4K3 PR0T0C0L | reflexão nova publicada (com prévia do link) | `#w4k3` |
| Motivação Diária | frase nova | `#motivacao` |
| Organize-se | atos **convocados** que ainda vão acontecer, numa mensagem por rodada, agrupados por estado (cobertura de ato que já passou não vira aviso) | `#organize #SP #RJ …`, `#nacional` |
| Fact Check | resumo das checagens novas das agências (as 10 mais recentes) | `#factcheck` |

Para ver só um assunto no canal, toque na hashtag (por exemplo `#SP`) e o Telegram filtra.

## Como funciona

- `automation/notify.js` lê os feeds em `data/`, compara com o que já foi avisado e monta as mensagens.
  As falas de abertura da 2B ficam no objeto `VOICE`, no topo do arquivo. Edite à vontade.
- `.github/workflows/notify.yml` roda o script quando:
  - um push no `main` muda `data/` (é o caso do W4K3 e da Motivação, que saem do PC de casa);
  - terminam as Actions do Fact Check ou do Organize-se. Os commits delas não disparam `push`, por isso o `workflow_run`.
- O que já foi avisado fica em `notified.json`, no branch **`notify-state`**, fora do `main`. Assim não entra em
  conflito com os outros pushes. Pode apagar esse branch para recomeçar do zero: na próxima rodada a 2B
  marca tudo o que existe como já avisado e não manda nada.
- **Primeira rodada de cada feed:** só marca, sem enviar, para não despejar 180 checagens de uma vez.
- Se o Telegram recusar uma mensagem, o conteúdo dela não é marcado e vai na rodada seguinte.
- Testes: `node tests/notify/notify.test.js`. Eles também rodam na Action "Validar feeds".
- Para ver as mensagens sem enviar: `node automation/notify.js --state caminho/qualquer.json --dry-run`.

## Configurar (uma vez)

1. **Criar o bot 2B.** No Telegram, fale com o `@BotFather` e mande `/newbot`.
   - Nome: `2B`.
   - Usuário: um que termine em `bot` e esteja livre, por exemplo `offgrid_2b_bot`.
   - Ele devolve o **token**. Guarde-o, ele não vai para o código.
   - Opcional: `/setuserpic` (a foto da 2B), `/setdescription` e `/setabouttext`.
2. **Criar o canal.** Novo canal, **público**, com um link como `t.me/offgrid_2b`.
3. **Pôr a 2B no canal.** Em Administradores, adicione o bot e deixe ligada só a permissão **Publicar mensagens**.
4. **Secrets no GitHub.** Em *Settings → Secrets and variables → Actions → New repository secret*:
   - `TELEGRAM_2B_TOKEN`: o token do passo 1;
   - `TELEGRAM_2B_CHAT`: `@offgrid_2b`, o usuário do canal com `@`.
5. **Primeira rodada.** Vá em *Actions → "2B - avisos no Telegram" → Run workflow*. Ela marca o que já existe
   e não posta nada. A partir daí, cada novidade vira aviso.

Sem os secrets, o workflow só mostra no log o que mandaria e não grava estado.

O bot do W4K3 (`telegram-w4k3.ps1`, conversa privada para aprovar rascunhos) é outro bot e continua igual.
A 2B só publica no canal.
