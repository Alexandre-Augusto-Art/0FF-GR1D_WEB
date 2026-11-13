<#
  Instala a automação diária do W4K3 PR0T0C0L neste PC (não precisa de administrador).

  - Copia run-w4k3.ps1 e o fluxo n8n para %USERPROFILE%\.w4k3\bin (cópia estável, independente
    do branch em que esta pasta estiver).
  - Cria duas tarefas no Agendador de Tarefas do Windows:
      "W4K3 - Acordar PC 08h50"  todo dia 08:50, acorda o PC (suspensão/hibernação) e o mantém ligado
      "W4K3 - Gerador 09h"       todo dia 09:00, roda o fluxo e publica; se o PC estava desligado,
                                 roda assim que você entrar no Windows
      "W4K3 - Motivacao 09h10"   todo dia 09:10, escolhe a frase da Motivação Diária e manda para aprovar no Telegram
      "W4K3 - Motivacao 12h"     todo dia 12:00, publica a frase proposta se você não respondeu
      "W4K3 - Telegram"          (opcional) ao entrar no Windows, fica ouvindo links e comandos mandados ao seu bot
  Rode de novo sempre que mudar o fluxo ou o script.

  Telegram (uma vez): no Telegram, fale com @BotFather → /newbot → copie o token e rode
    powershell -ExecutionPolicy Bypass -File automation\install-w4k3-task.ps1 -TelegramToken "<token>"
  Depois mande qualquer mensagem ao seu bot: esse chat vira o dono.

  Para remover:
    Unregister-ScheduledTask -TaskName 'W4K3 - Acordar PC 08h50','W4K3 - Gerador 09h','W4K3 - Motivacao 09h10','W4K3 - Motivacao 12h','W4K3 - Telegram' -Confirm:$false
#>
param([string]$TelegramToken)
$ErrorActionPreference = 'Stop'
$bin = Join-Path $env:USERPROFILE '.w4k3\bin'
New-Item -ItemType Directory -Force -Path (Join-Path $bin 'n8n\workflows'), (Join-Path $bin 'motivacao') | Out-Null
Copy-Item ('run-w4k3.ps1', 'run-motivacao.ps1', 'telegram-w4k3.ps1', 'publish-entry.js', 'validators.js' | ForEach-Object { Join-Path $PSScriptRoot $_ }) $bin -Force
Copy-Item (Join-Path $PSScriptRoot 'n8n\workflows\*.json') (Join-Path $bin 'n8n\workflows') -Force
Copy-Item (Join-Path $PSScriptRoot 'motivacao\frases.json') (Join-Path $bin 'motivacao') -Force
$script = Join-Path $bin 'run-w4k3.ps1'

$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited

function New-W4K3Task($name, $time, $extra, $limit, $desc, $file = $script) {
  $action  = New-ScheduledTaskAction -Execute 'powershell.exe' `
             -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$file`" $extra"
  $trigger = New-ScheduledTaskTrigger -Daily -At $time
  $settings = New-ScheduledTaskSettingsSet -WakeToRun -StartWhenAvailable -AllowStartIfOnBatteries `
              -DontStopIfGoingOnBatteries -ExecutionTimeLimit $limit -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $name -Description $desc -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal -Force | Out-Null
  Write-Host "ok: $name ($time)"
}

New-W4K3Task 'W4K3 - Acordar PC 08h50' '08:50' '-KeepAwakeMinutes 15' (New-TimeSpan -Minutes 20) `
  'Acorda o PC às 08:50 e o mantém ligado até o gerador W4K3 das 09:00.'
New-W4K3Task 'W4K3 - Gerador 09h' '09:00' '' (New-TimeSpan -Hours 1) `
  'Roda o fluxo n8n W4K3 PR0T0C0L e publica data/reflections.json no GitHub. Log em %USERPROFILE%\.w4k3\logs.'
$mot = Join-Path $bin 'run-motivacao.ps1'
New-W4K3Task 'W4K3 - Motivacao 09h10' '09:10' '' (New-TimeSpan -Minutes 45) `
  'Escolhe a frase da Motivação Diária (n8n + Ollama) e manda para aprovação no Telegram.' $mot
New-W4K3Task 'W4K3 - Motivacao 12h' '12:00' '-AutoPublish' (New-TimeSpan -Minutes 45) `
  'Publica a frase proposta da Motivação Diária se ela não foi aprovada até o meio-dia.' $mot

# ---- Telegram (opcional) ----
$cfgFile = Join-Path $env:USERPROFILE '.w4k3\telegram.json'
if ($TelegramToken) {
  if ($TelegramToken -notmatch '^\d+:[\w-]{30,}$') { throw 'Token do Telegram com formato inesperado (esperado 123456:ABC...)' }
  $me = Invoke-RestMethod "https://api.telegram.org/bot$TelegramToken/getMe"
  [IO.File]::WriteAllText($cfgFile, (@{ token = $TelegramToken; chatId = $null; offset = 0 } | ConvertTo-Json),
    (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "Bot @$($me.result.username) configurado. Mande uma mensagem para ele no Telegram para virar o dono."
}
if (Test-Path $cfgFile) {
  $tg = Join-Path $bin 'telegram-w4k3.ps1'
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$tg`""
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
              -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName 'W4K3 - Telegram' -Description 'Bot do Telegram: reflexões W4K3 a partir de links e aprovação da Motivação Diária.' `
    -Action $action -Trigger (New-ScheduledTaskTrigger -AtLogOn -User $user) -Settings $settings -Principal $principal -Force | Out-Null
  Stop-ScheduledTask -TaskName 'W4K3 - Telegram' -ErrorAction SilentlyContinue
  Start-ScheduledTask -TaskName 'W4K3 - Telegram'
  Write-Host 'ok: W4K3 - Telegram (rodando; inicia sozinho ao entrar no Windows)'
}
