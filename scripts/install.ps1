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
  if (-not (Get-Command tar -ErrorAction SilentlyContinue)) {
    Fail 'tar nao encontrado no Windows. Atualize o Windows 10/11 ou instale tar/bsdtar.'
  }

  $npmPrefix = (& npm prefix -g 2>$null | Select-Object -First 1)
  if ([string]::IsNullOrWhiteSpace($npmPrefix)) {
    Fail 'Nao foi possivel detectar npm prefix global.'
  }
  $npmPrefix = $npmPrefix.Trim()
  if (-not (Test-Path -LiteralPath $npmPrefix)) {
    New-Item -ItemType Directory -Path $npmPrefix -Force | Out-Null
  }

  $extractDir = Join-Path ([IO.Path]::GetTempPath()) ("open-matrix-extract-$([guid]::NewGuid().ToString('N'))")
  New-Item -ItemType Directory -Path $extractDir -Force | Out-Null
  try {
    Write-Host 'Extraindo pacote OPEN MATRIX...'
    & tar -xzf $PackageFile -C $extractDir
    if ($LASTEXITCODE -ne 0) {
      throw 'Falha ao extrair pacote .tgz.'
    }

    $sourcePackage = Join-Path $extractDir 'package'
    if (-not (Test-Path -LiteralPath (Join-Path $sourcePackage 'bin\open-matrix'))) {
      throw 'Pacote invalido: bin\open-matrix nao encontrado.'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $sourcePackage 'dist\cli.mjs'))) {
      throw 'Pacote invalido: dist\cli.mjs nao encontrado.'
    }

    $targetParent = Join-Path $npmPrefix 'node_modules\@gitlawb'
    $targetPackage = Join-Path $targetParent 'openclaude'
    New-Item -ItemType Directory -Path $targetParent -Force | Out-Null
    if (Test-Path -LiteralPath $targetPackage) {
      Remove-Item -LiteralPath $targetPackage -Recurse -Force
    }

    Write-Host 'Copiando OPEN MATRIX para npm global...'
    Copy-Item -LiteralPath $sourcePackage -Destination $targetPackage -Recurse -Force

    $cmdShim = Join-Path $npmPrefix 'open-matrix.cmd'
    $cmdContent = "@ECHO off`r`nnode `"%~dp0node_modules\@gitlawb\openclaude\bin\open-matrix`" %*`r`n"
    [IO.File]::WriteAllText($cmdShim, $cmdContent, [Text.Encoding]::ASCII)

    $psShim = Join-Path $npmPrefix 'open-matrix.ps1'
    $psLines = @(
      '$basedir = Split-Path $MyInvocation.MyCommand.Definition -Parent',
      '$exe = "node"',
      '$target = Join-Path $basedir "node_modules\@gitlawb\openclaude\bin\open-matrix"',
      '& $exe $target @args',
      'exit $LASTEXITCODE'
    )
    [IO.File]::WriteAllText($psShim, ($psLines -join "`r`n") + "`r`n", [Text.Encoding]::UTF8)

    $shShim = Join-Path $npmPrefix 'open-matrix'
    $shLines = @(
      '#!/bin/sh',
      'basedir=$(dirname "$(echo "$0" | sed -e ''s,\\,/,g'')")',
      'exec node "$basedir/node_modules/@gitlawb/openclaude/bin/open-matrix" "$@"'
    )
    [IO.File]::WriteAllText($shShim, ($shLines -join "`n") + "`n", [Text.Encoding]::ASCII)
  } finally {
    if (Test-Path -LiteralPath $extractDir) {
      Remove-Item -LiteralPath $extractDir -Recurse -Force -ErrorAction SilentlyContinue
    }
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

Add-NpmGlobalPrefixToPath
$openMatrixCommand = Get-Command open-matrix.cmd -ErrorAction SilentlyContinue
if (-not $openMatrixCommand) {
  $openMatrixCommand = Get-Command open-matrix -ErrorAction SilentlyContinue
}
if (-not $openMatrixCommand) {
  Fail 'Comando open-matrix nao encontrado apos instalacao. Verifique PATH do npm global e rode novamente.'
}

$token = $env:OPEN_MATRIX_API_KEY
if ([string]::IsNullOrWhiteSpace($token)) {
  $token = Read-Host 'Cole seu token OPEN MATRIX'
}

if ([string]::IsNullOrWhiteSpace($token)) {
  Fail 'Token vazio. Rode o instalador novamente.'
}

Write-Host 'Configurando provider OPEN MATRIX...'
$token | & $openMatrixCommand.Source setup --token-stdin
if ($LASTEXITCODE -ne 0) {
  Fail 'Falha ao configurar provider OPEN MATRIX.'
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
Write-Host 'Use: open-matrix'

