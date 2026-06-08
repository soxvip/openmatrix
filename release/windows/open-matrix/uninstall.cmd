@echo off
setlocal

set "APP_NAME=OPEN MATRIX"
set "INSTALL_DIR=%LOCALAPPDATA%\OpenMatrix"
set "BIN_DIR=%LOCALAPPDATA%\Microsoft\WindowsApps"

echo Desinstalando %APP_NAME%...

if exist "%INSTALL_DIR%" (
  rmdir /s /q "%INSTALL_DIR%"
  echo Pasta do app deletada.
)

if exist "%BIN_DIR%\open-matrix.cmd" (
  del "%BIN_DIR%\open-matrix.cmd"
  echo Comando open-matrix removido.
)

if exist "%BIN_DIR%\openclaude.cmd" (
  del "%BIN_DIR%\openclaude.cmd"
  echo Comando openclaude removido.
)

echo.
echo %APP_NAME% foi desinstalado.
pause
