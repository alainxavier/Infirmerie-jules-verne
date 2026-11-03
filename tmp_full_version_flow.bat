@echo off
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
for /f "tokens=1,2 delims=." %%A in ('node -p "process.versions.node"') do (
  set "NODE_MAJOR=%%A"
  set "NODE_MINOR=%%B"
)
if not defined NODE_MAJOR set "NODE_MAJOR=0"
if not defined NODE_MINOR set "NODE_MINOR=0"
if "%NODE_MAJOR%" LSS "22" (
  echo [ERREUR] Node.js 22.5+ requis. Version actuelle : %NODE_MAJOR%.%NODE_MINOR%
  pause
  exit /b 1
)
if "%NODE_MAJOR%"=="22" if "%NODE_MINOR%" LSS "5" (
  echo [ERREUR] Node.js 22.5+ requis. Version actuelle : %NODE_MAJOR%.%NODE_MINOR%
  pause
  exit /b 1
)
