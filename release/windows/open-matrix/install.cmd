@echo off
setlocal

set "APP_NAME=OPEN MATRIX"
set "INSTALL_DIR=%LOCALAPPDATA%\OpenMatrix"
set "BIN_DIR=%LOCALAPPDATA%\Microsoft\WindowsApps"
set "SOURCE_DIR=%~dp0app"

if not exist "%SOURCE_DIR%\bin\open-matrix" (
  echo Erro: arquivos do app nao encontrados em "%SOURCE_DIR%".
  exit /b 1
)

echo Instalando %APP_NAME% em "%INSTALL_DIR%"...
if exist "%INSTALL_DIR%" rmdir /s /q "%INSTALL_DIR%"
mkdir "%INSTALL_DIR%" >nul 2>nul
xcopy "%SOURCE_DIR%\*" "%INSTALL_DIR%\" /E /I /Y >nul

if not exist "%BIN_DIR%" mkdir "%BIN_DIR%" >nul 2>nul

:: Launcher with hyphen (.cmd)
(
  echo @echo off
  echo node "%%LOCALAPPDATA%%\OpenMatrix\bin\open-matrix" %%*
) > "%BIN_DIR%\open-matrix.cmd"

:: Launcher with hyphen (.bat) — same content, different extension
(
  echo @echo off
  echo node "%%LOCALAPPDATA%%\OpenMatrix\bin\open-matrix" %%*
) > "%BIN_DIR%\open-matrix.bat"

:: Launcher without hyphen (.bat) — fallback for shells that fail to resolve hyphenated names
(
  echo @echo off
  echo node "%%LOCALAPPDATA%%\OpenMatrix\bin\open-matrix" %%*
) > "%BIN_DIR%\openmatrix.bat"

:: Also create launchers inside install dir so the user can run from there
(
  echo @echo off
  echo node "%%~dp0bin\open-matrix" %%*
) > "%INSTALL_DIR%\open-matrix.cmd"

(
  echo @echo off
  echo node "%%~dp0bin\open-matrix" %%*
) > "%INSTALL_DIR%\open-matrix.bat"

(
  echo @echo off
  echo node "%%~dp0bin\open-matrix" %%*
) > "%INSTALL_DIR%\openmatrix.bat"

:: Also write to Roaming npm (often in user PATH)
set "NPM_BIN_DIR=%APPDATA%\npm"
if exist "%NPM_BIN_DIR%" (
  (
    echo @echo off
    echo node "%%LOCALAPPDATA%%\OpenMatrix\bin\open-matrix" %%*
  ) > "%NPM_BIN_DIR%\open-matrix.cmd"
  (
    echo @echo off
    echo node "%%LOCALAPPDATA%%\OpenMatrix\bin\open-matrix" %%*
  ) > "%NPM_BIN_DIR%\open-matrix.bat"
  (
    echo @echo off
    echo node "%%LOCALAPPDATA%%\OpenMatrix\bin\open-matrix" %%*
  ) > "%NPM_BIN_DIR%\openmatrix.bat"
)

echo.
echo Instalado com sucesso.
echo.
echo Comandos disponiveis:
echo   open-matrix
echo   openmatrix
echo.
echo IMPORTANTE: feche e abra um novo terminal para que o PATH seja atualizado.
echo Requisito: Node.js instalado e disponivel como "node".
