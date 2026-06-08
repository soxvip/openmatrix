@echo off
setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "APP_DIR=%SCRIPT_DIR%app"

echo [1/5] Limpando pasta app antiga...
if exist "%APP_DIR%" rmdir /s /q "%APP_DIR%"
mkdir "%APP_DIR%"
mkdir "%APP_DIR%\bin"
mkdir "%APP_DIR%\dist"

echo [2/5] Copiando artefatos do build...
copy "%SCRIPT_DIR%..\..\..\package.json" "%APP_DIR%\" >nul
copy "%SCRIPT_DIR%..\..\..\README.md" "%APP_DIR%\" >nul
copy "%SCRIPT_DIR%..\..\..\bin\open-matrix" "%APP_DIR%\bin\" >nul
xcopy "%SCRIPT_DIR%..\..\..\dist\*" "%APP_DIR%\dist\" /E /I /Y >nul

echo [3/5] Ajustando dependencias no package.json do app...
:: Remove dependencias de desenvolvimento e deixa apenas de producao para agilizar install
:: Usa node para ler e re-escrever package.json filtrado
node -e "const fs = require('fs'); const p = JSON.parse(fs.readFileSync('app/package.json')); delete p.devDependencies; delete p.scripts; p.bin = {'open-matrix': './bin/open-matrix'}; fs.writeFileSync('app/package.json', JSON.stringify(p, null, 2));"

echo [4/5] Instalando dependencias de producao na pasta app...
cd /d "%APP_DIR%"
call npm install --omit=dev --no-audit --no-fund

echo [5/5] Preparacao concluida com sucesso.
