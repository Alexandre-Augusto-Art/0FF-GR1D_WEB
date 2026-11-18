<#
  W4K3 PR0T0C0L - geração e publicação das reflexões.

  Modos:
    run-w4k3.ps1                       execução diária (Agendador, 09:00):
                                         1. se há rascunho aprovado "para as 09h" (%USERPROFILE%\.w4k3\pending.json), publica ele;
                                         2. senão, se o dia ainda não tem reflexão, monta a NOTÍCIA DO DIA: o fluxo w4k3-pauta.json
                                            lê os RSS de tecnologia e sociedade (MIT Tech Review, Nexo, Intercept, WIRED, Rest of
                                            World, The Verge, Ars Technica...) e escolhe a notícia; o w4k3-link.json escreve a
                                            análise com a lente cyberpunk/distópica. O rascunho vai para você aprovar no Telegram
                                            (sem Telegram configurado, publica direto).
    run-w4k3.ps1 -AutoPublish          12:00: se o dia ainda não tem reflexão e a notícia do dia está esperando aprovação,
                                         publica ela e avisa no Telegram.
    run-w4k3.ps1 -Pauta [-Topic "tema"] [-Another]
                                       só gera o rascunho da notícia do dia (usado pelo bot: /noticia e "Outra notícia").
                                         -Another pula as já propostas hoje. Saída: draft.json, pauta.json e "RASCUNHO|<título>".
    run-w4k3.ps1 -Pauta -Tema 7        a pauta parte do tema #7 da lista de reels (%USERPROFILE%\.w4k3\temas.json): busca notícias
                                         com as palavras do tema e escreve com o mecanismo dele como direcionamento. Sem -Topic
                                         nem -Tema, a notícia das 09h usa o 1º tema da lista, se houver.
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
  [switch]$Pauta,
  [string]$Topic,
  [string]$Tema,
  [switch]$Another,
  [switch]$AutoPublish,
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
$PautaFile = Join-Path $Base 'pauta.json'          # notícia do dia escolhida + as já recusadas hoje
$StateFile = Join-Path $Base 'telegram-state.json' # estado da conversa do bot
$Site    = 'https://alexandre-augusto-art.github.io/0FF-GR1D_WEB/w4k3-protocol.html'
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
  # o nó "Escrever (espelho direto)" faz várias chamadas à IA no processador: passa dos 300 s padrão do n8n
  $env:N8N_RUNNERS_TASK_TIMEOUT = '2400'
  Invoke-Native 'n8n import:workflow' { n8n import:workflow "--input=$(Join-Path $PSScriptRoot "n8n\workflows\$file")" } | Out-Null
  Invoke-Native 'n8n execute' { n8n execute "--id=$id" } -Quiet | Out-Null
}

# Gera o rascunho a partir de um pedido { url, direction, feedback, previousDraft }
function New-Draft($req) {
  if ($req.url -notmatch '^https?://\S+$') { throw "Link inválido: $($req.url)" }
  # exemplos de tom: as 3 últimas análises publicadas no formato de batidas (já aprovadas por você)
  $refl = Join-Path $Clone 'data\reflections.json'
  if (Test-Path $refl) {
    $ex = @(Read-List $refl | Where-Object { $_.reflection.beats } | Select-Object -First 3 |
      ForEach-Object { [ordered]@{ titulo = $_.reflection.title; batidas = @($_.reflection.beats | ForEach-Object { $_.fala }) } })
    if ($ex.Count) { $req | Add-Member -NotePropertyName examples -NotePropertyValue $ex -Force }
  }
  [IO.File]::WriteAllText((Join-Path $IO 'link.json'), ($req | ConvertTo-Json -Depth 20 -Compress), $Utf8)
  $out = Join-Path $IO 'draft.json'
  Remove-Item $out -ErrorAction SilentlyContinue
  Invoke-Workflow 'W4K3linkNoticia1' 'w4k3-link.json'
  if (-not (Test-Path $out)) { throw 'O fluxo terminou sem gravar o rascunho' }
  Copy-Item $out $Draft -Force
  $title = (Get-Content $Draft -Raw -Encoding UTF8 | ConvertFrom-Json).reflection.title
  Write-Host "RASCUNHO|$title"
}

function Today { return (Get-Date).ToString('yyyy-MM-dd') }  # o PC está no horário de Brasília
# No PowerShell 5.1 o ConvertFrom-Json devolve a lista inteira como um item só; o ForEach a desembrulha
function Read-List([string]$file) { (Get-Content $file -Raw -Encoding UTF8 | ConvertFrom-Json) | ForEach-Object { $_ } }
function Test-HasToday { $r = @(Read-List (Join-Path $Clone 'data\reflections.json')); return ($r.Count -gt 0 -and $r[0].date -eq (Today)) }
function Test-Telegram {
  $f = Join-Path $Base 'telegram.json'
  if (-not (Test-Path $f)) { return $false }
  return [bool](Get-Content $f -Raw -Encoding UTF8 | ConvertFrom-Json).chatId
}

# Notícia do dia: o fluxo de pauta escolhe as candidatas nos RSS e a primeira que der certo vira rascunho
function New-Pauta([string]$topic, [switch]$another, [string]$direction = '') {
  Wait-Internet
  Update-Clone
  $ex = @()
  if ($another -and (Test-Path $PautaFile)) {
    $prev = Get-Content $PautaFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($prev.today -eq (Today)) {
      $ex = @($prev.exclude) + @($prev.chosen.link)
      if (-not $topic) { $topic = [string]$prev.topic }
    }
  }
  $ex = @($ex | Where-Object { $_ })
  # não repete notícia que já saiu no site
  $used = @(Read-List (Join-Path $Clone 'data\reflections.json') | Select-Object -First 60 | ForEach-Object { $_.news.link } | Where-Object { $_ })
  $req = [ordered]@{ today = Today; topic = "$topic".Trim(); exclude = @($used + $ex) }
  [IO.File]::WriteAllText((Join-Path $IO 'pauta-request.json'), ($req | ConvertTo-Json -Depth 5 -Compress), $Utf8)
  $out = Join-Path $IO 'pautas.json'
  Remove-Item $out -ErrorAction SilentlyContinue
  Invoke-Workflow 'W4K3pautaDiaria1' 'w4k3-pauta.json'
  if (-not (Test-Path $out)) { throw 'O fluxo de pauta terminou sem gravar pautas.json' }
  $p = Get-Content $out -Raw -Encoding UTF8 | ConvertFrom-Json
  Write-Host "Pauta: $($p.total) notícias lidas, $(@($p.candidates).Count) candidatas"
  # o direcionamento do tema só vale se a notícia for sobre ele (sem notícia do tema, a pauta é geral)
  if (-not $p.matched) { $direction = '' }
  $last = $null
  foreach ($c in @($p.candidates | Select-Object -First 3)) {
    Write-Host "Candidata ($($c.score)): $($c.title) [$($c.source)]"
    try {
      # fallback: se a página tiver paywall ou bloquear robôs, a análise usa o texto que veio no RSS
      $fb = [ordered]@{ title = $c.title; summary = $c.summary; text = $c.text; source = $c.source; publishedDate = $c.publishedDate }
      New-Draft ([pscustomobject]@{ url = $c.link; direction = $direction; mode = 'pauta'; fallback = $fb })
      $state = [ordered]@{ today = Today; topic = [string]$p.topic; matched = [bool]$p.matched; exclude = @($ex); chosen = $c; tema = $script:TemaId }
      [IO.File]::WriteAllText($PautaFile, ($state | ConvertTo-Json -Depth 6), $Utf8)
      return
    } catch { $last = $_; Write-Host "Não deu certo com essa: $_"; $ex += $c.link }
  }
  throw "Nenhuma das notícias candidatas virou rascunho. $last"
}

# ---------- Temas vindos de reels (automation/reels/reel-tema.js) ----------
$ReelTema = Join-Path $PSScriptRoot 'reels\reel-tema.js'
$script:TemaId = $null
function Invoke-ReelTema([string[]]$a) {
  if (-not (Test-Path $ReelTema)) { return '' }
  $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { return (& node $ReelTema @a 2>$null | Out-String).Trim() } finally { $ErrorActionPreference = $prev }
}
# Gera a pauta a partir de um tema da lista (id, ou '' para o 1º da fila); devolve $false se não há tema
function New-PautaTema([string]$id) {
  $l = Invoke-ReelTema (@('pegar') + @($id | Where-Object { $_ }))
  if ($l -notlike 'TEMA|*') { if ($id) { throw "Tema #$id não está na lista." }; return $false }
  $x = $l.Split('|', 4)
  $script:TemaId = $x[1]
  Write-Host "Tema #$($x[1]) da lista de reels: busca `"$($x[2])`""
  New-Pauta $x[2] -direction $x[3]
  # achou notícia sobre o tema: sai da fila; não achou: continua lá para outro dia
  $p = Get-Content $PautaFile -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($p.matched) { Invoke-ReelTema @('usado', $x[1]) | Out-Null } else { Write-Host 'Nenhuma notícia recente sobre o tema; ele continua na lista.' }
  return $true
}

# Manda o rascunho da notícia do dia para aprovação (o bot cuida da conversa a partir daí)
function Send-DailyDraft {
  $tg = Join-Path $PSScriptRoot 'telegram-w4k3.ps1'
  Invoke-Native 'Telegram: rascunho do dia' { powershell.exe -NoProfile -ExecutionPolicy Bypass -File $tg -AnnounceDaily } | Out-Null
}

# Commit + push de data/reflections.json do clone
function Push-Reflections([string]$message) {
  Invoke-Native 'validate.js' { node (Join-Path $Clone 'automation\validate.js') } | Out-Null
  $first = (Get-Content (Join-Path $Clone 'data\reflections.json') -Raw -Encoding UTF8 | ConvertFrom-Json)[0]
  Invoke-Native 'git add' { git -C $Clone add data/reflections.json } | Out-Null
  if (Test-Path (Join-Path $Clone 'assets\videos\w4k3')) { Invoke-Native 'git add (vídeo)' { git -C $Clone add assets/videos/w4k3 } | Out-Null }
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
  # vídeo desta versão (se existir) vai junto, comprimido para a web; sem vídeo, publica só o texto
  $vs = Join-Path $PSScriptRoot 'video-site.js'
  if (Test-Path $vs) {
    try { Invoke-Native 'vídeo para o site' { node $vs $file $Clone } | Out-Null }
    catch { Write-Host "Vídeo não foi para o site: $_" }
  }
  Push-Reflections $message
}

try {
  Write-Host "W4K3 PR0T0C0L - início $(Get-Date -Format s)  Request=$Request Publish=$Publish Url=$Url DryRun=$DryRun"

  if ($Pauta -and $Tema) {
    New-PautaTema $Tema | Out-Null
  }
  elseif ($Pauta) {
    New-Pauta $Topic -another:$Another
  }
  elseif ($AutoPublish) {
    Wait-Internet
    Update-Clone
    if (Test-HasToday) { Write-Host "Já existe reflexão de $(Today), nada a fazer."; return }
    $st = if (Test-Path $StateFile) { Get-Content $StateFile -Raw -Encoding UTF8 | ConvertFrom-Json } else { $null }
    if (-not $st -or -not $st.daily -or ($st.stage -notin @('review', 'confirm')) -or -not (Test-Path $Draft)) {
      Write-Host 'Nenhuma notícia do dia esperando aprovação (descartada, em ajuste ou não gerada).'; return
    }
    $d = Get-Content $Draft -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($d.date -ne (Today)) { Write-Host "O rascunho é de $($d.date), não de hoje."; return }
    Publish-Draft $Draft 'W4K3 PR0T0C0L: notícia do dia (12h)'
    if (-not $DryRun) {
      [IO.File]::WriteAllText($StateFile, (@{ stage = 'idle'; url = $null; direction = $null } | ConvertTo-Json), $Utf8)
      Remove-Item $Draft -ErrorAction SilentlyContinue
      Send-Telegram "⏰ Sem resposta até as 12:00, publiquei a notícia do dia:`n$($d.reflection.title)`n`n$Site"
    }
  }
  elseif ($Request) {
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
      Send-Telegram "Publicado no horário padrão: $title`n$Site"
    }
  }
  else {
    Wait-Internet
    Update-Clone
    if ((Test-HasToday) -and -not $Force) { Write-Host "Já existe reflexão de $(Today), nada a fazer (use -Force)."; return }
    if (-not (New-PautaTema '')) { New-Pauta '' }
    if (Test-Telegram) {
      Send-DailyDraft
    } else {
      Write-Host 'Telegram não configurado: publicando direto.'
      Publish-Draft $Draft 'W4K3 PR0T0C0L: notícia do dia'
    }
  }
}
catch {
  Write-Host "`nERRO: $_"
  if ($AutoPublish) { Send-Telegram "W4K3: a publicação das 12h falhou. $_" }
  elseif (-not $Pauta -and -not $Request -and -not $Publish -and -not $Url) { Send-Telegram "W4K3: a notícia do dia (09h) falhou. $_" }
  $Host.SetShouldExit(1)
  exit 1
}
finally {
  if ($mutex) { try { $mutex.ReleaseMutex() } catch {} }
  Write-Host "Fim $(Get-Date -Format s)"
  Stop-Transcript | Out-Null
}
