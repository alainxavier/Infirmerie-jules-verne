@echo off
title Registre d'infirmerie - Ecole Jules Verne (Serveur multi-utilisateurs)
cd /d "%~dp0server"

rem ---------------------------------------------------------------
rem Utilise en priorite le Node.js portable embarque dans le projet
rem (node-portable), sinon le Node.js installe sur la machine.
rem Node.js 22+ requis (module SQLite integre).
rem ---------------------------------------------------------------
set "NODE_EXE=node"
if exist "%~dp0node-portable\node-v22.23.2-win-x64\node.exe" (
  set "NODE_EXE=%~dp0node-portable\node-v22.23.2-win-x64\node.exe"
  echo Node.js portable detecte.
) else (
  node --version >nul 2>&1
  if errorlevel 1 (
    echo [ERREUR] Node.js introuvable.
    echo          Conservez le dossier "node-portable" a cote de ce script,
    echo          ou installez Node.js 22 ou plus recent.
    echo.
    pause
    exit /b 1
  )
)

echo Version de Node.js :
"%NODE_EXE%" --version
echo.

rem Verification de la version minimale (22.5.0)
"%NODE_EXE%" -e "var p=process.versions.node.split('.').map(Number); if(p[0]<22||(p[0]===22&&p[1]<5)){console.error('[ERREUR] Node.js 22.5+ requis (module SQLite integre). Version actuelle : '+process.versions.node);process.exit(1)}"
if errorlevel 1 (
  pause
  exit /b 1
)

if not exist "node_modules\express" (
  echo Installation des dependances (premiere fois seulement)...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo [ERREUR] Echec de l'installation des dependances.
    pause
    exit /b 1
  )
)

echo.
echo Demarrage du serveur sur le port 8461...
echo.
timeout /t 2 >nul
start "" "http://localhost:8461/"
"%NODE_EXE%" server.js
echo.
echo Le serveur s'est arrete.
pause

