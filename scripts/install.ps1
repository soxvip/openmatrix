$ErrorActionPreference = 'Stop'

function Fail($Message) {
  Write-Error $Message
  exit 1
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

  if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) {
    $localRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..') -ErrorAction SilentlyContinue
    if ($localRoot -and (Test-Path -LiteralPath (Join-Path $localRoot.Path 'package.json'))) {
      return $localRoot.Path
    }
  }

  return 'https://github.com/soxvip/openmatrix/archive/refs/heads/main.tar.gz'
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

  $remoteVsixUrl = 'https://raw.githubusercontent.com/soxvip/openmatrix/main/vscode-extension/openclaude-vscode/open-matrix-vscode-0.2.13.vsix'
  $tempVsix = Join-Path ([IO.Path]::GetTempPath()) 'open-matrix-vscode-latest.vsix'
  try {
    Write-Host 'Baixando extensao VS Code OPEN MATRIX do GitHub...'
    Invoke-WebRequest -Uri $remoteVsixUrl -OutFile $tempVsix -UseBasicParsing
    if (Test-Path -LiteralPath $tempVsix) {
      & $CodeCommandPath --install-extension $tempVsix --force
      if ($LASTEXITCODE -eq 0) {
        return 0
      }
    }
  } catch {
    Write-Warning "Nao foi possivel baixar VSIX do GitHub: $($_.Exception.Message)"
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
npm install -g $installSpec
if ($LASTEXITCODE -ne 0) {
  Fail 'Falha ao instalar OPEN MATRIX pelo npm.'
}

Add-NpmGlobalPrefixToPath
$openMatrixCommand = Get-Command open-matrix -ErrorAction SilentlyContinue
if (-not $openMatrixCommand) {
  Fail 'Comando open-matrix nao encontrado apos instalacao. Verifique se a versao publicada contem o binario open-matrix ou rode localmente: npm install -g "C:\Users\Rychard sidonio\openmatrix"'
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

$codeCommandPath = Get-VSCodeCommandPath
if ($codeCommandPath) {
  $extensionExitCode = Install-OpenMatrixVSCodeExtension $codeCommandPath
  if ($extensionExitCode -ne 0) {
    Write-Warning 'Nao foi possivel instalar a extensao automaticamente. Se ela ainda nao estiver publicada no Marketplace, instale o arquivo .vsix em vscode-extension/openclaude-vscode manualmente pelo VS Code.'
  }
} else {
  Write-Warning 'VS Code nao encontrado via comando code nem nos caminhos padrao. Para instalar a extensao, abra VS Code e instale o arquivo .vsix em vscode-extension/openclaude-vscode.'
}

Write-Host 'OPEN MATRIX instalado e configurado.' -ForegroundColor Green
Write-Host 'Use: open-matrix'
