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

if exist "%BIN_DIR%\open-matrix.cmd" del "%BIN_DIR%\open-matrix.cmd"
if exist "%BIN_DIR%\open-matrix.bat" del "%BIN_DIR%\open-matrix.bat"
if exist "%BIN_DIR%\openmatrix.bat" del "%BIN_DIR%\openmatrix.bat"
if exist "%APPDATA%\npm\open-matrix.cmd" del "%APPDATA%\npm\open-matrix.cmd"
if exist "%APPDATA%\npm\open-matrix.bat" del "%APPDATA%\npm\open-matrix.bat"
if exist "%APPDATA%\npm\openmatrix.bat" del "%APPDATA%\npm\openmatrix.bat"
echo Comandos removidos.

echo.
echo %APP_NAME% foi desinstalado.
pause
