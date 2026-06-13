$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch {
}

function Fail($Message) {
  # throw (em vez de só Write-Error + exit) garante o encerramento mesmo quando
  # o script roda via `irm ... | iex`, onde `exit` nao interrompe o pipeline e
  # causa cascata de erros / aparencia de loop.
  Write-Host "ERRO: $Message" -ForegroundColor Red
  throw $Message
}

function Show-OpenMatrixLogo() {
  $logo = @'

   ____  ____  ____  _  _    __  __   __  ____  ____  __  _  _
  /  _ \(  _ \(  __)( \( )  (  \/  ) /__\(_  _)(  _ \(  )( \/ )
  )  (_) )) __/ ) _) )  (    )    ( /(__)\ )(   )   / )(  )  (
  \____/(__)  (____)(_)\_)  (_/\/\_)(__)(__)(__) (_)\_)(__)(_/\_)

'@
  Write-Host $logo -ForegroundColor Green
  Write-Host '  Instalador OPEN MATRIX' -ForegroundColor DarkGreen
  Write-Host ''
}

function Show-InstallMenu() {
  # Allow non-interactive override (CI / scripted installs).
  if (-not [string]::IsNullOrWhiteSpace($env:OPEN_MATRIX_INSTALL_MODE)) {
    $m = $env:OPEN_MATRIX_INSTALL_MODE.Trim()
    if ($m -match '^[123]$') { return [int]$m }
  }

  $options = @(
    'Instalar CLI no terminal',
    'Instalar CLI no terminal + extensao VS Code',
    'Instalar CLI no terminal + extensao no VS Antigravity'
  )

  # Fall back to a numbered prompt if the host cannot read raw keys.
  $canRawKey = $true
  try { $null = [Console]::CursorTop } catch { $canRawKey = $false }
  if (-not $canRawKey -or [Console]::IsInputRedirected) {
    Write-Host 'Escolha uma opcao de instalacao:' -ForegroundColor Green
    for ($i = 0; $i -lt $options.Count; $i++) {
      Write-Host ("  {0}) {1}" -f ($i + 1), $options[$i])
    }
    do {
      $answer = Read-Host 'Digite 1, 2 ou 3'
    } while ($answer -notmatch '^[123]$')
    return [int]$answer
  }

  $selected = 0
  $header = 'Use as setas (cima/baixo) e Enter para escolher:'
  $firstDraw = $true
  while ($true) {
    if (-not $firstDraw) {
      # Move cursor back up over the menu lines to redraw in place.
      [Console]::SetCursorPosition(0, [Math]::Max(0, [Console]::CursorTop - ($options.Count + 2)))
    }
    $firstDraw = $false
    Write-Host $header -ForegroundColor Green
    Write-Host ''
    for ($i = 0; $i -lt $options.Count; $i++) {
      $line = '  ' + $options[$i] + (' ' * 8)
      if ($i -eq $selected) {
        Write-Host (' > ' + $options[$i] + '          ') -ForegroundColor Black -BackgroundColor Green
      } else {
        Write-Host ('   ' + $options[$i] + '          ') -ForegroundColor Gray
      }
    }
    $key = [Console]::ReadKey($true)
    switch ($key.Key) {
      'UpArrow'   { $selected = ($selected - 1 + $options.Count) % $options.Count }
      'DownArrow' { $selected = ($selected + 1) % $options.Count }
      'Enter'     { Write-Host ''; return ($selected + 1) }
      'D1'        { Write-Host ''; return 1 }
      'D2'        { Write-Host ''; return 2 }
      'D3'        { Write-Host ''; return 3 }
      'NumPad1'   { Write-Host ''; return 1 }
      'NumPad2'   { Write-Host ''; return 2 }
      'NumPad3'   { Write-Host ''; return 3 }
    }
  }
}

function Get-AntigravityCommandPath() {
  $command = Get-Command antigravity-ide -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  $command = Get-Command antigravity -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }

  $candidates = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\Antigravity IDE\bin\antigravity-ide.cmd'),
    (Join-Path $env:LOCALAPPDATA 'Programs\Antigravity\bin\antigravity.cmd'),
    (Join-Path $env:ProgramFiles 'Antigravity IDE\bin\antigravity-ide.cmd'),
    (Join-Path $env:ProgramFiles 'Antigravity\bin\antigravity.cmd')
  )
  foreach ($candidate in $candidates) {
    if (-not [string]::IsNullOrWhiteSpace($candidate) -and (Test-Path -LiteralPath $candidate)) {
      return $candidate
    }
  }
  return $null
}

function Download-WithRetry($Uri, $OutFile, $Label) {
  $maxAttempts = 5
  for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    try {
      if (Test-Path -LiteralPath $OutFile) {
        Remove-Item -LiteralPath $OutFile -Force -ErrorAction SilentlyContinue
      }
      Write-Host "Baixando $Label (tentativa $attempt/$maxAttempts)..."
      Invoke-WebRequest -Uri $Uri -OutFile $OutFile -UseBasicParsing -TimeoutSec 180
      if ((Test-Path -LiteralPath $OutFile) -and ((Get-Item -LiteralPath $OutFile).Length -gt 0)) {
        return $OutFile
      }
      throw 'Arquivo baixado vazio.'
    } catch {
      $message = $_.Exception.Message
      if ($attempt -eq $maxAttempts) {
        throw "Falha ao baixar $Label de $Uri. $message"
      }
      Write-Warning "Falha ao baixar ${Label}: $message. Tentando novamente..."
      Start-Sleep -Seconds ([Math]::Min(5 * $attempt, 20))
    }
  }
}

function Resolve-NpmCmd() {
  # Em PowerShell, `& npm` resolve para npm.ps1 (scripts .ps1 tem precedencia na
  # descoberta de comandos), que pode ser bloqueado pelo ExecutionPolicy do
  # sistema. Forcamos o npm.cmd, que nao sofre com isso.
  $byCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($byCmd) { return $byCmd.Source }
  $byApp = Get-Command npm -CommandType Application -ErrorAction SilentlyContinue |
    Where-Object { $_.Source -like '*.cmd' } | Select-Object -First 1
  if ($byApp) { return $byApp.Source }
  return 'npm.cmd'
}

function Install-NpmGlobalWithRetry($Spec) {
  $maxAttempts = 3
  $npm = Resolve-NpmCmd
  for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    Write-Host "Instalando pacote npm (tentativa $attempt/$maxAttempts)..."
    & $npm install -g $Spec --no-audit --no-fund
    if ($LASTEXITCODE -eq 0) {
      return
    }
    if ($attempt -lt $maxAttempts) {
      Write-Warning 'npm install falhou. Tentando novamente...'
      Start-Sleep -Seconds ([Math]::Min(5 * $attempt, 15))
    }
  }
  throw 'npm install falhou apos varias tentativas.'
}

function Resolve-InstallPackage($InstallSpec) {
  if ($InstallSpec -match '^https?://.*\.tgz(\?.*)?$') {
    $tempPackage = Join-Path ([IO.Path]::GetTempPath()) ("open-matrix-cli-$([guid]::NewGuid().ToString('N')).tgz")
    Download-WithRetry $InstallSpec $tempPackage 'CLI OPEN MATRIX'
    return [pscustomobject]@{ Spec = $tempPackage; Temp = $tempPackage }
  }

  return [pscustomobject]@{ Spec = $InstallSpec; Temp = $null }
}

$script:RequiredNodeMajor = 22

function Refresh-EnvPath() {
  # Recarrega o PATH (Machine + User) na sessao atual, para que node/npm
  # recem-instalados fiquem disponiveis sem reabrir o terminal.
  try {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $combined = @($machine, $user) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    if ($combined.Count -gt 0) {
      $env:Path = ($combined -join [IO.Path]::PathSeparator)
    }
  } catch {
  }
}

function Get-NodeMajorVersion() {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    return $null
  }
  try {
    $raw = (& node -v 2>$null | Select-Object -First 1)
  } catch {
    return $null
  }
  if ($raw -match 'v?(\d+)\.') {
    return [int]$Matches[1]
  }
  return $null
}

function Install-NodeViaWinget() {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    return $false
  }
  Write-Host 'Instalando Node.js LTS via winget...' -ForegroundColor Green
  & winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent
  return ($LASTEXITCODE -eq 0)
}

function Install-NodeViaZip() {
  # Instala o Node.js a partir do ZIP oficial numa pasta do usuario, sem exigir
  # privilegios de admin (ao contrario do MSI). Adiciona ao PATH da sessao e
  # ao PATH persistente do usuario.
  Write-Host 'Instalando Node.js LTS (ZIP oficial, sem admin)...' -ForegroundColor Green
  $arch = if ([Environment]::Is64BitOperatingSystem) { 'x64' } else { 'x86' }
  $base = "https://nodejs.org/dist/latest-v$($script:RequiredNodeMajor).x/"
  try {
    $listing = (Invoke-WebRequest -UseBasicParsing -Uri $base).Content
  } catch {
    return $false
  }
  $zipName = ([regex]::Matches($listing, "node-v[\d\.]+-win-$arch\.zip") | Select-Object -First 1).Value
  if ([string]::IsNullOrWhiteSpace($zipName)) {
    return $false
  }
  $zipPath = Join-Path ([IO.Path]::GetTempPath()) $zipName
  try {
    Download-WithRetry ($base + $zipName) $zipPath 'Node.js LTS'
  } catch {
    return $false
  }

  $installRoot = Join-Path $env:LOCALAPPDATA 'OpenMatrix\node'
  try {
    if (Test-Path -LiteralPath $installRoot) {
      Remove-Item -LiteralPath $installRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
    New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
    Expand-Archive -LiteralPath $zipPath -DestinationPath $installRoot -Force
  } catch {
    Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
    return $false
  }
  Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue

  # O ZIP extrai para uma subpasta node-vX.Y.Z-win-arch; achatamos para a raiz
  # ($installRoot) para que o caminho do PATH seja estavel entre versoes (evita
  # acumulo de entradas mortas no PATH a cada atualizacao do Node).
  $inner = Get-ChildItem -LiteralPath $installRoot -Directory |
    Where-Object { $_.Name -like 'node-v*' } | Select-Object -First 1
  if ($inner) {
    Get-ChildItem -LiteralPath $inner.FullName -Force | ForEach-Object {
      Move-Item -LiteralPath $_.FullName -Destination $installRoot -Force
    }
    Remove-Item -LiteralPath $inner.FullName -Recurse -Force -ErrorAction SilentlyContinue
  }
  $nodeDir = $installRoot
  if (-not (Test-Path -LiteralPath (Join-Path $nodeDir 'node.exe'))) {
    return $false
  }

  # Adiciona ao PATH da sessao atual e persiste no PATH do usuario.
  $env:Path = "$nodeDir$([IO.Path]::PathSeparator)$env:Path"
  try {
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $parts = @()
    if (-not [string]::IsNullOrWhiteSpace($userPath)) {
      $parts = ($userPath -split [IO.Path]::PathSeparator) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    }
    if (-not ($parts | Where-Object { $_.TrimEnd('\') -ieq $nodeDir.TrimEnd('\') })) {
      $newUserPath = if ($parts.Count -gt 0) { ($parts + $nodeDir) -join [IO.Path]::PathSeparator } else { $nodeDir }
      [Environment]::SetEnvironmentVariable('Path', $newUserPath, 'User')
    }
  } catch {
  }
  return $true
}

function Ensure-Node() {
  $major = Get-NodeMajorVersion
  if ($null -ne $major -and $major -ge $script:RequiredNodeMajor) {
    Write-Host "Node.js detectado (v$major). OK." -ForegroundColor DarkGreen
    return
  }

  if ($null -eq $major) {
    Write-Host 'Node.js nao encontrado. Instalando...' -ForegroundColor Yellow
  } else {
    Write-Host "Node.js v$major e antigo (necessario >= v$($script:RequiredNodeMajor)). Atualizando..." -ForegroundColor Yellow
  }

  # ZIP no diretorio do usuario primeiro (sem admin, confiavel); winget como
  # alternativa rapida quando disponivel.
  $ok = Install-NodeViaZip
  if (-not $ok) {
    $ok = Install-NodeViaWinget
  }
  Refresh-EnvPath

  $major = Get-NodeMajorVersion
  if ($null -eq $major -or $major -lt $script:RequiredNodeMajor) {
    Fail "Falha ao instalar o Node.js LTS (>= v$($script:RequiredNodeMajor)). Instale manualmente em https://nodejs.org e rode este instalador novamente."
  }
  Write-Host "Node.js v$major instalado/atualizado com sucesso." -ForegroundColor Green
}

function Install-OpenMatrixCliPackage($PackageFile) {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Fail 'node nao encontrado mesmo apos a tentativa de instalacao. Instale Node.js LTS e rode novamente.'
  }

  Write-Host 'Instalando OPEN MATRIX no npm global...'
  $npm = Resolve-NpmCmd
  & $npm install -g $PackageFile --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) {
    throw 'npm install do pacote OPEN MATRIX falhou.'
  }
}

Show-OpenMatrixLogo
$installMode = Show-InstallMenu

Write-Host 'OPEN MATRIX installer for Windows' -ForegroundColor Green

# Garante Node.js LTS (>= v22) instalado/atualizado nos caminhos do sistema
# antes de qualquer uso de npm. Isso faz o ambiente do cliente espelhar o dev.
Ensure-Node

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Refresh-EnvPath
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Fail 'npm nao encontrado mesmo apos instalar o Node.js. Reabra o terminal e rode novamente.'
}

function Add-NpmGlobalPrefixToPath() {
  $prefix = (& (Resolve-NpmCmd) prefix -g 2>$null | Select-Object -First 1)
  if ([string]::IsNullOrWhiteSpace($prefix)) {
    return
  }
  if (-not (Test-Path -LiteralPath $prefix)) {
    return
  }
  $pathParts = ($env:Path -split [IO.Path]::PathSeparator) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  if (-not ($pathParts | Where-Object { $_.TrimEnd('\') -ieq $prefix.TrimEnd('\') })) {
    $env:Path = "$prefix$([IO.Path]::PathSeparator)$env:Path"
  }
}

function Get-InstallSpec() {
  if (-not [string]::IsNullOrWhiteSpace($env:OPEN_MATRIX_PACKAGE_SPEC)) {
    return $env:OPEN_MATRIX_PACKAGE_SPEC
  }

  return 'https://github.com/soxvip/openmatrix/releases/latest/download/open-matrix-cli-win.tgz'
}

function Join-PathIfBase($Base, $Child) {
  if ([string]::IsNullOrWhiteSpace($Base)) {
    return $null
  }
  return Join-Path $Base $Child
}

function Get-VSCodeCommandPath() {
  $command = Get-Command code -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $candidates = @(
    (Join-PathIfBase $env:LOCALAPPDATA 'Programs\Microsoft VS Code\bin\code.cmd'),
    (Join-PathIfBase $env:ProgramFiles 'Microsoft VS Code\bin\code.cmd'),
    (Join-PathIfBase ${env:ProgramFiles(x86)} 'Microsoft VS Code\bin\code.cmd'),
    (Join-PathIfBase $env:LOCALAPPDATA 'Programs\Microsoft VS Code Insiders\bin\code-insiders.cmd'),
    (Join-PathIfBase $env:ProgramFiles 'Microsoft VS Code Insiders\bin\code-insiders.cmd'),
    (Join-PathIfBase ${env:ProgramFiles(x86)} 'Microsoft VS Code Insiders\bin\code-insiders.cmd')
  )

  foreach ($candidate in $candidates) {
    if (-not [string]::IsNullOrWhiteSpace($candidate) -and (Test-Path -LiteralPath $candidate)) {
      return $candidate
    }
  }

  return $null
}

function Get-LocalVSIXPath() {
  if ([string]::IsNullOrWhiteSpace($PSScriptRoot)) {
    return $null
  }

  $localRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..') -ErrorAction SilentlyContinue
  if (-not $localRoot) {
    return $null
  }

  $extensionDir = Join-Path $localRoot.Path 'vscode-extension\openclaude-vscode'
  if (-not (Test-Path -LiteralPath $extensionDir)) {
    return $null
  }

  $vsix = Get-ChildItem -LiteralPath $extensionDir -Filter '*.vsix' -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if ($vsix) {
    return $vsix.FullName
  }

  return $null
}

function Install-OpenMatrixVSCodeExtension($CodeCommandPath) {
  $localVsix = Get-LocalVSIXPath
  if ($localVsix) {
    Write-Host "Instalando extensao VS Code OPEN MATRIX do VSIX local: $localVsix"
    & $CodeCommandPath --install-extension $localVsix --force
    return $LASTEXITCODE
  }

  $remoteVsixUrl = 'https://github.com/soxvip/openmatrix/releases/latest/download/open-matrix-vscode.vsix'
  $tempVsix = Join-Path ([IO.Path]::GetTempPath()) "open-matrix-vscode-$([guid]::NewGuid().ToString('N')).vsix"
  try {
    Download-WithRetry $remoteVsixUrl $tempVsix 'extensao VS Code OPEN MATRIX'
    & $CodeCommandPath --install-extension $tempVsix --force
    if ($LASTEXITCODE -eq 0) {
      return 0
    }
  } catch {
    Write-Warning "Nao foi possivel baixar/instalar VSIX do GitHub: $($_.Exception.Message)"
  } finally {
    if (Test-Path -LiteralPath $tempVsix) {
      Remove-Item -LiteralPath $tempVsix -Force -ErrorAction SilentlyContinue
    }
  }

  Write-Host 'Tentando instalar extensao VS Code OPEN MATRIX pelo Marketplace...'
  & $CodeCommandPath --install-extension devnull-bootloader.open-matrix-vscode --force
  return $LASTEXITCODE
}

$installSpec = Get-InstallSpec
Write-Host "Instalando/atualizando CLI OPEN MATRIX de: $installSpec"
$resolvedPackage = $null
try {
  $resolvedPackage = Resolve-InstallPackage $installSpec
  if ($resolvedPackage.Spec -match '\.tgz$') {
    Install-OpenMatrixCliPackage $resolvedPackage.Spec
  } else {
    Install-NpmGlobalWithRetry $resolvedPackage.Spec
  }
} catch {
  Fail "Falha ao instalar OPEN MATRIX. Verifique internet, proxy/VPN/firewall e tente novamente. Detalhe: $($_.Exception.Message)"
} finally {
  if ($resolvedPackage -and $resolvedPackage.Temp -and (Test-Path -LiteralPath $resolvedPackage.Temp)) {
    Remove-Item -LiteralPath $resolvedPackage.Temp -Force -ErrorAction SilentlyContinue
  }
}

function Get-OpenMatrixCommandPath() {
  # Prefer the shim inside the npm global prefix where we just installed, so a
  # stale shim from a previous/non-npm install earlier on PATH (e.g.
  # %LOCALAPPDATA%\OpenMatrix\bin) does not get picked instead and crash with
  # MODULE_NOT_FOUND.
  $prefix = (& (Resolve-NpmCmd) prefix -g 2>$null | Select-Object -First 1)
  if (-not [string]::IsNullOrWhiteSpace($prefix)) {
    $prefix = $prefix.Trim()
    foreach ($name in @('open-matrix.cmd', 'open-matrix')) {
      $candidate = Join-Path $prefix $name
      if (Test-Path -LiteralPath $candidate) {
        return $candidate
      }
    }
  }

  $fromPath = Get-Command open-matrix.cmd -ErrorAction SilentlyContinue
  if (-not $fromPath) {
    $fromPath = Get-Command open-matrix -ErrorAction SilentlyContinue
  }
  if ($fromPath) {
    return $fromPath.Source
  }
  return $null
}

Add-NpmGlobalPrefixToPath
$openMatrixCommandPath = Get-OpenMatrixCommandPath
if (-not $openMatrixCommandPath) {
  Fail 'Comando open-matrix nao encontrado apos instalacao. Verifique PATH do npm global e rode novamente.'
}
$openMatrixCommand = [pscustomobject]@{ Source = $openMatrixCommandPath }

$token = $env:OPEN_MATRIX_API_KEY
if ([string]::IsNullOrWhiteSpace($token)) {
  $token = Read-Host 'Cole seu token OPEN MATRIX'
}

if ([string]::IsNullOrWhiteSpace($token)) {
  Fail 'Token vazio. Rode o instalador novamente.'
}

Write-Host 'Configurando provider OPEN MATRIX...'
$previousOpenMatrixApiKey = $env:OPEN_MATRIX_API_KEY
$setupSucceeded = $false
try {
  # Passa o token via --token-stdin (deterministico): o setup le do stdin e
  # nunca cai no prompt interativo, que travaria sob Start-Process sem console
  # (causa do timeout / "Codigo:" vazio). Mantemos a env var como reforco.
  $env:OPEN_MATRIX_API_KEY = $token
  $setupOutput = ($token | & $openMatrixCommand.Source setup --token-stdin 2>&1 | Out-String)
  $setupExitCode = $LASTEXITCODE
  if (-not [string]::IsNullOrWhiteSpace($setupOutput)) {
    Write-Host $setupOutput.TrimEnd()
  }
  if ($setupOutput -match 'Configuracao OPEN MATRIX concluida\.' -or $setupExitCode -eq 0) {
    $setupSucceeded = $true
  }

  if (-not $setupSucceeded) {
    $detail = $setupOutput.Trim()
    if ([string]::IsNullOrWhiteSpace($detail)) {
      $detail = "codigo $setupExitCode"
    }
    Fail "Falha ao configurar provider OPEN MATRIX: $detail"
  }
} finally {
  $env:OPEN_MATRIX_API_KEY = $previousOpenMatrixApiKey
}

if ($installMode -eq 1) {
  Write-Host 'Modo selecionado: apenas CLI no terminal. Extensao de editor nao sera instalada.' -ForegroundColor DarkGreen
} elseif ($env:OPEN_MATRIX_SKIP_VSCODE -eq '1') {
  Write-Host 'Instalacao da extensao de editor pulada por OPEN_MATRIX_SKIP_VSCODE=1.'
} elseif ($installMode -eq 2) {
  $codeCommandPath = Get-VSCodeCommandPath
  if ($codeCommandPath) {
    Write-Host 'Instalando extensao no VS Code...' -ForegroundColor Green
    $extensionExitCode = Install-OpenMatrixVSCodeExtension $codeCommandPath
    if ($extensionExitCode -ne 0) {
      Write-Warning 'Nao foi possivel instalar a extensao automaticamente. Instale manualmente: https://github.com/soxvip/openmatrix/releases/latest/download/open-matrix-vscode.vsix'
    }
  } else {
    Write-Warning 'VS Code nao encontrado via comando code nem nos caminhos padrao. Instale manualmente: https://github.com/soxvip/openmatrix/releases/latest/download/open-matrix-vscode.vsix'
  }
} elseif ($installMode -eq 3) {
  $antigravityCommandPath = Get-AntigravityCommandPath
  if ($antigravityCommandPath) {
    Write-Host 'Instalando extensao no VS Antigravity...' -ForegroundColor Green
    $extensionExitCode = Install-OpenMatrixVSCodeExtension $antigravityCommandPath
    if ($extensionExitCode -ne 0) {
      Write-Warning 'Nao foi possivel instalar a extensao no Antigravity automaticamente. Instale manualmente: https://github.com/soxvip/openmatrix/releases/latest/download/open-matrix-vscode.vsix'
    }
  } else {
    Write-Warning 'VS Antigravity nao encontrado. Instale o Antigravity IDE e rode novamente, ou instale a extensao manualmente: https://github.com/soxvip/openmatrix/releases/latest/download/open-matrix-vscode.vsix'
  }
}

Write-Host 'OPEN MATRIX instalado e configurado.' -ForegroundColor Green
Write-Host 'Abrindo OPEN MATRIX...'
& $openMatrixCommand.Source

