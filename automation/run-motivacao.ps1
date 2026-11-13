<#
  DEDSEC - Motivação Diária: escolha e publicação da frase do dia (data/motivations.json).

  As frases vêm do banco curado automation/motivacao/frases.json (filmes, séries, jogos, livros),
  para não publicar citação inventada. A IA (n8n + Ollama) escolhe, entre até 8 candidatas que
  ainda não saíram, a que mais conversa com a reflexão W4K3 do dia ou com o tema que você pediu.

  Modos:
    run-motivacao.ps1                  proposta diária (Agendador, 09:10): escolhe a frase e manda para
                                         você aprovar no Telegram. Sem Telegram configurado, publica direto.
    run-motivacao.ps1 -AutoPublish     12:00: se o dia ainda não tem frase, publica a proposta pendente
                                         (ou escolhe uma na hora) e avisa no Telegram.
    run-motivacao.ps1 -Propose [-Direction "tema"] [-Exclude id1,id2]
                                       só gera a proposta (usado pelo bot). Saída: %USERPROFILE%\.w4k3\motivacao-proposal.json
                                         e a linha "PROPOSTA|<id da frase>".
    run-motivacao.ps1 -Publish proposta.json   publica uma proposta aprovada (data de hoje).
    -DryRun  não faz commit/push.   -Force  gera a proposta mesmo se o dia já tem frase.

  Usa o mesmo clone dedicado e a mesma trava do W4K3 (%USERPROFILE%\.w4k3\0FF-GR1D_WEB).
  Log: %USERPROFILE%\.w4k3\logs\AAAA-MM-DD.log
#>
param(
  [switch]$Propose,
  [string]$Direction,
  [string[]]$Exclude,
  [string]$Publish,
  [switch]$AutoPublish,
  [switch]$DryRun,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$RepoUrl  = 'https://github.com/Alexandre-Augusto-Art/0FF-GR1D_WEB.git'
$Base     = Join-Path $env:USERPROFILE '.w4k3'
$Clone    = Join-Path $Base '0FF-GR1D_WEB'
$IO       = Join-Path $env:USERPROFILE '.n8n-files\motivacao'
$Proposal = Join-Path $Base 'motivacao-proposal.json'
$Bank     = Join-Path $PSScriptRoot 'motivacao\frases.json'
$Site     = 'https://alexandre-augusto-art.github.io/0FF-GR1D_WEB/motivacao.html'
$Utf8     = New-Object System.Text.UTF8Encoding($false)

Add-Type -Namespace W4K3 -Name Power -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);
'@
[void][W4K3.Power]::SetThreadExecutionState([uint32]2147483649) # ES_CONTINUOUS | ES_SYSTEM_REQUIRED

New-Item -ItemType Directory -Force -Path (Join-Path $Base 'logs'), $IO | Out-Null
$log = Join-Path $Base ("logs\{0:yyyy-MM-dd}.log" -f (Get-Date))
Start-Transcript -Path $log -Append | Out-Null

# Mesma trava do W4K3: os dois usam o clone e o n8n
$mutex = New-Object System.Threading.Mutex($false, 'Local\W4K3-PR0T0C0L')
if (-not $mutex.WaitOne([TimeSpan]::FromMinutes(30))) { Write-Host 'Outra execução não terminou em 30 min.'; Stop-Transcript | Out-Null; exit 1 }

function Invoke-Native([string]$what, [scriptblock]$cmd, [switch]$Quiet) {
  Write-Host "`n>> $what"
  $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { $lines = & $cmd 2>&1 | ForEach-Object { "$_" } } finally { $ErrorActionPreference = $prev }
  if ($Quiet -and $LASTEXITCODE -eq 0) { Write-Host '(ok)' }
  elseif ($Quiet) { $lines | Select-Object -Last 25 | Write-Host }
  else { $lines | Write-Host }
  if ($LASTEXITCODE -ne 0) { throw "$what falhou (código $LASTEXITCODE)" }
  return $lines
}

function Get-TelegramCfg {
  $cfgFile = Join-Path $Base 'telegram.json'
  if (-not (Test-Path $cfgFile)) { return $null }
  $cfg = Get-Content $cfgFile -Raw -Encoding UTF8 | ConvertFrom-Json
  if (-not $cfg.chatId) { return $null }
  return $cfg
}

function Send-Telegram([string]$text, $buttons) {
  try {
    $cfg = Get-TelegramCfg
    if (-not $cfg) { return }
    $p = @{ chat_id = [long]$cfg.chatId; text = $text; disable_web_page_preview = $true }
    if ($buttons) { $p.reply_markup = @{ inline_keyboard = $buttons } }
    $body = $Utf8.GetBytes(($p | ConvertTo-Json -Depth 10))
    Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$($cfg.token)/sendMessage" -ContentType 'application/json; charset=utf-8' -Body $body -TimeoutSec 30 | Out-Null
  } catch { Write-Host "Aviso no Telegram falhou: $_" }
}

function Wait-Ollama {
  for ($i = 0; $i -lt 36; $i++) {
    try { Invoke-RestMethod -TimeoutSec 5 http://localhost:11434/api/tags | Out-Null; return }
    catch {
      if ($i -eq 2) { Write-Host 'Ollama não respondeu, iniciando "ollama serve"'; Start-Process ollama -ArgumentList serve -WindowStyle Hidden }
      Start-Sleep -Seconds 5
    }
  }
  throw 'Ollama não respondeu em http://localhost:11434'
}

function Wait-Internet {
  for ($i = 0; $i -lt 24; $i++) {
    try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Method Head https://github.com | Out-Null; return }
    catch { Start-Sleep -Seconds 5 }
  }
  throw 'Sem acesso à internet'
}

function Update-Clone {
  if (-not (Test-Path (Join-Path $Clone '.git'))) { Invoke-Native 'git clone' { git clone $RepoUrl $Clone } | Out-Null }
  Invoke-Native 'git fetch' { git -C $Clone fetch origin main } | Out-Null
  Invoke-Native 'git reset' { git -C $Clone checkout -B main origin/main --force } | Out-Null
}

# No PowerShell 5.1 o ConvertFrom-Json devolve a lista inteira como um item só; o ForEach a desembrulha
function Read-Json([string]$file) { (Get-Content $file -Raw -Encoding UTF8 | ConvertFrom-Json) | ForEach-Object { $_ } }
function Today { return (Get-Date).ToString('yyyy-MM-dd') }  # o PC está no horário de Brasília
function Get-Motivations { return @(Read-Json (Join-Path $Clone 'data\motivations.json')) }
function Test-HasToday { $m = Get-Motivations; return ($m.Count -gt 0 -and $m[0].date -eq (Today)) }

# Monta o pedido, roda o fluxo n8n e grava a proposta em $Proposal
function New-Proposal([string]$dir, [string[]]$excl) {
  Wait-Internet
  Update-Clone
  $recent = Get-Motivations | Select-Object -First 60
  $reflection = $null
  $refl = @(Read-Json (Join-Path $Clone 'data\reflections.json'))
  if ($refl.Count -and $refl[0].date -eq (Today)) {
    $reflection = @{ title = $refl[0].reflection.title; excerpt = $refl[0].reflection.excerpt }
  }
  $req = [ordered]@{
    today       = Today
    direction   = "$dir".Trim()
    exclude     = @($excl | ForEach-Object { "$_" -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    recentIds   = @($recent | ForEach-Object { $_.bankId } | Where-Object { $_ })
    recentTexts = @($recent | ForEach-Object { $_.content })
    reflection  = $reflection
    bank        = @(Read-Json $Bank)
  }
  [IO.File]::WriteAllText((Join-Path $IO 'request.json'), ($req | ConvertTo-Json -Depth 10 -Compress), $Utf8)
  $out = Join-Path $IO 'proposal.json'
  Remove-Item $out -ErrorAction SilentlyContinue
  Wait-Ollama
  Invoke-Native 'n8n import:workflow' { n8n import:workflow "--input=$(Join-Path $PSScriptRoot 'n8n\workflows\motivacao-diaria.json')" } | Out-Null
  Invoke-Native 'n8n execute' { n8n execute '--id=MOTIVACAOdiaria1' } -Quiet | Out-Null
  if (-not (Test-Path $out)) { throw 'O fluxo terminou sem gravar a proposta' }
  # guarda as frases já recusadas, para o "Outra" não repetir
  $p = Read-Json $out
  $p | Add-Member -NotePropertyName exclude -NotePropertyValue @($req.exclude) -Force
  [IO.File]::WriteAllText($Proposal, ($p | ConvertTo-Json -Depth 5), $Utf8)
  Write-Host "PROPOSTA|$($p.bankId)"
  return $p
}

function Publish-Proposal([string]$file) {
  Wait-Internet
  Update-Clone
  $target = Join-Path $Clone 'data\motivations.json'
  Invoke-Native 'publish-entry.js' { node (Join-Path $PSScriptRoot 'publish-entry.js') $file $target } | Out-Null
  Invoke-Native 'validate.js' { node (Join-Path $Clone 'automation\validate.js') } | Out-Null
  $first = (Get-Motivations)[0]
  Invoke-Native 'git add' { git -C $Clone add data/motivations.json } | Out-Null
  git -C $Clone diff --cached --quiet 2>$null
  if ($LASTEXITCODE -eq 0) { Write-Host 'Nada mudou, sem commit.' }
  elseif ($DryRun) {
    Write-Host "`nDryRun: commit/push pulados."
    git -C $Clone diff --cached --stat | Write-Host
    git -C $Clone reset -q
  } else {
    Invoke-Native 'git commit' { git -C $Clone commit -m "Motivação Diária: frase de $($first.date)" } | Out-Null
    Invoke-Native 'git push' { git -C $Clone push origin main } | Out-Null
    Write-Host "`nPublicado: frase de $($first.date)"
  }
  Write-Host ("RESULTADO|{0}|{1}" -f $first.date, $first.author)
}

function Format-Proposal($p) {
  $msg = "💬 MOTIVAÇÃO DO DIA (proposta)`n`n`"$($p.content)`"`n— $($p.author)"
  if ($p.reason) { $msg += "`n`nPor que essa: $($p.reason)" }
  if ($p.direction -and -not $p.matched) { $msg += "`n`n(Não achei nada no banco sobre `"$($p.direction)`"; escolhi entre as gerais.)" }
  return $msg
}
$Buttons = @(, @(@{ text = '✅ Publicar agora'; callback_data = 'mot_ok' }, @{ text = '🔄 Outra'; callback_data = 'mot_new' }))
$Hint = "Outra linha: /frase jogos vorazes`nSua própria frase: frase: texto — obra"

try {
  Write-Host "Motivação Diária - início $(Get-Date -Format s)  Propose=$Propose Publish=$Publish AutoPublish=$AutoPublish DryRun=$DryRun"

  if ($Propose) {
    New-Proposal $Direction $Exclude | Out-Null
  }
  elseif ($Publish) {
    Publish-Proposal $Publish
    if (-not $DryRun) { Remove-Item $Proposal -ErrorAction SilentlyContinue }
  }
  elseif ($AutoPublish) {
    Wait-Internet
    Update-Clone
    if (Test-HasToday) { Write-Host "Já existe frase de $(Today), nada a fazer."; return }
    if (-not (Test-Path $Proposal)) { New-Proposal '' @() | Out-Null }
    $p = Read-Json $Proposal
    Publish-Proposal $Proposal
    if (-not $DryRun) {
      Remove-Item $Proposal -ErrorAction SilentlyContinue
      Send-Telegram "⏰ Sem resposta até as 12:00, publiquei a frase do dia:`n`n`"$($p.content)`"`n— $($p.author)`n`n$Site"
    }
  }
  else {
    Wait-Internet
    Update-Clone
    if ((Test-HasToday) -and -not $Force) { Write-Host "Já existe frase de $(Today), nada a fazer (use -Force)."; return }
    $p = New-Proposal '' @()
    if (Get-TelegramCfg) {
      Send-Telegram ((Format-Proposal $p) + "`n`nSem resposta até as 12:00, publico esta.`n$Hint") $Buttons
    } else {
      Write-Host 'Telegram não configurado: publicando direto.'
      Publish-Proposal $Proposal
      if (-not $DryRun) { Remove-Item $Proposal -ErrorAction SilentlyContinue }
    }
  }
}
catch {
  Write-Host "`nERRO: $_"
  if (-not $Propose -and -not $Publish) { Send-Telegram "Motivação Diária: a execução agendada falhou. $_" }
  $Host.SetShouldExit(1)
  exit 1
}
finally {
  if ($mutex) { try { $mutex.ReleaseMutex() } catch {} }
  Write-Host "Fim $(Get-Date -Format s)"
  Stop-Transcript | Out-Null
}
