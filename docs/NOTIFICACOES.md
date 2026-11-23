# Avisos da 2B no Telegram

A 2B é o bot do projeto no Telegram. O botão **"Receber avisos da 2B no Telegram"**, na página inicial, abre a
conversa com ela, e cada pessoa escolhe ali o que quer receber:

| Aviso | Quando chega |
|---|---|
| W4K3 PR0T0C0L | reflexão nova publicada |
| Motivação Diária | frase nova |
| Organize-se | atos **convocados** que ainda vão acontecer, numa mensagem por rodada. A pessoa pode escolher os estados; atos nacionais também chegam |
| Fact Check | resumo das checagens novas das agências (as 10 mais recentes) |

Comandos: `/avisos` muda as escolhas, `/parar` desliga tudo e apaga os dados, `/ajuda` explica.

## Configurar (uma vez)

1. **Criar o bot.** No Telegram, fale com o `@BotFather` e mande `/newbot`.
   - Nome: `2B_notifications`.
   - Usuário: **`avisos_2B_bot`** (o Telegram exige começar com letra e terminar em `bot`). Se já tiver dono, escolha
     outro e troque o link `t.me/avisos_2B_bot` em `index.html` e o nome em `install.ps1`.
   - Opcional: `/setuserpic` (a foto da 2B), `/setdescription` e `/setabouttext`.
   - Recomendado: `/setjoingroups` → *Disable*. A 2B só conversa no privado.
2. **Instalar neste PC.** Na pasta do projeto, rode o comando abaixo e cole o token que o BotFather deu. Ele não
   aparece na tela nem vai para o repositório.

   ```bash
   powershell -ExecutionPolicy Bypass -File automation/bot-2b/install.ps1
   ```

3. **Conferir.** Abra a 2B no Telegram, mande `/start` e ligue um aviso.

**Crie o bot antes de publicar o botão.** Enquanto o usuário estiver livre, qualquer pessoa pode registrá-lo e
receber os visitantes do site.

Depois de mudar algo em `automation/bot-2b/`, rode o `install.ps1` de novo. Para trocar o token: `install.ps1 -NovoToken`.

## Como funciona

- `automation/bot-2b/bot.js` roda neste PC, pela tarefa "2B - Avisos" do Windows, e inicia ao entrar no sistema.
  Não precisa de IP público.
- **Com o PC desligado ou dormindo a 2B não responde.** As mensagens esperam no Telegram por até 24 h e os avisos
  saem quando o PC voltar.
- A cada 5 min ele lê os feeds do site publicado e monta um aviso para cada pessoa que ligou aquele assunto.
- Na primeira leitura de cada feed ele só marca o que já existe, sem avisar.
- Envio que falha é repetido. Quem bloqueia o bot é apagado.
- É um bot separado do W4K3 (`telegram-w4k3.ps1`). Nunca use o mesmo token nos dois.

| Arquivo | O que tem |
|---|---|
| `messages.js` | o texto dos avisos; as falas da 2B ficam em `VOICE` |
| `core.js` | menu, escolhas e regras de quem recebe o quê |
| `bot.js` | conversa com o Telegram e o site |
| `install.ps1` | instala neste PC |

## Privacidade

De cada pessoa ficam guardados só o número da conversa e as escolhas, em `%USERPROFILE%\.w4k3\2b\state.json`, neste
PC, e só enquanto houver um aviso ligado. `/parar` apaga na hora. O log não leva número de conversa, texto das
pessoas nem o token. Não copie essa pasta para o repositório: ele é público, e a lista diz quem acompanha atos.

## Testes

`node tests/bot-2b/bot.test.js` (regras) e `node tests/bot-2b/run.test.js` (o bot inteiro contra um Telegram de
mentira). Os dois rodam na Action "Validar feeds".
Para ver os avisos com o conteúdo de hoje, sem enviar: `node automation/bot-2b/bot.js --preview`.
