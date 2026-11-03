@echo off
start "" powershell -NoProfile -WindowStyle Hidden -Command "$limite=(Get-Date).AddSeconds(30); do { try { $reponse=Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8461/api/config' -TimeoutSec 1; if ($reponse.StatusCode -eq 200) { Start-Process 'http://localhost:8461/'; exit 0 } } catch { }; Start-Sleep -Milliseconds 500 } while ((Get-Date) -lt $limite)"
echo DONE
