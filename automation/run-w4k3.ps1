<#
  W4K3 PR0T0C0L - geração e publicação das reflexões.

  Modos:
    run-w4k3.ps1                       execução diária (Agendador, 09:00):
                                         1. se há rascunho aprovado "para as 09h" (%USERPROFILE%\.w4k3\pending.json), publica ele;
                                         2. senão, se o dia ainda não tem reflexão, roda o fluxo n8n das notícias RSS e publica.
    run-w4k3.ps1 -Request pedido.json  só gera um RASCUNHO a partir de um link (não publica).
                                         pedido.json = { url, direction?, feedback?, previousDraft? }
                                         Saída: %USERPROFILE%\.w4k3\draft.json e a linha "RASCUNHO|<título>".
    run-w4k3.ps1 -Publish draft.json   publica um rascunho aprovado (data de hoje).
    run-w4k3.ps1 -Url <link> [-Direction "texto"]   gera e publica direto, sem revisão.
    -DryRun                            não faz commit/push.   -Force  roda o diário mesmo se o dia já tem reflexão.
    -KeepAwakeMinutes 15               só segura o PC acordado (tarefa das 08:50).

  Tudo roda num clone dedicado (%USERPROFILE%\.w4k3\0FF-GR1D_WEB, igual ao origin/main), para não
  mexer na sua cópia de trabalho. O fluxo n8n é executado pela linha de comando (n8n execute).
  O site mostra uma reflexão por dia: publicar de novo no mesmo dia substitui a anterior.
  Log: %USERPROFILE%\.w4k3\logs\AAAA-MM-DD.log
#>
param(
  [string]$Request,
  [string]$Publish,
  [string]$Url,
  [string]$Direction,
  [switch]$DryRun,
  [switch]$Force,
  [int]$KeepAwakeMinutes = 0
)

$ErrorActionPreference = 'Stop'
$RepoUrl = 'https://github.com/Alexandre-Augusto-Art/0FF-GR1D_WEB.git'
$Base    = Join-Path $env:USERPROFILE '.w4k3'
$Clone   = Join-Path $Base '0FF-GR1D_WEB'
$IO      = Join-Path $env:USERPROFILE '.n8n-files\w4k3'
$Draft   = Join-Path $Base 'draft.json'
$Pending = Join-Path $Base 'pending.json'
$Utf8    = New-Object System.Text.UTF8Encoding($false)

# Impede o Windows de voltar a dormir enquanto este processo estiver vivo
Add-Type -Namespace W4K3 -Name Power -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);
'@
[void][W4K3.Power]::SetThreadExecutionState([uint32]2147483649) # ES_CONTINUOUS | ES_SYSTEM_REQUIRED

if ($KeepAwakeMinutes -gt 0) {
  # Modo "acordar": a tarefa das 08:50 só liga o PC e o segura até a execução das 09:00
  Start-Sleep -Seconds ($KeepAwakeMinutes * 60)
  exit 0
}

New-Item -ItemType Directory -Force -Path (Join-Path $Base 'logs'), $IO | Out-Null
$log = Join-Path $Base ("logs\{0:yyyy-MM-dd}.log" -f (Get-Date))
Start-Transcript -Path $log -Append | Out-Null

# Uma execução por vez (agendada, Telegram, manual)
$mutex = New-Object System.Threading.Mutex($false, 'Local\W4K3-PR0T0C0L')
if (-not $mutex.WaitOne([TimeSpan]::FromMinutes(30))) { Write-Host 'Outra execução não terminou em 30 min.'; Stop-Transcript | Out-Null; exit 1 }

function Invoke-Native([string]$what, [scriptblock]$cmd, [switch]$Quiet) {
  Write-Host "`n>> $what"
  # git e n8n escrevem progresso no stderr; no PowerShell 5.1 isso não pode virar erro fatal
  $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { $lines = & $cmd 2>&1 | ForEach-Object { "$_" } } finally { $ErrorActionPreference = $prev }
  # -Quiet: o n8n imprime a execução inteira (HTML das páginas etc.); no log fica só o fim
  if ($Quiet -and $LASTEXITCODE -eq 0) { Write-Host '(ok)' }
  elseif ($Quiet) { $lines | Select-Object -Last 25 | Write-Host }
  else { $lines | Write-Host }
  if ($LASTEXITCODE -ne 0) { throw "$what falhou (código $LASTEXITCODE)" }
  return $lines
}

function Send-Telegram([string]$text) {
  # Avisa no Telegram (se o bot estiver configurado); nunca derruba a execução
  try {
    $cfgFile = Join-Path $Base 'telegram.json'
    if (-not (Test-Path $cfgFile)) { return }
    $cfg = Get-Content $cfgFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if (-not $cfg.chatId) { return }
    $body = $Utf8.GetBytes((@{ chat_id = $cfg.chatId; text = $text; disable_web_page_preview = $true } | ConvertTo-Json))
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

function Invoke-Workflow([string]$id, [string]$file) {
  Wait-Ollama
  Invoke-Native 'n8n import:workflow' { n8n import:workflow "--input=$(Join-Path $PSScriptRoot "n8n\workflows\$file")" } | Out-Null
  Invoke-Native 'n8n execute' { n8n execute "--id=$id" } -Quiet | Out-Null
}

# Gera o rascunho a partir de um pedido { url, direction, feedback, previousDraft }
function New-Draft($req) {
  if ($req.url -notmatch '^https?://\S+$') { throw "Link inválido: $($req.url)" }
  [IO.File]::WriteAllText((Join-Path $IO 'link.json'), ($req | ConvertTo-Json -Depth 20 -Compress), $Utf8)
  $out = Join-Path $IO 'draft.json'
  Remove-Item $out -ErrorAction SilentlyContinue
  Invoke-Workflow 'W4K3linkNoticia1' 'w4k3-link.json'
  if (-not (Test-Path $out)) { throw 'O fluxo terminou sem gravar o rascunho' }
  Copy-Item $out $Draft -Force
  $title = (Get-Content $Draft -Raw -Encoding UTF8 | ConvertFrom-Json).reflection.title
  Write-Host "RASCUNHO|$title"
}

# Commit + push de data/reflections.json do clone
function Push-Reflections([string]$message) {
  Invoke-Native 'validate.js' { node (Join-Path $Clone 'automation\validate.js') } | Out-Null
  $first = (Get-Content (Join-Path $Clone 'data\reflections.json') -Raw -Encoding UTF8 | ConvertFrom-Json)[0]
  Invoke-Native 'git add' { git -C $Clone add data/reflections.json } | Out-Null
  git -C $Clone diff --cached --quiet 2>$null
  if ($LASTEXITCODE -eq 0) { Write-Host 'Nada mudou, sem commit.' }
  elseif ($DryRun) {
    Write-Host "`nDryRun: commit/push pulados."
    git -C $Clone diff --cached --stat | Write-Host
    git -C $Clone reset -q
  } else {
    Invoke-Native 'git commit' { git -C $Clone commit -m "$message $($first.date)" } | Out-Null
    Invoke-Native 'git push' { git -C $Clone push origin main } | Out-Null
    Write-Host "`nPublicado: reflexão de $($first.date)"
  }
  # Resumo para quem chamou (o receptor do Telegram lê esta linha)
  Write-Host ("RESULTADO|{0}|{1}" -f $first.date, $first.reflection.title)
}

# Publica um rascunho aprovado (recebe a data de hoje)
function Publish-Draft([string]$file, [string]$message) {
  Wait-Internet
  Update-Clone
  Invoke-Native 'publish-entry.js' { node (Join-Path $PSScriptRoot 'publish-entry.js') $file (Join-Path $Clone 'data\reflections.json') } | Out-Null
  Push-Reflections $message
}

try {
  Write-Host "W4K3 PR0T0C0L - início $(Get-Date -Format s)  Request=$Request Publish=$Publish Url=$Url DryRun=$DryRun"

  if ($Request) {
    Wait-Internet
    New-Draft (Get-Content $Request -Raw -Encoding UTF8 | ConvertFrom-Json)
  }
  elseif ($Publish) {
    Publish-Draft $Publish 'W4K3 PR0T0C0L: reflexão aprovada'
  }
  elseif ($Url) {
    Wait-Internet
    New-Draft ([pscustomobject]@{ url = $Url; direction = $Direction })
    Publish-Draft $Draft 'W4K3 PR0T0C0L: reflexão a partir de link'
  }
  elseif (Test-Path $Pending) {
    # Rascunho aprovado para o horário padrão
    Publish-Draft $Pending 'W4K3 PR0T0C0L: reflexão aprovada (09h)'
    if (-not $DryRun) {
      $title = (Get-Content $Pending -Raw -Encoding UTF8 | ConvertFrom-Json).reflection.title
      Remove-Item $Pending
      Send-Telegram "Publicado no horário padrão: $title`nhttps://alexandre-augusto-art.github.io/0FF-GR1D_WEB/w4k3-protocol.html"
    }
  }
  else {
    Wait-Internet
    Update-Clone
    $current = Join-Path $Clone 'data\reflections.json'
    $today = (Get-Date).ToString('yyyy-MM-dd')   # o PC está no horário de Brasília
    $latest = (Get-Content $current -Raw -Encoding UTF8 | ConvertFrom-Json)[0]
    if ($latest.date -eq $today -and -not $Force) { Write-Host "Já existe reflexão de $today, nada a fazer (use -Force)."; return }
    Copy-Item $current (Join-Path $IO 'current.json') -Force
    $out = Join-Path $IO 'reflections.json'
    Remove-Item $out -ErrorAction SilentlyContinue
    Invoke-Workflow 'W4K3gerador09h01' 'w4k3-gerador.json'
    if (-not (Test-Path $out)) { throw 'O fluxo terminou sem gravar reflections.json' }
    Copy-Item $out $current -Force
    Push-Reflections 'W4K3 PR0T0C0L: nova reflexão'
  }
}
catch {
  Write-Host "`nERRO: $_"
  if (-not $Request -and -not $Publish -and -not $Url) { Send-Telegram "W4K3: a execução das 09h falhou. $_" }
  $Host.SetShouldExit(1)
  exit 1
}
finally {
  if ($mutex) { try { $mutex.ReleaseMutex() } catch {} }
  Write-Host "Fim $(Get-Date -Format s)"
  Stop-Transcript | Out-Null
}
