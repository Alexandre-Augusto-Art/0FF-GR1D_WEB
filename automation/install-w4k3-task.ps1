<#
  Instala a automação diária do W4K3 PR0T0C0L neste PC (não precisa de administrador).

  - Copia run-w4k3.ps1 e o fluxo n8n para %USERPROFILE%\.w4k3\bin (cópia estável, independente
    do branch em que esta pasta estiver).
  - Cria as tarefas no Agendador de Tarefas do Windows:
      "W4K3 - Acordar PC 08h50"  todo dia 08:50, acorda o PC (suspensão/hibernação) e o mantém ligado
      "W4K3 - Gerador 09h"       todo dia 09:00, escolhe a notícia do dia, escreve a análise e manda para aprovar
                                 no Telegram; se o PC estava desligado, roda assim que você entrar no Windows
      "W4K3 - Noticia 12h"       todo dia 12:00, publica a notícia do dia se você não respondeu
      "W4K3 - Motivacao 09h10"   todo dia 09:10, escolhe a frase da Motivação Diária e manda para aprovar no Telegram
      "W4K3 - Motivacao 12h"     todo dia 12:00, publica a frase proposta se você não respondeu
      "W4K3 - Telegram"          (opcional) ao entrar no Windows, fica ouvindo links e comandos mandados ao seu bot
  - Copia o projeto de vídeo (video\) para %USERPROFILE%\.w4k3\video, instala as dependências e a voz
    Chatterbox pt-BR (com a Piper de reserva) em %USERPROFILE%\.w4k3\tts: o bot manda um vídeo narrado de cada rascunho.
  - Instala yt-dlp e faster-whisper em %USERPROFILE%\.w4k3\reels: reels mandados ao bot viram temas
    para edições futuras (automation\reels\reel-tema.js).
  Rode de novo sempre que mudar o fluxo, o script ou o vídeo.

  Telegram (uma vez): no Telegram, fale com @BotFather → /newbot → copie o token e rode
    powershell -ExecutionPolicy Bypass -File automation\install-w4k3-task.ps1 -TelegramToken "<token>"
  Depois mande qualquer mensagem ao seu bot: esse chat vira o dono.

  Para remover:
    Unregister-ScheduledTask -TaskName 'W4K3 - Acordar PC 08h50','W4K3 - Gerador 09h','W4K3 - Noticia 12h','W4K3 - Motivacao 09h10','W4K3 - Motivacao 12h','W4K3 - Telegram' -Confirm:$false
#>
param([string]$TelegramToken)
$ErrorActionPreference = 'Stop'
$bin = Join-Path $env:USERPROFILE '.w4k3\bin'
New-Item -ItemType Directory -Force -Path (Join-Path $bin 'n8n\workflows'), (Join-Path $bin 'motivacao') | Out-Null
Copy-Item ('run-w4k3.ps1', 'run-motivacao.ps1', 'telegram-w4k3.ps1', 'publish-entry.js', 'video-site.js', 'validators.js' | ForEach-Object { Join-Path $PSScriptRoot $_ }) $bin -Force
Copy-Item (Join-Path $PSScriptRoot 'n8n\workflows\*.json') (Join-Path $bin 'n8n\workflows') -Force
Copy-Item (Join-Path $PSScriptRoot 'motivacao\frases.json') (Join-Path $bin 'motivacao') -Force
$script = Join-Path $bin 'run-w4k3.ps1'

# ---- Vídeo da análise: projeto Remotion (video\) + voz Chatterbox/Piper, tudo neste PC ----
$videoSrc = Join-Path (Split-Path $PSScriptRoot -Parent) 'video'
$videoDst = Join-Path $env:USERPROFILE '.w4k3\video'
if ((Test-Path $videoSrc) -and (Get-Command node.exe -ErrorAction SilentlyContinue) -and
    (Get-Command ffmpeg.exe -ErrorAction SilentlyContinue) -and (Get-Command python.exe -ErrorAction SilentlyContinue)) {
  New-Item -ItemType Directory -Force -Path $videoDst | Out-Null
  $lock = Join-Path $videoDst 'package-lock.json'
  $npm = -not (Test-Path (Join-Path $videoDst 'node_modules')) -or -not (Test-Path $lock) -or
         ((Get-FileHash $lock).Hash -ne (Get-FileHash (Join-Path $videoSrc 'package-lock.json')).Hash)
  Copy-Item (Join-Path $videoSrc 'src'), (Join-Path $videoSrc 'scripts'), (Join-Path $videoSrc 'voz') $videoDst -Recurse -Force
  Copy-Item (Join-Path $videoSrc 'package.json'), (Join-Path $videoSrc 'package-lock.json') $videoDst -Force
  if ($npm) {
    Push-Location $videoDst
    & npm.cmd ci --no-audit --no-fund
    & node.exe node_modules\@remotion\cli\remotion-cli.js browser ensure
    Pop-Location
  }
  $tts = Join-Path $env:USERPROFILE '.w4k3\tts'
  $py = Join-Path $tts 'venv\Scripts\python.exe'
  if (-not (Test-Path $py)) {
    New-Item -ItemType Directory -Force -Path $tts | Out-Null
    & python.exe -m venv (Join-Path $tts 'venv')
    & $py -m pip install -q piper-tts
  }
  foreach ($ext in 'onnx', 'onnx.json') {
    $f = Join-Path $tts "pt_BR-faber-medium.$ext"
    if (-not (Test-Path $f)) {
      Invoke-WebRequest "https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/faber/medium/pt_BR-faber-medium.$ext" -OutFile $f -UseBasicParsing
    }
  }
  # voz expressiva: Chatterbox pt-BR (MIT) e Supertonic 3 (OpenRAIL-M), ~5 GB, só na primeira vez
  $chat = Join-Path $tts 'chatterbox'
  $cpy = Join-Path $chat 'venv\Scripts\python.exe'
  if (-not (Test-Path $cpy)) {
    New-Item -ItemType Directory -Force -Path $chat | Out-Null
    & python.exe -m venv (Join-Path $chat 'venv')
    & $cpy -m pip install -q --disable-pip-version-check chatterbox-tts==0.1.7 supertonic==1.3.1 'setuptools<81'
  }
  if (Test-Path $cpy) {
    $hf = 'https://huggingface.co'
    $arqs = @()
    foreach ($a in 't3_pt_br.safetensors', 's3gen_v3.safetensors', 'grapheme_mtl_merged_expanded_v1.json') { $arqs += , @("$hf/ResembleAI/Chatterbox-Multilingual-pt-br/resolve/main/$a", "modelo\$a") }
    $arqs += , @("$hf/ResembleAI/chatterbox/resolve/main/ve.safetensors", 'modelo\ve.safetensors')
    foreach ($a in 'onnx/duration_predictor.onnx', 'onnx/text_encoder.onnx', 'onnx/vector_estimator.onnx', 'onnx/vocoder.onnx', 'onnx/tts.json', 'onnx/unicode_indexer.json', 'voice_styles/F3.json', 'config.json') {
      $arqs += , @("$hf/Supertone/supertonic-3/resolve/main/$a", ('supertonic-3\' + $a.Replace('/', '\')))
    }
    foreach ($par in $arqs) {
      $f = Join-Path $chat $par[1]
      if (Test-Path $f) { continue }
      New-Item -ItemType Directory -Force -Path (Split-Path $f) | Out-Null
      Write-Host "baixando $($par[1])..."
      & curl.exe -sSfL -o "$f.parcial" $par[0]
      if ($LASTEXITCODE -eq 0) { Move-Item "$f.parcial" $f -Force } else { Write-Host "  falhou: o vídeo usa a Piper até baixar" }
    }
  }
  # ilustrações: SD-Turbo (Stability AI Community License), ~2,7 GB, só na primeira vez; sem ele o vídeo sai só com cenas desenhadas
  $img = Join-Path $env:USERPROFILE '.w4k3\imagem'
  $ipy = Join-Path $img 'venv\Scripts\python.exe'
  if (-not (Test-Path $ipy)) {
    New-Item -ItemType Directory -Force -Path $img | Out-Null
    & python.exe -m venv (Join-Path $img 'venv')
    & $ipy -m pip install -q --disable-pip-version-check torch==2.6.0 diffusers==0.35.2 'transformers<5' accelerate safetensors pillow
  }
  if (Test-Path $ipy) {
    $arqs = 'model_index.json', 'LICENSE.md', 'scheduler/scheduler_config.json', 'tokenizer/merges.txt', 'tokenizer/special_tokens_map.json', 'tokenizer/tokenizer_config.json', 'tokenizer/vocab.json',
            'text_encoder/config.json', 'text_encoder/model.fp16.safetensors', 'unet/config.json', 'unet/diffusion_pytorch_model.fp16.safetensors', 'vae/config.json', 'vae/diffusion_pytorch_model.fp16.safetensors'
    foreach ($a in $arqs) {
      $f = Join-Path $img ('sd-turbo' + $a.Replace('/', ''))
      if (Test-Path $f) { continue }
      New-Item -ItemType Directory -Force -Path (Split-Path $f) | Out-Null
      Write-Host "baixando sd-turbo/$a..."
      & curl.exe -sSfL -o "$f.parcial" "https://huggingface.co/stabilityai/sd-turbo/resolve/main/$a"
      if ($LASTEXITCODE -eq 0) { Move-Item "$f.parcial" $f -Force } else { Write-Host '  falhou: o vídeo sai sem ilustrações até baixar' }
    }
  }
  Write-Host 'ok: vídeo da análise (Remotion + Chatterbox/Piper em %USERPROFILE%\.w4k3)'
} else {
  Write-Host 'vídeo: pulado (precisa de node, ffmpeg e python no PATH)'
}

# ---- Temas a partir de reels: yt-dlp (download sem login) + faster-whisper (transcrição), neste PC ----
# modelo que escreve a denúncia (~15 GB, só na primeira vez)
if ((Get-Command ollama.exe -ErrorAction SilentlyContinue) -and -not ((& ollama.exe list 2>$null) -match 'gemma4:26b-a4b-it-qat')) {
  Write-Host 'baixando o modelo de escrita gemma4:26b-a4b-it-qat (~15 GB)...'
  & ollama.exe pull gemma4:26b-a4b-it-qat
}
New-Item -ItemType Directory -Force -Path (Join-Path $bin 'reels'), (Join-Path $bin 'n8n\code') | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'reels\*') (Join-Path $bin 'reels') -Include '*.js', '*.py' -Force
Remove-Item (Join-Path $bin 'n8n\code\escrever-espelho.js') -ErrorAction SilentlyContinue  # formato antigo
Copy-Item (Join-Path $PSScriptRoot 'n8n\code\*.js') (Join-Path $bin 'n8n\code') -Force
if (Get-Command python.exe -ErrorAction SilentlyContinue) {
  $reels = Join-Path $env:USERPROFILE '.w4k3\reels'
  $rpy = Join-Path $reels 'venv\Scripts\python.exe'
  if (-not (Test-Path $rpy)) {
    New-Item -ItemType Directory -Force -Path $reels | Out-Null
    & python.exe -m venv (Join-Path $reels 'venv')
    & $rpy -m pip install -q --disable-pip-version-check faster-whisper
  }
  # o Instagram muda com frequência e o yt-dlp acompanha: atualiza a cada instalação
  & $rpy -m pip install -q --disable-pip-version-check -U yt-dlp
  # modelo de visão para ler o texto e entender as imagens dos posts (~6 GB, só na primeira vez)
  if ((Get-Command ollama.exe -ErrorAction SilentlyContinue) -and -not ((& ollama.exe list 2>$null) -match 'qwen2\.5vl:7b')) {
    Write-Host 'baixando o modelo de visão qwen2.5vl:7b (~6 GB)...'
    & ollama.exe pull qwen2.5vl:7b
  }
  Write-Host 'ok: temas a partir de reels (yt-dlp + faster-whisper em %USERPROFILE%\.w4k3\reels)'
} else {
  Write-Host 'reels: pulado (precisa de python no PATH)'
}

$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited

function New-W4K3Task($name, $time, $extra, $limit, $desc, $file = $script) {
  $action  = New-ScheduledTaskAction -Execute 'powershell.exe' `
             -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$file`" $extra"
  # primeiro disparo no próximo horário: com -StartWhenAvailable, um horário que já passou hoje
  # faria a tarefa rodar logo ao instalar (ex.: a das 12h publicaria sem você aprovar)
  $at = (Get-Date).Date.Add([TimeSpan]::Parse($time))
  if ($at -le (Get-Date)) { $at = $at.AddDays(1) }
  $trigger = New-ScheduledTaskTrigger -Daily -At $at
  $settings = New-ScheduledTaskSettingsSet -WakeToRun -StartWhenAvailable -AllowStartIfOnBatteries `
              -DontStopIfGoingOnBatteries -ExecutionTimeLimit $limit -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $name -Description $desc -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal -Force | Out-Null
  Write-Host "ok: $name ($time)"
}

New-W4K3Task 'W4K3 - Acordar PC 08h50' '08:50' '-KeepAwakeMinutes 15' (New-TimeSpan -Minutes 20) `
  'Acorda o PC às 08:50 e o mantém ligado até o gerador W4K3 das 09:00.'
New-W4K3Task 'W4K3 - Gerador 09h' '09:00' '' (New-TimeSpan -Hours 1) `
  'Notícia do dia do W4K3 PR0T0C0L: RSS de tecnologia e sociedade + análise (n8n + Ollama), enviada para aprovação no Telegram. Log em %USERPROFILE%\.w4k3\logs.'
New-W4K3Task 'W4K3 - Noticia 12h' '12:00' '-AutoPublish' (New-TimeSpan -Minutes 45) `
  'Publica a notícia do dia do W4K3 se ela não foi aprovada nem descartada até o meio-dia.'
$mot = Join-Path $bin 'run-motivacao.ps1'
New-W4K3Task 'W4K3 - Motivacao 09h10' '09:10' '' (New-TimeSpan -Minutes 45) `
  'Escolhe a frase da Motivação Diária (n8n + Ollama) e manda para aprovação no Telegram.' $mot
New-W4K3Task 'W4K3 - Motivacao 12h' '12:00' '-AutoPublish' (New-TimeSpan -Minutes 45) `
  'Publica a frase proposta da Motivação Diária se ela não foi aprovada até o meio-dia.' $mot

# o fluxo antigo (RSS de IA publicando sem revisão) foi substituído pela pauta do dia
Remove-Item (Join-Path $bin 'n8n\workflows\w4k3-gerador.json') -ErrorAction SilentlyContinue

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
