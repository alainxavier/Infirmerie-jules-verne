@echo on
call npm --version
if errorlevel 1 (
  echo bad
)
echo done
