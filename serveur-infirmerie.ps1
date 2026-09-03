$ErrorActionPreference = 'Stop'

# =========================================================
#  Serveur local pour le Registre d'infirmerie — École Jules Verne
#  Nécessaire une seule fois pour installer l'application (PWA).
#  Ensuite, l'application installée fonctionne même serveur arrêté.
# =========================================================

$port = 8461
$root = (Get-Location).Path
if ($PSScriptRoot) { $root = $PSScriptRoot }

$mime = @{
  '.html'       = 'text/html; charset=utf-8'
  '.htm'        = 'text/html; charset=utf-8'
  '.js'         = 'text/javascript; charset=utf-8'
  '.mjs'        = 'text/javascript; charset=utf-8'
  '.css'        = 'text/css; charset=utf-8'
  '.json'       = 'application/json; charset=utf-8'
  '.webmanifest' = 'application/manifest+json; charset=utf-8'
  '.svg'        = 'image/svg+xml'
  '.png'        = 'image/png'
  '.jpg'        = 'image/jpeg'
  '.jpeg'       = 'image/jpeg'
  '.gif'        = 'image/gif'
  '.ico'        = 'image/x-icon'
  '.woff2'      = 'font/woff2'
  '.woff'       = 'font/woff'
  '.txt'        = 'text/plain; charset=utf-8'
  '.csv'        = 'text/csv; charset=utf-8'
}

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $port)
$listener.Start()
Write-Host ''
Write-Host '  Registre d infirmerie - Ecole Jules Verne' -ForegroundColor Cyan
Write-Host "  Serveur local demarre : http://localhost:$port/" -ForegroundColor Green
Write-Host '  Laissez cette fenetre ouverte (vous pouvez la reduire).' -ForegroundColor Yellow
Write-Host '  Pour arreter le serveur : fermez cette fenetre ou Ctrl+C.'
Write-Host ''

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $client.ReceiveTimeout = 5000
    $stream = $client.GetStream()
    $buf = New-Object byte[] 8192
    $read = $stream.Read($buf, 0, $buf.Length)
    if ($read -le 0) { $client.Close(); continue }
    $req = [System.Text.Encoding]::ASCII.GetString($buf, 0, $read)
    $firstLine = ($req -split "`r`n")[0]
    $parts = $firstLine -split ' '
    if ($parts.Count -lt 2) { $client.Close(); continue }
    $path = $parts[1]
    if ($path -eq '/') { $path = '/index.html' }
    $q = $path.IndexOf('?')
    if ($q -ge 0) { $path = $path.Substring(0, $q) }
    $path = [System.Uri]::UnescapeDataString($path)

    $full = [System.IO.Path]::GetFullPath((Join-Path $root $path.TrimStart('/')))
    if (-not $full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
      $client.Close(); continue
    }

    if ([System.IO.File]::Exists($full)) {
      $bytes = [System.IO.File]::ReadAllBytes($full)
      $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
      if ($mime.ContainsKey($ext)) { $ctype = $mime[$ext] } else { $ctype = 'application/octet-stream' }
      $cc = 'public, max-age=3600'
      if ($ext -in @('.html', '.htm', '.js', '.webmanifest', '.json')) { $cc = 'no-cache' }
      $head = "HTTP/1.1 200 OK`r`nContent-Type: $ctype`r`nContent-Length: $($bytes.Length)`r`nCache-Control: $cc`r`nX-Content-Type-Options: nosniff`r`nConnection: close`r`n`r`n"
    }
    else {
      $body = [System.Text.Encoding]::UTF8.GetBytes('404 - Fichier introuvable')
      $bytes = $body
      $head = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain; charset=utf-8`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n"
    }

    $headBytes = [System.Text.Encoding]::ASCII.GetBytes($head)
    $stream.Write($headBytes, 0, $headBytes.Length)
    if ($bytes.Length -gt 0) { $stream.Write($bytes, 0, $bytes.Length) }
    $stream.Flush()
  }
  catch { }
  finally {
    try { $client.Close() } catch { }
  }
}
