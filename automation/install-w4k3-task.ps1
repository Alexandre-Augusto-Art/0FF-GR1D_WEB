<#
  Instala a automação diária do W4K3 PR0T0C0L neste PC (não precisa de administrador).

  - Copia run-w4k3.ps1 e o fluxo n8n para %USERPROFILE%\.w4k3\bin (cópia estável, independente
    do branch em que esta pasta estiver).
  - Cria duas tarefas no Agendador de Tarefas do Windows:
      "W4K3 - Acordar PC 08h50"  todo dia 08:50, acorda o PC (suspensão/hibernação) e o mantém ligado
      "W4K3 - Gerador 09h"       todo dia 09:00, roda o fluxo e publica; se o PC estava desligado,
                                 roda assim que você entrar no Windows
  Rode de novo sempre que mudar o fluxo ou o script. Para remover:
    Unregister-ScheduledTask -TaskName 'W4K3 - Acordar PC 08h50','W4K3 - Gerador 09h' -Confirm:$false
#>
$ErrorActionPreference = 'Stop'
$bin = Join-Path $env:USERPROFILE '.w4k3\bin'
New-Item -ItemType Directory -Force -Path (Join-Path $bin 'n8n\workflows') | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'run-w4k3.ps1') $bin -Force
Copy-Item (Join-Path $PSScriptRoot 'n8n\workflows\w4k3-gerador.json') (Join-Path $bin 'n8n\workflows') -Force
$script = Join-Path $bin 'run-w4k3.ps1'

$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited

function New-W4K3Task($name, $time, $extra, $limit, $desc) {
  $action  = New-ScheduledTaskAction -Execute 'powershell.exe' `
             -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`" $extra"
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
