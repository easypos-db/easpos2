@echo off
setlocal
cd /d "%~dp0"
set /p EASYPOS_URL=Site adresi (Enter = https://easpos2.pizzalocaleyelki.workers.dev): 
if "%EASYPOS_URL%"=="" set EASYPOS_URL=https://easpos2.pizzalocaleyelki.workers.dev
set /p EASYPOS_BRIDGE_TOKEN=Kopru anahtari: 
node print-bridge.js
pause
