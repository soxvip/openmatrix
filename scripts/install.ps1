$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch {
}

function Fail($Message) {
  Write-Error $Message
  exit 1
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

function Install-NpmGlobalWithRetry($Spec) {
  $maxAttempts = 3
  for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    Write-Host "Instalando pacote npm (tentativa $attempt/$maxAttempts)..."
    & npm install -g $Spec --no-audit --no-fund
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

function Install-OpenMatrixCliPackage($PackageFile) {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Fail 'node nao encontrado. Instale Node.js LTS e rode este instalador novamente.'
  }

  Write-Host 'Instalando OPEN MATRIX no npm global...'
  & npm install -g $PackageFile --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) {
    throw 'npm install do pacote OPEN MATRIX falhou.'
  }
}

Write-Host 'OPEN MATRIX installer for Windows' -ForegroundColor Green

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Fail 'npm nao encontrado. Instale Node.js LTS e rode este instalador novamente.'
}

function Add-NpmGlobalPrefixToPath() {
  $prefix = (& npm prefix -g 2>$null | Select-Object -First 1)
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
  $prefix = (& npm prefix -g 2>$null | Select-Object -First 1)
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
$setupLog = Join-Path ([IO.Path]::GetTempPath()) ("open-matrix-setup-$([guid]::NewGuid().ToString('N')).log")
$setupErr = Join-Path ([IO.Path]::GetTempPath()) ("open-matrix-setup-$([guid]::NewGuid().ToString('N')).err")
$setupProcess = $null
$setupSucceeded = $false
try {
  $env:OPEN_MATRIX_API_KEY = $token
  $setupProcess = Start-Process -FilePath $openMatrixCommand.Source -ArgumentList @('setup') -NoNewWindow -PassThru -RedirectStandardOutput $setupLog -RedirectStandardError $setupErr
  $deadline = (Get-Date).AddSeconds(90)
  while ((Get-Date) -lt $deadline) {
    $setupText = ''
    if (Test-Path -LiteralPath $setupLog) {
      $setupText += Get-Content -LiteralPath $setupLog -Raw -ErrorAction SilentlyContinue
    }
    if (Test-Path -LiteralPath $setupErr) {
      $setupText += Get-Content -LiteralPath $setupErr -Raw -ErrorAction SilentlyContinue
    }
    if ($setupText -match 'Configuracao OPEN MATRIX concluida\.') {
      $setupSucceeded = $true
      break
    }
    if ($setupProcess.HasExited) {
      break
    }
    Start-Sleep -Milliseconds 250
  }

  if (-not $setupProcess.HasExited) {
    Stop-Process -Id $setupProcess.Id -Force -ErrorAction SilentlyContinue
    $setupProcess.WaitForExit(5000) | Out-Null
  }

  if (Test-Path -LiteralPath $setupLog) {
    $setupStdout = Get-Content -LiteralPath $setupLog -Raw -ErrorAction SilentlyContinue
    if (-not [string]::IsNullOrWhiteSpace($setupStdout)) {
      Write-Host $setupStdout.TrimEnd()
    }
  }
  if (Test-Path -LiteralPath $setupErr) {
    $setupStderr = Get-Content -LiteralPath $setupErr -Raw -ErrorAction SilentlyContinue
    if (-not [string]::IsNullOrWhiteSpace($setupStderr)) {
      Write-Host $setupStderr.TrimEnd()
    }
  }

  if (-not $setupSucceeded -and $setupProcess.ExitCode -ne 0) {
    Fail "Falha ao configurar provider OPEN MATRIX. Codigo: $($setupProcess.ExitCode)"
  }
  if (-not $setupSucceeded) {
    Fail 'Falha ao configurar provider OPEN MATRIX: tempo limite aguardando conclusao.'
  }
} finally {
  $env:OPEN_MATRIX_API_KEY = $previousOpenMatrixApiKey
  if (Test-Path -LiteralPath $setupLog) { Remove-Item -LiteralPath $setupLog -Force -ErrorAction SilentlyContinue }
  if (Test-Path -LiteralPath $setupErr) { Remove-Item -LiteralPath $setupErr -Force -ErrorAction SilentlyContinue }
}

if ($env:OPEN_MATRIX_SKIP_VSCODE -eq '1') {
  Write-Host 'Instalacao da extensao VS Code pulada por OPEN_MATRIX_SKIP_VSCODE=1.'
} else {
  $codeCommandPath = Get-VSCodeCommandPath
  if ($codeCommandPath) {
    $extensionExitCode = Install-OpenMatrixVSCodeExtension $codeCommandPath
    if ($extensionExitCode -ne 0) {
      Write-Warning 'Nao foi possivel instalar a extensao automaticamente. Instale manualmente: https://github.com/soxvip/openmatrix/releases/latest/download/open-matrix-vscode.vsix'
    }
  } else {
    Write-Warning 'VS Code nao encontrado via comando code nem nos caminhos padrao. Instale manualmente: https://github.com/soxvip/openmatrix/releases/latest/download/open-matrix-vscode.vsix'
  }
}

Write-Host 'OPEN MATRIX instalado e configurado.' -ForegroundColor Green
Write-Host 'Abrindo OPEN MATRIX...'
& $openMatrixCommand.Source

