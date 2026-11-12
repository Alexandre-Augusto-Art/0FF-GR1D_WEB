<#
  W4K3 PR0T0C0L - execução diária (chamada pelo Agendador de Tarefas do Windows às 09:00).

  1. Mantém o PC acordado enquanto roda e espera o Ollama responder.
  2. Atualiza um clone dedicado do repositório (branch main) em %USERPROFILE%\.w4k3\0FF-GR1D_WEB,
     para não mexer na sua cópia de trabalho.
  3. Copia data/reflections.json para a pasta que o n8n pode ler (%USERPROFILE%\.n8n-files\w4k3).
  4. Importa e executa o fluxo n8n "W4K3 PR0T0C0L - Gerador diário (09h)" pela linha de comando
     (não precisa deixar o n8n aberto).
  5. Valida o resultado com automation/validate.js e faz commit + push no main.
     O GitHub Pages publica sozinho.

  Uso:
    powershell -ExecutionPolicy Bypass -File run-w4k3.ps1            # roda e publica
    powershell -ExecutionPolicy Bypass -File run-w4k3.ps1 -DryRun    # roda, mas não faz commit/push
    powershell -ExecutionPolicy Bypass -File run-w4k3.ps1 -KeepAwakeMinutes 15   # só segura o PC acordado

  Log: %USERPROFILE%\.w4k3\logs\AAAA-MM-DD.log
#>
param(
  [switch]$DryRun,
  [int]$KeepAwakeMinutes = 0
)

$ErrorActionPreference = 'Stop'
$WorkflowId = 'W4K3gerador09h01'
$RepoUrl    = 'https://github.com/Alexandre-Augusto-Art/0FF-GR1D_WEB.git'
$Base       = Join-Path $env:USERPROFILE '.w4k3'
$Clone      = Join-Path $Base '0FF-GR1D_WEB'
$IO         = Join-Path $env:USERPROFILE '.n8n-files\w4k3'
$Workflow   = Join-Path $PSScriptRoot 'n8n\workflows\w4k3-gerador.json'

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

function Invoke-Native([string]$what, [scriptblock]$cmd) {
  Write-Host "`n>> $what"
  # git e n8n escrevem progresso no stderr; no PowerShell 5.1 isso não pode virar erro fatal
  $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { & $cmd 2>&1 | ForEach-Object { "$_" } | Write-Host } finally { $ErrorActionPreference = $prev }
  if ($LASTEXITCODE -ne 0) { throw "$what falhou (código $LASTEXITCODE)" }
}

try {
  Write-Host "W4K3 PR0T0C0L - início $(Get-Date -Format s)  DryRun=$DryRun"

  # Ollama (sobe com o Windows; se não estiver no ar, tenta iniciar)
  $ok = $false
  for ($i = 0; $i -lt 36 -and -not $ok; $i++) {
    try { Invoke-RestMethod -TimeoutSec 5 http://localhost:11434/api/tags | Out-Null; $ok = $true }
    catch {
      if ($i -eq 2) { Write-Host 'Ollama não respondeu, iniciando "ollama serve"'; Start-Process ollama -ArgumentList serve -WindowStyle Hidden }
      Start-Sleep -Seconds 5
    }
  }
  if (-not $ok) { throw 'Ollama não respondeu em http://localhost:11434' }

  # Rede (logo depois de acordar o Wi-Fi/Ethernet pode demorar)
  for ($i = 0; $i -lt 24; $i++) {
    try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Method Head https://github.com | Out-Null; break }
    catch { if ($i -eq 23) { throw 'Sem acesso à internet' }; Start-Sleep -Seconds 5 }
  }

  # Clone dedicado, sempre igual ao origin/main
  if (-not (Test-Path (Join-Path $Clone '.git'))) {
    Invoke-Native 'git clone' { git clone $RepoUrl $Clone }
  }
  Invoke-Native 'git fetch' { git -C $Clone fetch origin main }
  Invoke-Native 'git reset' { git -C $Clone checkout -B main origin/main --force }

  Copy-Item (Join-Path $Clone 'data\reflections.json') (Join-Path $IO 'current.json') -Force
  Remove-Item (Join-Path $IO 'reflections.json') -ErrorAction SilentlyContinue

  Invoke-Native 'n8n import:workflow' { n8n import:workflow "--input=$Workflow" }
  $started = Get-Date
  Invoke-Native 'n8n execute' { n8n execute "--id=$WorkflowId" }

  $out = Get-Item (Join-Path $IO 'reflections.json') -ErrorAction SilentlyContinue
  if (-not $out -or $out.LastWriteTime -lt $started) { throw 'O fluxo terminou sem gravar reflections.json' }

  Copy-Item $out.FullName (Join-Path $Clone 'data\reflections.json') -Force
  Invoke-Native 'validate.js' { node (Join-Path $Clone 'automation\validate.js') }

  $date = (Get-Content $out.FullName -Raw -Encoding UTF8 | ConvertFrom-Json)[0].date
  Invoke-Native 'git add' { git -C $Clone add data/reflections.json }
  git -C $Clone diff --cached --quiet 2>$null
  if ($LASTEXITCODE -eq 0) { Write-Host 'Nada mudou, sem commit.'; return }

  if ($DryRun) {
    Write-Host "`nDryRun: commit/push pulados. Diferença:"
    git -C $Clone diff --cached --stat | Write-Host
    git -C $Clone reset -q
    return
  }
  Invoke-Native 'git commit' { git -C $Clone commit -m "W4K3 PR0T0C0L: nova reflexão $date" }
  Invoke-Native 'git push' { git -C $Clone push origin main }
  Write-Host "`nPublicado: reflexão de $date"
}
catch {
  Write-Host "`nERRO: $_"
  $Host.SetShouldExit(1)
  exit 1
}
finally {
  Write-Host "Fim $(Get-Date -Format s)"
  Stop-Transcript | Out-Null
}
