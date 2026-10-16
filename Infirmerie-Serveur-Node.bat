@echo off
title Registre d'infirmerie - Ecole Jules Verne (Serveur multi-utilisateurs)
cd /d "%~dp0server"
if errorlevel 1 (
  echo [ERREUR] Dossier du serveur introuvable.
  pause
  exit /b 1
)

rem Utilise Node.js et npm deja installes sur le serveur.
rem Node.js 22.5+ requis pour le module SQLite integre.
where node >nul 2>&1
if errorlevel 1 (
  echo [ERREUR] Node.js introuvable dans le PATH.
  echo          Installez Node.js 22.5 ou plus recent sur le serveur.
  pause
  exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
  echo [ERREUR] npm introuvable dans le PATH.
  echo          Reparez ou reinstallez Node.js avec npm sur le serveur.
  pause
  exit /b 1
)

echo Version de Node.js :
node --version
if errorlevel 1 (
  echo [ERREUR] Node.js ne peut pas etre execute.
  pause
  exit /b 1
)
echo Version de npm :
call npm --version
if errorlevel 1 (
  echo [ERREUR] npm ne peut pas etre execute.
  pause
  exit /b 1
)
echo.

rem Verification de la version minimale (22.5.0)
node -e "var p=process.versions.node.split('.').map(Number); if(p[0]<22||(p[0]===22&&p[1]<5)){console.error('[ERREUR] Node.js 22.5+ requis. Version actuelle : '+process.versions.node);process.exit(1)}"
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
echo Le navigateur s'ouvrira une fois le serveur pret.
echo.
rem Attendre la reponse API avant d'ouvrir le navigateur sur l'hote.
start "" powershell -NoProfile -WindowStyle Hidden -Command "$limite=(Get-Date).AddSeconds(30); do { try { $reponse=Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8461/api/config' -TimeoutSec 1; if ($reponse.StatusCode -eq 200) { Start-Process 'http://localhost:8461/'; exit 0 } } catch { }; Start-Sleep -Milliseconds 500 } while ((Get-Date) -lt $limite)"
node server.js
echo.
echo Le serveur s'est arrete (code %ERRORLEVEL%).
echo Si le port 8461 est deja utilise, fermez l'autre serveur ou choisissez un autre port.
pause
