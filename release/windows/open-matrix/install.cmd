@echo off
setlocal

set "APP_NAME=OPEN MATRIX"
set "INSTALL_DIR=%LOCALAPPDATA%\OpenMatrix"
set "BIN_DIR=%LOCALAPPDATA%\Microsoft\WindowsApps"
set "SOURCE_DIR=%~dp0app"

if not exist "%SOURCE_DIR%\bin\openclaude" (
  echo Erro: arquivos do app nao encontrados em "%SOURCE_DIR%".
  pause
  exit /b 1
)

echo Instalando %APP_NAME% em "%INSTALL_DIR%"...
if exist "%INSTALL_DIR%" rmdir /s /q "%INSTALL_DIR%"
mkdir "%INSTALL_DIR%" >nul 2>nul
xcopy "%SOURCE_DIR%\*" "%INSTALL_DIR%\" /E /I /Y >nul

if not exist "%BIN_DIR%" mkdir "%BIN_DIR%" >nul 2>nul

(
  echo @echo off
  echo node "%%LOCALAPPDATA%%\OpenMatrix\bin\openclaude" %%*
) > "%BIN_DIR%\open-matrix.cmd"

(
  echo @echo off
  echo node "%%LOCALAPPDATA%%\OpenMatrix\bin\openclaude" %%*
) > "%BIN_DIR%\openclaude.cmd"

echo.
echo Instalado com sucesso.
echo.
echo Comandos disponiveis:
echo   open-matrix
echo   openclaude
echo.
echo Se o comando nao abrir neste terminal, feche e abra o terminal novamente.
echo Requisito: Node.js instalado e disponivel como "node".
pause
