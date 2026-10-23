@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERREUR] Node.js n'est pas installe.
  echo Installez Node.js 22 LTS depuis https://nodejs.org/ puis relancez ce fichier.
  pause & exit /b 1
)

for /f "tokens=1 delims=." %%a in ('node -v') do set VER=%%a
set VER=%VER:v=%
if %VER% LSS 22 (
  echo [ERREUR] Node.js 22 ou superieur est requis. Version detectee :
  node -v
  pause & exit /b 1
)

if not exist node_modules (
  echo Installation des dependances ^(premiere fois, peut prendre 2-3 minutes^)...
  call npm install
  if errorlevel 1 ( echo [ERREUR] npm install a echoue. & pause & exit /b 1 )
)

echo.
echo Hotelyx demarre. Ouvrez http://localhost:5173 dans votre navigateur.
echo Pour arreter, fermez cette fenetre ou appuyez sur Ctrl+C.
echo.
call npm run dev
pause