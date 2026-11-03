@echo off
for /f "tokens=1,2 delims=." %%A in ('node -p "process.versions.node"') do (
  set "NODE_MAJOR=%%A"
  set "NODE_MINOR=%%B"
)
echo NODE_MAJOR=%NODE_MAJOR%
echo NODE_MINOR=%NODE_MINOR%
if "%NODE_MAJOR%" LSS "22" echo too_old
if "%NODE_MAJOR%"=="22" if "%NODE_MINOR%" LSS "5" echo too_old_22
