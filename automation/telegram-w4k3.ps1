<#
  W4K3 PR0T0C0L - bot do Telegram com revisão antes de publicar.

  Conversa:
    1. Você manda o link da notícia e, na mesma mensagem, o direcionamento (o que quer que ele fale).
    2. O bot lê a matéria, escreve a reflexão e devolve o RASCUNHO para você ler.
    3. Você responde com ajustes (texto livre) quantas vezes quiser; ele reescreve a cada vez.
    4. Quando estiver bom: botão "Aprovar" (ou responda "ok").
    5. Ele pergunta: "Publicar agora" ou "No horário padrão (09:00)".
  Comandos: /cancelar descarta o rascunho, /status mostra o que está em andamento, /ajuda.
  Mandar um link novo começa outro rascunho (o anterior é descartado).

  Roda neste PC por long polling (sem IP público nem webhook). Com o PC dormindo, as mensagens
  esperam no Telegram (até 24 h). Configuração: install-w4k3-task.ps1 -TelegramToken "<token>".
  O token fica só em %USERPROFILE%\.w4k3\telegram.json. O primeiro chat que falar com o bot vira o dono.
#>
$ErrorActionPreference = 'Stop'
$Base      = Join-Path $env:USERPROFILE '.w4k3'
$CfgFile   = Join-Path $Base 'telegram.json'
$StateFile = Join-Path $Base 'telegram-state.json'
$Draft     = Join-Path $Base 'draft.json'
$Pending   = Join-Path $Base 'pending.json'
$Runner    = Join-Path $PSScriptRoot 'run-w4k3.ps1'
$Site      = 'https://alexandre-augusto-art.github.io/0FF-GR1D_WEB/w4k3-protocol.html'
$Utf8      = New-Object System.Text.UTF8Encoding($false)
$LogFile   = Join-Path $Base 'logs\telegram.log'

if (-not (Test-Path $CfgFile)) { Write-Host "Sem $CfgFile. Rode install-w4k3-task.ps1 -TelegramToken <token>."; exit 2 }
New-Item -ItemType Directory -Force -Path (Join-Path $Base 'logs') | Out-Null
$cfg = Get-Content $CfgFile -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($k in 'chatId', 'offset') { if (-not ($cfg.PSObject.Properties.Name -contains $k)) { $cfg | Add-Member $k $null } }
if (-not $cfg.offset) { $cfg.offset = 0 }
$Api = "https://api.telegram.org/bot$($cfg.token)"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Log([string]$t) { Add-Content -Path $LogFile -Value "$(Get-Date -Format s) $t" -Encoding UTF8 }
function Save-Cfg { [IO.File]::WriteAllText($CfgFile, ($cfg | ConvertTo-Json), $Utf8) }
function Load-State {
  if (Test-Path $StateFile) { return Get-Content $StateFile -Raw -Encoding UTF8 | ConvertFrom-Json }
  return [pscustomobject]@{ stage = 'idle'; url = $null; direction = $null }
}
function Save-State($s) { [IO.File]::WriteAllText($StateFile, ($s | ConvertTo-Json -Depth 5), $Utf8) }

function Tg([string]$method, $payload) {
  $body = $Utf8.GetBytes(($payload | ConvertTo-Json -Depth 10))
  try { return Invoke-RestMethod -Method Post -Uri "$Api/$method" -ContentType 'application/json; charset=utf-8' -Body $body -TimeoutSec 30 }
  catch { Log "Falha em $method : $_" }
}
function Send([string]$text, $buttons) {
  # Telegram aceita até 4096 caracteres por mensagem: quebra em pedaços nos parágrafos
  $chunks = New-Object System.Collections.Generic.List[string]
  $cur = ''
  foreach ($para in ($text -split "`n")) {
    if (($cur.Length + $para.Length + 1) -gt 3800 -and $cur) { $chunks.Add($cur); $cur = '' }
    $cur = if ($cur) { "$cur`n$para" } else { $para }
  }
  if ($cur) { $chunks.Add($cur) }
  for ($i = 0; $i -lt $chunks.Count; $i++) {
    $p = @{ chat_id = [long]$cfg.chatId; text = $chunks[$i]; disable_web_page_preview = $true }
    if ($buttons -and $i -eq $chunks.Count - 1) { $p.reply_markup = @{ inline_keyboard = $buttons } }
    Tg 'sendMessage' $p | Out-Null
  }
}

$BtnReview  = @(, @(@{ text = '✅ Aprovar'; callback_data = 'approve' }, @{ text = '🗑 Descartar'; callback_data = 'cancel' }))
$BtnPublish = @(, @(@{ text = '🚀 Publicar agora'; callback_data = 'now' }, @{ text = '⏰ No horário padrão (09:00)'; callback_data = 'at9' }))

function Next9h {
  $n = (Get-Date).Date.AddHours(9)
  if ((Get-Date) -ge $n) { $n = $n.AddDays(1) }
  return $n
}

function Show-Draft {
  $d = Get-Content $Draft -Raw -Encoding UTF8 | ConvertFrom-Json
  $body = [string]$d.reflection.content
  $body = $body -replace '(?i)</p>\s*', "`n`n" -replace '(?i)<br\s*/?>', "`n" -replace '<[^>]+>', ''
  $body = [System.Net.WebUtility]::HtmlDecode($body).Trim()
  $words = ($body -split '\s+').Count
  Send ("📝 RASCUNHO`n`n{0}`n`n{1}`n`n— notícia base: {2} ({3})`n— {4} palavras" -f $d.reflection.title, $body, $d.news.title, $d.news.source, $words)
  Send 'Responda com os ajustes que quiser (texto livre) ou aprove:' $BtnReview
}

# Roda o run-w4k3.ps1 num processo separado e devolve @{ ok; line; err }
function Run-Runner([string[]]$runnerArgs, [string]$tag) {
  $out = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Runner @runnerArgs 2>&1 | ForEach-Object { "$_" }
  $code = $LASTEXITCODE
  $line = $out | Where-Object { $_ -like "$tag|*" } | Select-Object -Last 1
  $err = $out | Where-Object { $_ -like '*ERRO:*' } | Select-Object -Last 1
  if (-not $err) { $err = "código $code" }
  Log "runner $($runnerArgs -join ' ') -> $code $line $err"
  return @{ ok = ($code -eq 0 -and $line); line = $line; err = $err }
}

function Make-Draft($state, [string]$feedback) {
  $req = @{ url = $state.url; direction = $state.direction }
  if ($feedback -and (Test-Path $Draft)) {
    $req.feedback = $feedback
    $req.previousDraft = Get-Content $Draft -Raw -Encoding UTF8 | ConvertFrom-Json
  }
  $reqFile = Join-Path $Base 'request.json'
  [IO.File]::WriteAllText($reqFile, ($req | ConvertTo-Json -Depth 20), $Utf8)
  $r = Run-Runner @('-Request', $reqFile) 'RASCUNHO'
  if ($r.ok) { $state.stage = 'review'; Save-State $state; Show-Draft }
  else {
    Send "Não consegui gerar o rascunho. $($r.err)`nMande o link de novo ou outro link."
    if (-not $feedback) { $state.stage = 'idle'; Save-State $state }
  }
}

function Handle([string]$text, [string]$action) {
  $state = Load-State
  $t = ($text + '').Trim()
  $low = $t.ToLowerInvariant()

  if ($low -in '/start', '/ajuda', '/help', 'ajuda') {
    Send "W4K3 PR0T0C0L`n`n1. Mande o link da notícia e, na mesma mensagem, o que você quer que eu fale sobre ela.`n   Ex.: https://... foque na precarização do trabalho e cite a resistência estudantil`n2. Eu devolvo o rascunho.`n3. Responda com ajustes quantas vezes quiser.`n4. Aprove e escolha: publicar agora ou às 09:00.`n`n/status  o que está em andamento`n/cancelar  descarta o rascunho"
    return
  }
  if ($low -in '/status', 'status') {
    $msg = "Etapa: $($state.stage)"
    if ($state.url) { $msg += "`nLink: $($state.url)" }
    if (Test-Path $Pending) { $msg += "`nAgendado para $((Next9h).ToString('dd/MM HH:mm')): " + (Get-Content $Pending -Raw -Encoding UTF8 | ConvertFrom-Json).reflection.title }
    Send $msg; return
  }
  if ($action -eq 'cancel' -or $low -in '/cancelar', 'cancelar', 'descartar') {
    Save-State ([pscustomobject]@{ stage = 'idle'; url = $null; direction = $null })
    Remove-Item $Draft -ErrorAction SilentlyContinue
    Send 'Rascunho descartado. Mande outro link quando quiser.'; return
  }

  # Link novo: começa outro rascunho
  $m = [regex]::Match($t, 'https?://\S+')
  if ($m.Success -and -not $action) {
    $url = $m.Value.TrimEnd('.', ',', ')', '>')
    $direction = ($t.Remove($m.Index, $m.Length)).Trim()
    $state = [pscustomobject]@{ stage = 'drafting'; url = $url; direction = $direction }
    Save-State $state
    Remove-Item $Draft -ErrorAction SilentlyContinue
    $dirMsg = if ($direction) { "Direcionamento: $direction" } else { 'Sem direcionamento (dica: escreva junto com o link o que você quer que eu destaque).' }
    Send "Recebido. Lendo a notícia e escrevendo o rascunho (uns 5 minutos)...`n$dirMsg"
    Make-Draft $state $null
    return
  }

  switch ($state.stage) {
    'review' {
      if ($action -eq 'approve' -or $low -in 'ok', 'aprovar', 'aprovado', 'aprova', 'pode', 'sim', '👍') {
        $state.stage = 'confirm'; Save-State $state
        Send 'Aprovado. Quando publico?' $BtnPublish
      } elseif ($action) {
        Send 'Use os botões do último rascunho, ou mande ajustes por texto.'
      } else {
        Send "Ajustando com base no que você pediu (uns 5 minutos)..."
        Make-Draft $state $t
      }
    }
    'confirm' {
      if ($action -eq 'now' -or $low -in 'agora', 'publicar', 'publica', 'publicar agora') {
        Send 'Publicando...'
        $snap = Join-Path $Base 'approved.json'
        Copy-Item $Draft $snap -Force
        $r = Run-Runner @('-Publish', $snap) 'RESULTADO'
        if ($r.ok) {
          $p = $r.line.Split('|')
          Send "🚀 Publicado ($($p[1])): $($p[2])`n`nNo site em 1 ou 2 minutos:`n$Site"
          Save-State ([pscustomobject]@{ stage = 'idle'; url = $null; direction = $null })
          Remove-Item $Draft -ErrorAction SilentlyContinue
        } else { Send "Não consegui publicar. $($r.err)`nTente de novo: 'agora' ou o botão." $BtnPublish }
      } elseif ($action -eq 'at9' -or $low -in '9h', '09h', '9', 'depois', 'horario padrao', 'horário padrão') {
        Copy-Item $Draft $Pending -Force
        Save-State ([pscustomobject]@{ stage = 'idle'; url = $null; direction = $null })
        Remove-Item $Draft -ErrorAction SilentlyContinue
        Send "⏰ Agendado para $((Next9h).ToString('dd/MM')) às 09:00. Ele entra no lugar da reflexão automática desse dia. Eu aviso quando publicar."
      } elseif (-not $action) {
        # Ainda dá para ajustar nesta etapa
        $state.stage = 'review'; Save-State $state
        Send "Ajustando com base no que você pediu (uns 5 minutos)..."
        Make-Draft $state $t
      }
    }
    'drafting' { Send 'O rascunho anterior não terminou (o PC pode ter dormido no meio). Mande o link de novo.' }
    default { Send 'Mande o link de uma notícia (e, junto, o que você quer que eu fale sobre ela). /ajuda' }
  }
}

Log 'Receptor no ar'
while ($true) {
  try {
    $res = Invoke-RestMethod -Uri "$Api/getUpdates?timeout=50&offset=$($cfg.offset)&allowed_updates=%5B%22message%22%2C%22callback_query%22%5D" -TimeoutSec 70
  } catch { Log "getUpdates: $_"; Start-Sleep -Seconds 15; continue }

  foreach ($u in $res.result) {
    $cfg.offset = [long]$u.update_id + 1; Save-Cfg
    try {
      if ($u.callback_query) {
        $cq = $u.callback_query
        Tg 'answerCallbackQuery' @{ callback_query_id = $cq.id } | Out-Null
        if ([long]$cq.message.chat.id -ne [long]$cfg.chatId) { continue }
        # tira os botões da mensagem clicada para não clicar duas vezes
        Tg 'editMessageReplyMarkup' @{ chat_id = [long]$cfg.chatId; message_id = $cq.message.message_id; reply_markup = @{ inline_keyboard = @() } } | Out-Null
        Handle '' $cq.data
        continue
      }
      $msg = $u.message
      if (-not $msg) { continue }
      $chat = [long]$msg.chat.id
      if (-not $cfg.chatId) {
        $cfg.chatId = $chat; Save-Cfg
        Send 'W4K3 PR0T0C0L: este chat agora é o dono do bot.'
        Log "Dono: $chat"
      }
      if ($chat -ne [long]$cfg.chatId) { Log "Ignorando chat $chat"; continue }
      Handle ([string]$msg.text + [string]$msg.caption) $null
    } catch { Log "Erro tratando update: $_"; try { Send "Erro interno: $_" } catch {} }
  }
}
