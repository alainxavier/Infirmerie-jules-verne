@echo off
rem =========================================================
rem  Registre d'infirmerie - Ecole Jules Verne
rem  Lance le serveur local puis ouvre l'application dans le navigateur.
rem  (Une seule fois : ensuite, utilisez l'application installee.)
rem =========================================================
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Milliseconds 1200; Start-Process 'http://localhost:8461/'"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serveur-infirmerie.ps1"
