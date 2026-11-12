<#
  W4K3 PR0T0C0L - receptor de links pelo Telegram.

  Você manda o link de uma notícia para o seu bot no Telegram; este script (rodando neste PC)
  recebe, roda o fluxo n8n "Reflexão a partir de link" e responde com o título publicado.

  Não precisa de IP público nem de webhook: o script pergunta ao Telegram de tempos em tempos
  (long polling). Se o PC estiver dormindo, as mensagens esperam no Telegram (até 24 h) e são
  processadas quando ele acordar.

  Configuração (uma vez): veja automation/install-w4k3-task.ps1 -TelegramToken.
  O token fica só em %USERPROFILE%\.w4k3\telegram.json, nunca no repositório.
  O primeiro chat que mandar mensagem ao bot vira o dono; mensagens de outros chats são ignoradas.
#>
$ErrorActionPreference = 'Stop'
$Base    = Join-Path $env:USERPROFILE '.w4k3'
$CfgFile = Join-Path $Base 'telegram.json'
$Runner  = Join-Path $PSScriptRoot 'run-w4k3.ps1'
$Site    = 'https://alexandre-augusto-art.github.io/0FF-GR1D_WEB/w4k3-protocol.html'
$Utf8    = New-Object System.Text.UTF8Encoding($false)

if (-not (Test-Path $CfgFile)) { Write-Host "Sem $CfgFile. Rode install-w4k3-task.ps1 -TelegramToken <token>."; exit 2 }
$cfg = Get-Content $CfgFile -Raw -Encoding UTF8 | ConvertFrom-Json
$Api = "https://api.telegram.org/bot$($cfg.token)"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Save-Cfg { [IO.File]::WriteAllText($CfgFile, ($cfg | ConvertTo-Json), $Utf8) }
function Send([long]$chat, [string]$text) {
  $body = $Utf8.GetBytes((@{ chat_id = $chat; text = $text; disable_web_page_preview = $true } | ConvertTo-Json))
  try { Invoke-RestMethod -Method Post -Uri "$Api/sendMessage" -ContentType 'application/json; charset=utf-8' -Body $body -TimeoutSec 30 | Out-Null }
  catch { Write-Host "Falha ao responder: $_" }
}
if (-not ($cfg.PSObject.Properties.Name -contains 'chatId')) { $cfg | Add-Member chatId $null }
if (-not ($cfg.PSObject.Properties.Name -contains 'offset')) { $cfg | Add-Member offset 0 }

Write-Host "Receptor Telegram W4K3 no ar $(Get-Date -Format s)"
while ($true) {
  try {
    $res = Invoke-RestMethod -Uri "$Api/getUpdates?timeout=50&offset=$($cfg.offset)&allowed_updates=%5B%22message%22%5D" -TimeoutSec 70
  } catch { Write-Host "getUpdates: $_"; Start-Sleep -Seconds 15; continue }

  foreach ($u in $res.result) {
    $cfg.offset = [long]$u.update_id + 1; Save-Cfg
    $msg = $u.message
    if (-not $msg) { continue }
    $chat = [long]$msg.chat.id
    $text = [string]$msg.text + ' ' + [string]$msg.caption

    if (-not $cfg.chatId) {
      $cfg.chatId = $chat; Save-Cfg
      Send $chat 'W4K3 PR0T0C0L: este chat agora é o dono do bot. Mande o link de uma notícia e eu gero e publico a reflexão.'
    }
    if ($chat -ne [long]$cfg.chatId) { Write-Host "Ignorando chat $chat"; continue }

    $m = [regex]::Match($text, 'https?://\S+')
    if (-not $m.Success) { Send $chat 'Mande o link (https://...) de uma notícia. Eu leio a matéria, escrevo a reflexão e publico no W4K3.'; continue }
    $url = $m.Value.TrimEnd('.', ',', ')', '>')

    Send $chat "Recebido. Lendo a notícia e escrevendo a reflexão (leva uns 5 minutos)...`n$url"
    Write-Host "Link: $url"
    $out = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Runner -Url $url 2>&1 | ForEach-Object { "$_" }
    $code = $LASTEXITCODE
    $result = $out | Where-Object { $_ -like 'RESULTADO|*' } | Select-Object -Last 1
    if ($code -eq 0 -and $result) {
      $p = $result.Split('|')
      Send $chat "Publicado ($($p[1])): $($p[2])`n`nNo site em 1 ou 2 minutos:`n$Site"
    } else {
      $err = ($out | Where-Object { $_ -like '*ERRO:*' } | Select-Object -Last 1)
      if (-not $err) { $err = "código $code" }
      Send $chat "Não consegui publicar. $err`nLog: %USERPROFILE%\.w4k3\logs"
    }
  }
}
