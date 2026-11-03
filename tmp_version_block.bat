@echo off
echo before
for /f "tokens=1,2 delims=." %%A in ('node -p "process.versions.node"') do (
  set "NODE_MAJOR=%%A"
  set "NODE_MINOR=%%B"
)
echo afterfor
if not defined NODE_MAJOR set "NODE_MAJOR=0"
if not defined NODE_MINOR set "NODE_MINOR=0"
echo values=%NODE_MAJOR% %NODE_MINOR%
if "%NODE_MAJOR%" LSS "22" (
  echo too_old
  exit /b 1
)
if "%NODE_MAJOR%"=="22" if "%NODE_MINOR%" LSS "5" (
  echo too_old_22
  exit /b 1
)
echo afterif
