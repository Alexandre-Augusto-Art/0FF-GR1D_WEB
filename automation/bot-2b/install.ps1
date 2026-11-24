# Instala o bot da 2B neste PC (nao precisa de administrador). Passo a passo: docs/NOTIFICACOES.md
#   - Pede o token do @BotFather (so na primeira vez; -NovoToken troca) e guarda em %USERPROFILE%\.w4k3\2b\config.json
#   - Copia o bot para %USERPROFILE%\.w4k3\2b\bin (independe do branch desta pasta)
#   - Cria a tarefa "2B - Avisos", que inicia sozinha ao entrar no Windows
# Rode de novo sempre que o bot mudar no repositorio.
# Remover: Unregister-ScheduledTask -TaskName '2B - Avisos' -Confirm:$false
param([switch]$NovoToken)
$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:USERPROFILE '.w4k3\2b'
$bin = Join-Path $dir 'bin'
$cfg = Join-Path $dir 'config.json'
$node = (Get-Command node.exe -ErrorAction Stop).Source
New-Item -ItemType Directory -Force -Path $bin | Out-Null

if ($NovoToken -or -not (Test-Path $cfg)) {
  # digitado escondido: nao fica no historico do terminal
  $secure = Read-Host 'Token do bot (do @BotFather)' -AsSecureString
  $token = (New-Object System.Net.NetworkCredential('', $secure)).Password.Trim()
  if ($token -notmatch '^\d+:[\w-]{30,}$') { throw 'Token com formato inesperado (esperado 123456:ABC...)' }
  $me = (Invoke-RestMethod "https://api.telegram.org/bot$token/getMe").result.username
  if ($me -ne 'avisos_2B_bot') {
    Write-Warning "Este token e do bot @$me, mas o botao do site abre @avisos_2B_bot. Troque o link em index.html."
  }
  # o bot do W4K3 usa outro token: dois programas no mesmo token brigam pelas mensagens
  $w4k3 = Join-Path $env:USERPROFILE '.w4k3\telegram.json'
  if ((Test-Path $w4k3) -and ((Get-Content $w4k3 -Raw | ConvertFrom-Json).token -eq $token)) {
    throw 'Este e o token do bot do W4K3. Crie um bot novo para a 2B.'
  }
  [IO.File]::WriteAllText($cfg, (@{ token = $token } | ConvertTo-Json), (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "ok: @$me configurado"
}

Stop-ScheduledTask -TaskName '2B - Avisos' -ErrorAction SilentlyContinue
# se o node antigo sobreviver a tarefa, o novo sairia achando que a 2B ja esta rodando
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains((Join-Path $bin 'bot.js')) } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Copy-Item ('bot.js', 'core.js', 'messages.js' | ForEach-Object { Join-Path $PSScriptRoot $_ }) $bin -Force

$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
# conhost --headless: o node roda sem abrir janela
$action = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument "--headless `"$node`" `"$(Join-Path $bin 'bot.js')`""
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
            -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName '2B - Avisos' -Description 'Bot do Telegram da 2B: avisos de conteudo novo do site.' `
  -Action $action -Trigger (New-ScheduledTaskTrigger -AtLogOn -User $user) -Settings $settings `
  -Principal (New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited) -Force | Out-Null
Start-ScheduledTask -TaskName '2B - Avisos'
Write-Host 'ok: 2B - Avisos (rodando; inicia sozinha ao entrar no Windows). Log: %USERPROFILE%\.w4k3\2b\bot.log'
