<#
  0FF-GR1D_WEB - bot do Telegram do projeto (W4K3 PR0T0C0L e Motivação Diária), com revisão antes de publicar.

  Conversa:
    1. Você manda o link da notícia e, na mesma mensagem, o direcionamento (o que quer que ele fale).
    2. O bot lê a matéria, escreve a reflexão e devolve o RASCUNHO para você ler.
    3. Você responde com ajustes (texto livre) quantas vezes quiser; ele reescreve a cada vez.
    4. Quando estiver bom: botão "Aprovar" (ou responda "ok").
    5. Ele pergunta: "Publicar agora" ou "No horário padrão (09:00)".
  Comandos: /cancelar descarta o rascunho, /status mostra o que está em andamento, /ajuda.
  Mandar um link novo começa outro rascunho (o anterior é descartado).

  NOTÍCIA DO DIA: às 09:00 o run-w4k3.ps1 escolhe uma notícia real nos RSS de tecnologia e sociedade,
  escreve a análise com a lente cyberpunk/distópica e chama este script com -AnnounceDaily, que manda
  o rascunho aqui: [✅ Publicar agora] [✏️ Sugerir mudanças] [🔄 Outra notícia] [🗑 Descartar]. Ajustes por texto livre,
  como num link. Sem resposta até as 12:00, o run-w4k3.ps1 -AutoPublish publica.
  /noticia [tema]  gera a notícia do dia na hora (ex.: /noticia vigilância).

  VÍDEO: a cada rascunho novo, Start-Video roda %USERPROFILE%\.w4k3\video\scripts\gerar.js em segundo plano
  (voz Piper + Remotion, só neste PC, ~2 min para 1 min de vídeo) e ele manda o vídeo aqui quando fica pronto.
  Ajuste, outra notícia, link novo ou descarte interrompem o vídeo em andamento. Log em logs\video.log.

  Roda neste PC por long polling (sem IP público nem webhook). Com o PC dormindo, as mensagens
  esperam no Telegram (até 24 h). Configuração: install-w4k3-task.ps1 -TelegramToken "<token>".
  O token fica só em %USERPROFILE%\.w4k3\telegram.json. O primeiro chat que falar com o bot vira o dono.
#>
param([switch]$AnnounceDaily)  # só manda o rascunho da notícia do dia e sai (chamado pelo run-w4k3.ps1)
$ErrorActionPreference = 'Stop'
$Base      = Join-Path $env:USERPROFILE '.w4k3'
$CfgFile   = Join-Path $Base 'telegram.json'
$StateFile = Join-Path $Base 'telegram-state.json'
$Draft     = Join-Path $Base 'draft.json'
$Pending   = Join-Path $Base 'pending.json'
$PautaFile = Join-Path $Base 'pauta.json'
$Runner    = Join-Path $PSScriptRoot 'run-w4k3.ps1'
$Site      = 'https://alexandre-augusto-art.github.io/0FF-GR1D_WEB/w4k3-protocol.html'
# Motivação Diária (mesmo bot)
$MotRunner   = Join-Path $PSScriptRoot 'run-motivacao.ps1'
$MotProposal = Join-Path $Base 'motivacao-proposal.json'
$MotSite     = 'https://alexandre-augusto-art.github.io/0FF-GR1D_WEB/motivacao.html'
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

$BtnReview  = @(@(@{ text = '✅ Aprovar'; callback_data = 'approve' }, @{ text = '✏️ Sugerir mudanças'; callback_data = 'suggest' }),
                @(@{ text = '🗑 Descartar'; callback_data = 'cancel' }))
$BtnDaily   = @(@(@{ text = '✅ Publicar agora'; callback_data = 'now' }, @{ text = '✏️ Sugerir mudanças'; callback_data = 'suggest' }),
                @(@{ text = '🔄 Outra notícia'; callback_data = 'pauta_new' }, @{ text = '🗑 Descartar'; callback_data = 'cancel' }))
$SuggestHelp = "✏️ Escreva aqui o que você quer mudar, do jeito que falaria com uma pessoa. Exemplos:`n• mais curto / mais direto`n• compare com Jogos Vorazes em vez de Watch Dogs`n• foque nos trabalhadores, não na empresa`n• troque o título`n• tom mais irônico`n`nEu reescrevo e te mando a nova versão para aprovar."
$BtnPublish = @(, @(@{ text = '🚀 Publicar agora'; callback_data = 'now' }, @{ text = '⏰ No horário padrão (09:00)'; callback_data = 'at9' }))

function Next9h {
  $n = (Get-Date).Date.AddHours(9)
  if ((Get-Date) -ge $n) { $n = $n.AddDays(1) }
  return $n
}

# ---------- Vídeo da análise (video\scripts\gerar.js: Piper + Remotion, só neste PC) ----------
$VideoDir = Join-Path $Base 'video'
$VideoPid = Join-Path $Base 'video.pid'
function Stop-Video {
  if (-not (Test-Path $VideoPid)) { return }
  $old = (Get-Content $VideoPid -Raw).Trim()
  if ($old -and (Get-Process -Id $old -ErrorAction SilentlyContinue)) {
    # /T derruba junto o Chrome do Remotion e o FFmpeg
    Start-Process taskkill.exe -ArgumentList "/PID $old /T /F" -WindowStyle Hidden -Wait
    Log "video: job $old interrompido"
  }
  Remove-Item $VideoPid -ErrorAction SilentlyContinue
}
# Gera o vídeo do rascunho atual em segundo plano; quando fica pronto, ele mesmo manda no Telegram
function Start-Video {
  $gerar = Join-Path $VideoDir 'scripts\gerar.js'
  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not (Test-Path $gerar) -or -not $node -or -not (Test-Path (Join-Path $VideoDir 'node_modules'))) { return $false }
  Stop-Video
  $log = Join-Path $Base 'logs\video.log'
  $p = Start-Process -FilePath $node.Source -ArgumentList @("`"$gerar`"", "`"$Draft`"", '--telegram') -WorkingDirectory $VideoDir `
       -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError "$log.err" -PassThru
  [IO.File]::WriteAllText($VideoPid, "$($p.Id)")
  Log "video: job $($p.Id) iniciado"
  return $true
}

function Show-Draft([switch]$daily) {
  $d = Get-Content $Draft -Raw -Encoding UTF8 | ConvertFrom-Json
  $body = [string]$d.reflection.content
  $body = $body -replace '(?i)</p>\s*', "`n`n" -replace '(?i)<br\s*/?>', "`n" -replace '<[^>]+>', ''
  $body = [System.Net.WebUtility]::HtmlDecode($body).Trim()
  $words = ($body -split '\s+').Count
  $head = if ($daily) { '📰 NOTÍCIA DO DIA (rascunho)' } else { '📝 RASCUNHO' }
  $refs = @($d.tags | Where-Object { $_ -notin 'reflexão', 'notícia', 'antisistema', 'crítica', 'notícia-do-dia', 'link-enviado' })
  $msg = "{0}`n`n{1}`n`n{2}`n`n— notícia base: {3} ({4})`n{5}" -f $head, $d.reflection.title, $body, $d.news.title, $d.news.source, $d.news.link
  if ($refs.Count) { $msg += "`n— referências: $($refs -join ', ')" }
  $esp = $d.reflection.espelho
  if ($esp) {
    $tr = @($esp.traducao | ForEach-Object { "$($_.real) = $($_.ficcao)" }) -join '; '
    $msg += "`n— espelho: $($esp.obra) ($($esp.elemento))" + $(if ($tr) { " · $tr" } else { '' })
  }
  $av = @($d.reflection.avisos | Where-Object { $_ })
  if ($av.Count) { $msg += "`n⚠️ a checagem automática ainda viu: $($av -join '; ')" }
  $msg += "`n— $words palavras"
  Send $msg
  $vid = if (Start-Video) { "`n🎬 O vídeo desta versão chega em uns 2 minutos." } else { '' }
  if ($daily) {
    $p = if (Test-Path $PautaFile) { Get-Content $PautaFile -Raw -Encoding UTF8 | ConvertFrom-Json } else { $null }
    $note = if ($p -and $p.topic -and -not $p.matched) { "(Não achei notícia recente sobre `"$($p.topic)`"; escolhi entre as gerais.$(if ($p.tema) { " O tema #$($p.tema) continua na lista." }))`n" }
            elseif ($p -and $p.tema) { "(Notícia achada a partir do tema #$($p.tema) da sua lista de reels; ele saiu da fila.)`n" } else { '' }
    Send ($note + 'Publique, sugira mudanças (ou só escreva o que quer mudar), ou peça outra notícia. Sem resposta até as 12:00, publico este.' + $vid) $BtnDaily
  } else {
    Send ('Aprove ou sugira mudanças (pode só escrever o que quer mudar):' + $vid) $BtnReview
  }
}

# Roda o run-w4k3.ps1 num processo separado e devolve @{ ok; line; err }
function Run-Runner([string[]]$runnerArgs, [string]$tag, [string]$script = $Runner) {
  $out = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script @runnerArgs 2>&1 | ForEach-Object { "$_" }
  $code = $LASTEXITCODE
  $line = $out | Where-Object { $_ -like "$tag|*" } | Select-Object -Last 1
  $err = $out | Where-Object { $_ -like '*ERRO:*' } | Select-Object -Last 1
  if (-not $err) { $err = "código $code" }
  Log "runner $($runnerArgs -join ' ') -> $code $line $err"
  return @{ ok = ($code -eq 0 -and $line); line = $line; err = $err }
}

function Make-Draft($state, [string]$feedback) {
  Stop-Video  # o vídeo da versão anterior ficaria velho, e libera o processador para a IA
  $req = @{ url = $state.url; direction = $state.direction }
  if ($state.daily -and (Test-Path $PautaFile)) {
    # notícia do dia: mantém a tag e o texto do RSS (para matérias com paywall)
    $c = (Get-Content $PautaFile -Raw -Encoding UTF8 | ConvertFrom-Json).chosen
    $req.mode = 'pauta'
    $req.fallback = @{ title = $c.title; summary = $c.summary; text = $c.text; source = $c.source; publishedDate = $c.publishedDate }
  }
  if ($feedback -and (Test-Path $Draft)) {
    $req.feedback = $feedback
    $req.previousDraft = Get-Content $Draft -Raw -Encoding UTF8 | ConvertFrom-Json
  }
  $reqFile = Join-Path $Base 'request.json'
  [IO.File]::WriteAllText($reqFile, ($req | ConvertTo-Json -Depth 20), $Utf8)
  $r = Run-Runner @('-Request', $reqFile) 'RASCUNHO'
  if ($r.ok) { $state.stage = 'review'; Save-State $state; Show-Draft -daily:([bool]$state.daily) }
  else {
    Send "Não consegui gerar o rascunho. $($r.err)`nMande o link de novo ou outro link."
    if (-not $feedback) { $state.stage = 'idle'; Save-State $state }
  }
}

# ---------- Notícia do dia ----------
function Set-DailyState {
  $d = Get-Content $Draft -Raw -Encoding UTF8 | ConvertFrom-Json
  $s = [pscustomobject]@{ stage = 'review'; url = $d.news.link; direction = $null; daily = $true }
  Save-State $s
  return $s
}

# ---------- Temas vindos de reels (reels\reel-tema.js: baixa, transcreve e analisa em segundo plano) ----------
$ReelTema = Join-Path $PSScriptRoot 'reels\reel-tema.js'
function Invoke-ReelTema([string[]]$a) {
  if (-not (Test-Path $ReelTema)) { return 'Os temas de reels não estão instalados (rode install-w4k3-task.ps1).' }
  $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { return (& node $ReelTema @a 2>&1 | ForEach-Object { "$_" } | Out-String).Trim() } finally { $ErrorActionPreference = $prev }
}
function Add-Reel([string]$kind, [string]$ref, [string]$comment, [string]$group) {
  $a = @($kind, $ref)
  if ($kind -eq 'add-foto') { $a += $(if ($group) { $group } else { '-' }) }
  $comment = ($comment -replace '"', "'").Trim()
  if ($comment) { $a += $comment }
  $r = Invoke-ReelTema $a
  if ($r -match 'FILA\|(-?\d+)') {
    $n = [int]$Matches[1]
    if ($n -lt 0) { return }  # outra foto do mesmo álbum: já avisei na primeira
    $fila = if ($n -gt 1) { " ($n na fila)" } else { '' }
    $o = if ($kind -eq 'add-foto') { 'a imagem' } elseif ($kind -eq 'add-arquivo') { 'o vídeo' } elseif ($ref -match '/(reel|reels|tv)/|tiktok|shorts') { 'o reel' } else { 'o post' }
    $tempo = if ($kind -eq 'add-foto' -or $o -eq 'o post') { 'post de imagens leva uns 1 a 2 minutos por imagem' } else { 'uns 3 minutos' }
    Send "📥 Recebi $o$fila. Vou ler, transcrever e analisar neste PC ($tempo) e te aviso quando virar tema. Pode continuar mandando."
  } else { Send "Não consegui pôr na fila. $r" }
}

function Make-Pauta([string]$topic, [switch]$another, [string]$tema) {
  $a = @('-Pauta')
  $topic = ($topic -replace '"', '').Trim()
  if ($tema) { $a += @('-Tema', $tema) }
  elseif ($topic) { $a += @('-Topic', $topic) }
  if ($another) { $a += '-Another' }
  Stop-Video
  Save-State ([pscustomobject]@{ stage = 'drafting'; url = $null; direction = $null; daily = $true })
  $r = Run-Runner $a 'RASCUNHO'
  if ($r.ok) { Set-DailyState | Out-Null; Show-Draft -daily }
  else {
    Save-State ([pscustomobject]@{ stage = 'idle'; url = $null; direction = $null })
    Send "Não consegui montar a notícia do dia. $($r.err)`nTente de novo: /noticia"
  }
}

function Publish-Now($state) {
  Send 'Publicando...'
  $snap = Join-Path $Base 'approved.json'
  Copy-Item $Draft $snap -Force
  $r = Run-Runner @('-Publish', $snap) 'RESULTADO'
  if ($r.ok) {
    $p = $r.line.Split('|')
    Send "🚀 Publicado ($($p[1])): $($p[2])`n`nNo site em 1 ou 2 minutos:`n$Site"
    Save-State ([pscustomobject]@{ stage = 'idle'; url = $null; direction = $null })
    Remove-Item $Draft -ErrorAction SilentlyContinue
  } else {
    $btn = if ($state.daily) { $BtnDaily } else { $BtnPublish }
    Send "Não consegui publicar. $($r.err)`nTente de novo: 'agora' ou o botão." $btn
  }
}

# ---------- Motivação Diária ----------
$BtnMot = @(, @(@{ text = '✅ Publicar agora'; callback_data = 'mot_ok' }, @{ text = '🔄 Outra'; callback_data = 'mot_new' }))

function Show-Mot {
  $p = Get-Content $MotProposal -Raw -Encoding UTF8 | ConvertFrom-Json
  $msg = "💬 MOTIVAÇÃO DO DIA (proposta)`n`n`"$($p.content)`"`n— $($p.author)"
  if ($p.reason) { $msg += "`n`nPor que essa: $($p.reason)" }
  if ($p.direction -and -not $p.matched -and $p.bankId) { $msg += "`n`n(Não achei nada no banco sobre `"$($p.direction)`"; escolhi entre as gerais. Se quiser uma específica, mande: frase: texto — obra)" }
  Send $msg $BtnMot
}

function Make-Mot([string]$direction, [string[]]$exclude) {
  $a = @('-Propose')
  $direction = ($direction -replace '"', '').Trim()
  if ($direction) { $a += @('-Direction', $direction) }
  $ex = @($exclude | Where-Object { $_ })
  if ($ex.Count) { $a += @('-Exclude', ($ex -join ',')) }
  $r = Run-Runner $a 'PROPOSTA' $MotRunner
  if ($r.ok) { Show-Mot } else { Send "Não consegui escolher a frase. $($r.err)`nTente de novo: /frase" }
}

function Handle-Mot([string]$t, [string]$action) {
  $low = $t.ToLowerInvariant()
  if ($action -eq 'mot_ok') {
    if (-not (Test-Path $MotProposal)) { Send 'Não há frase pendente (talvez já tenha sido publicada). /frase gera outra.'; return }
    Send 'Publicando a frase...'
    $snap = Join-Path $Base 'motivacao-approved.json'
    Copy-Item $MotProposal $snap -Force
    $r = Run-Runner @('-Publish', $snap) 'RESULTADO' $MotRunner
    if ($r.ok) {
      $p = Get-Content $snap -Raw -Encoding UTF8 | ConvertFrom-Json
      Send "🚀 Frase do dia publicada:`n`n`"$($p.content)`"`n— $($p.author)`n`nNo site em 1 ou 2 minutos:`n$MotSite"
    } else { Send "Não consegui publicar. $($r.err)" $BtnMot }
    return
  }
  if ($action -eq 'mot_new') {
    $ex = @(); $dir = ''
    if (Test-Path $MotProposal) {
      $p = Get-Content $MotProposal -Raw -Encoding UTF8 | ConvertFrom-Json
      $ex = @($p.exclude) + @($p.bankId)
      $dir = [string]$p.direction
    }
    Send 'Buscando outra (1 ou 2 minutos)...'
    Make-Mot $dir $ex
    return
  }
  # Frase enviada por você:  frase: texto — obra
  $own = [regex]::Match($t, '^(?i)(frase|motiva[cç][aã]o)\s*:\s*(.+)$', 'Singleline')
  if ($own.Success) {
    $body = $own.Groups[2].Value.Trim()
    $author = 'DEDSEC'
    $m = [regex]::Match($body, '^(.*\S)\s+[—–-]\s+([^—–]+)$', 'Singleline')
    if ($m.Success) { $body = $m.Groups[1].Value; $author = $m.Groups[2].Value.Trim() }
    $body = $body.Trim().Trim('"', '“', '”', "'").Trim()
    if ($body.Length -lt 10 -or $body.Length -gt 500) { Send 'A frase precisa ter entre 10 e 500 caracteres. Formato: frase: texto — obra'; return }
    $p = [ordered]@{ date = (Get-Date).ToString('yyyy-MM-dd'); content = $body; author = $author; reason = 'Frase enviada por você.'; exclude = @() }
    [IO.File]::WriteAllText($MotProposal, ($p | ConvertTo-Json -Depth 5), $Utf8)
    Show-Mot
    return
  }
  # /frase [tema ou obra]
  $dir = ($t -replace '^(?i)/(frase|motivacao|motivação)(@\w+)?', '').Trim()
  if ($dir) { Send "Buscando uma frase na linha de `"$dir`" (1 ou 2 minutos)..." } else { Send 'Escolhendo a frase do dia (1 ou 2 minutos)...' }
  Make-Mot $dir @()
}

function Handle([string]$text, [string]$action) {
  $state = Load-State
  $t = ($text + '').Trim()
  $low = $t.ToLowerInvariant()

  if ($low -in '/start', '/ajuda', '/help', 'ajuda') {
    Send "0FF-GR1D_WEB · bot do projeto`n`nNOTÍCIA DO DIA (W4K3)`nTodo dia às 09:00 eu escolho uma notícia real de tecnologia e sociedade (MIT Tech Review, Nexo, Intercept, WIRED, Rest of World, The Verge, Ars Technica...) e mando a análise crítica com referências de cyberpunk, Watch Dogs, V de Vingança, Jogos Vorazes, Blade Runner. Publique, toque em ✏️ Sugerir mudanças (ou só escreva o que quer mudar) ou peça outra notícia. Textos curtos, de 1 a 2 minutos de leitura. Logo depois do texto chega um vídeo narrado da análise (feito neste PC). Sem resposta até as 12:00, publico.`n/noticia  notícia do dia agora`n/noticia vigilância  uma notícia sobre esse tema`n`nW4K3 A PARTIR DE UM LINK`n1. Mande o link da notícia e, na mesma mensagem, o que você quer que eu fale sobre ela.`n   Ex.: https://... foque na precarização do trabalho e cite a resistência estudantil`n2. Eu devolvo o rascunho.`n3. Responda com ajustes quantas vezes quiser.`n4. Aprove e escolha: publicar agora ou às 09:00.`n`nTEMAS A PARTIR DE REELS E POSTS`nMande o link de um reel ou post (Instagram, TikTok ou Shorts), o próprio vídeo, ou imagens (prints, slides; um álbum vira um post só), com um comentário se quiser. Eu transcrevo a fala, leio o texto das imagens e analiso aqui no PC e guardo como tema para edições futuras (posts parecidos viram um tema só). A notícia das 09h usa o 1º da lista e busca uma notícia real sobre ele.`n/temas  a lista`nusar 3  escreve a análise do tema #3 agora`napagar 3  tira da lista`n`nMOTIVAÇÃO DIÁRIA`nTodo dia às 09:10 eu proponho uma frase (filmes, séries, jogos). Aprove ou peça outra; sem resposta até as 12:00, publico a proposta.`n/frase  proposta nova agora`n/frase jogos vorazes  uma frase nessa linha (obra, tema ou tipo)`nfrase: texto — obra  a sua própria frase`n`n/status  o que está em andamento`n/cancelar  descarta o rascunho W4K3"
    return
  }
  if ($low -in '/status', 'status') {
    $msg = "Etapa: $($state.stage)"
    if ($state.daily) { $msg += ' (notícia do dia)' }
    if ($state.url) { $msg += "`nLink: $($state.url)" }
    if (Test-Path $Pending) { $msg += "`nAgendado para $((Next9h).ToString('dd/MM HH:mm')): " + (Get-Content $Pending -Raw -Encoding UTF8 | ConvertFrom-Json).reflection.title }
    if (Test-Path $MotProposal) { $msg += "`nFrase pendente: " + (Get-Content $MotProposal -Raw -Encoding UTF8 | ConvertFrom-Json).content }
    Send $msg; return
  }
  if ($action -like 'mot_*' -or $low -match '^/(frase|motivacao|motivação)(@\w+)?(\s|$)' -or $low -match '^(frase|motiva[cç][aã]o)\s*:') {
    Handle-Mot $t $action
    return
  }
  if ($action -eq 'pauta_new' -or $low -match '^/(noticia|notícia)(@\w+)?(\s|$)') {
    $another = ($action -eq 'pauta_new')
    $topic = if ($another) { '' } else { ($t -replace '^(?i)/(noticia|notícia)(@\w+)?', '').Trim() }
    if ($another) { Send 'Buscando outra notícia e escrevendo a análise (uns 5 minutos)...' }
    elseif ($topic) { Send "Buscando uma notícia sobre `"$topic`" e escrevendo a análise (uns 5 minutos)..." }
    else { Send 'Escolhendo a notícia do dia e escrevendo a análise (uns 5 minutos)...' }
    Make-Pauta $topic -another:$another
    return
  }
  # ---- temas de reels ----
  if ($low -match '^/temas(@\w+)?$' -or $low -in 'temas', 'lista') { Send (Invoke-ReelTema @('listar')); return }
  $um = [regex]::Match($low, '^(?:usar|escrever)\s+#?(\d+)$')
  if ($action -like 'tema_usar_*' -or $um.Success) {
    $id = if ($um.Success) { $um.Groups[1].Value } else { $action -replace '^tema_usar_', '' }
    Send "Buscando notícias sobre o tema #$id e escrevendo a análise (uns 10 minutos)..."
    Make-Pauta '' -tema $id
    return
  }
  $ap = [regex]::Match($low, '^(?:apagar|remover)\s+#?(\d+)$')
  if ($action -like 'tema_apagar_*' -or $ap.Success) {
    $id = if ($ap.Success) { $ap.Groups[1].Value } else { $action -replace '^tema_apagar_', '' }
    Send (Invoke-ReelTema @('apagar', $id)); return
  }
  $rl = [regex]::Match($t, 'https?://(?:www\.|m\.)?(?:instagram\.com/(?:[\w.]+/)?(?:reel|reels|p|tv)/|tiktok\.com/|vm\.tiktok\.com/|youtube\.com/shorts/)\S*', 'IgnoreCase')
  if ($rl.Success -and -not $action) {
    Add-Reel 'add' ($rl.Value.TrimEnd('.', ',', ')', '>')) ($t.Remove($rl.Index, $rl.Length))
    return
  }

  if ($action -eq 'cancel' -or $low -in '/cancelar', 'cancelar', 'descartar') {
    Save-State ([pscustomobject]@{ stage = 'idle'; url = $null; direction = $null })
    Stop-Video
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
    Stop-Video
    Remove-Item $Draft -ErrorAction SilentlyContinue
    $dirMsg = if ($direction) { "Direcionamento: $direction" } else { 'Sem direcionamento (dica: escreva junto com o link o que você quer que eu destaque).' }
    Send "Recebido. Lendo a notícia e escrevendo o rascunho (uns 5 minutos)...`n$dirMsg"
    Make-Draft $state $null
    return
  }

  switch ($state.stage) {
    'review' {
      if ($state.daily -and ($action -eq 'now' -or $low -in 'ok', 'aprovar', 'aprovado', 'aprova', 'pode', 'sim', '👍', 'publicar', 'publica', 'agora')) {
        Publish-Now $state
      } elseif ($action -eq 'approve' -or $low -in 'ok', 'aprovar', 'aprovado', 'aprova', 'pode', 'sim', '👍') {
        $state.stage = 'confirm'; Save-State $state
        Send 'Aprovado. Quando publico?' $BtnPublish
      } elseif ($action -eq 'suggest') {
        # o clique tira os botões do rascunho; devolve aqui para ainda dar para publicar sem mudar nada
        Send $SuggestHelp $(if ($state.daily) { $BtnDaily } else { $BtnReview })
      } elseif ($action) {
        Send 'Use os botões do último rascunho, ou mande ajustes por texto.'
      } else {
        Send "Ajustando com base no que você pediu (uns 5 minutos)..."
        Make-Draft $state $t
      }
    }
    'confirm' {
      if ($action -eq 'now' -or $low -in 'agora', 'publicar', 'publica', 'publicar agora') {
        Publish-Now $state
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
    'drafting' { Send 'O rascunho anterior não terminou (o PC pode ter dormido no meio). Mande o link de novo ou /noticia.' }
    default { Send 'Mande o link de uma notícia (e, junto, o que você quer que eu fale sobre ela), ou /noticia para a notícia do dia. /ajuda' }
  }
}

if ($AnnounceDaily) {
  # chamado pelo run-w4k3.ps1 às 09:00, com o draft.json da notícia do dia pronto
  if (-not $cfg.chatId) { Write-Host 'Bot sem dono ainda.'; exit 2 }
  if (-not (Test-Path $Draft)) { Write-Host "Sem $Draft"; exit 1 }
  Set-DailyState | Out-Null
  Show-Draft -daily
  Log 'Notícia do dia enviada para aprovação'
  exit 0
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
        Send '0FF-GR1D_WEB: este chat agora é o dono do bot.'
        Log "Dono: $chat"
      }
      if ($chat -ne [long]$cfg.chatId) { Log "Ignorando chat $chat"; continue }
      # vídeo mandado direto (reel privado ou salvo no celular): vira tema também
      $vf = if ($msg.video) { $msg.video.file_id } elseif ($msg.document -and "$($msg.document.mime_type)" -like 'video/*') { $msg.document.file_id } else { $null }
      if ($vf) { Add-Reel 'add-arquivo' $vf ([string]$msg.caption); continue }
      # imagem (print do post, slide, meme): a maior versão; fotos de um álbum viram um item só
      $pf = if ($msg.photo) { @($msg.photo)[-1].file_id } elseif ($msg.document -and "$($msg.document.mime_type)" -like 'image/*') { $msg.document.file_id } else { $null }
      if ($pf) {
        $grp = if ($msg.media_group_id) { [string]$msg.media_group_id } else { '-' }
        Add-Reel 'add-foto' $pf ([string]$msg.caption) $grp
        continue
      }
      Handle ([string]$msg.text + [string]$msg.caption) $null
    } catch { Log "Erro tratando update: $_"; try { Send "Erro interno: $_" } catch {} }
  }
}
