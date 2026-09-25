# Rare Royale - local launcher for Windows.
# Serves the prebuilt game from the "docs" folder on http://localhost and opens the browser.
# Compatible with Windows PowerShell 5.1 and PowerShell 7. No installs, no admin rights.

param([int]$Port = 4190, [switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\docs'))
if (-not (Test-Path (Join-Path $root 'index.html'))) {
    Write-Host "Game files not found in: $root" -ForegroundColor Red
    Write-Host 'The "docs" folder must sit next to this launcher.'
    Read-Host 'Press Enter to close'
    exit 1
}

$mime = @{
    '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
    '.mjs' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'; '.svg' = 'image/svg+xml'
    '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.gif' = 'image/gif'
    '.webp' = 'image/webp'; '.ico' = 'image/x-icon'; '.woff' = 'font/woff'; '.woff2' = 'font/woff2'
    '.ttf' = 'font/ttf'; '.mp3' = 'audio/mpeg'; '.ogg' = 'audio/ogg'; '.wav' = 'audio/wav'
    '.txt' = 'text/plain; charset=utf-8'; '.wasm' = 'application/wasm'
}

# Find a free port (4190, 4191, ...).
$listener = $null
for ($p = $Port; $p -lt $Port + 20; $p++) {
    $candidate = New-Object System.Net.HttpListener
    $candidate.Prefixes.Add("http://localhost:$p/")
    try { $candidate.Start(); $listener = $candidate; $Port = $p; break }
    catch { $candidate.Close() }
}
if (-not $listener) {
    Write-Host 'Could not open a local port (4190-4209 are busy).' -ForegroundColor Red
    Read-Host 'Press Enter to close'
    exit 1
}

$url = "http://localhost:$Port/"
Write-Host ''
Write-Host '  Rare Royale' -ForegroundColor Green
Write-Host "  Game is running at $url"
Write-Host '  Keep this window open while playing. Close it to stop the game.'
Write-Host ''
if (-not $NoBrowser) { Start-Process $url }

try {
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        $req = $ctx.Request; $res = $ctx.Response
        try {
            $rel = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/')
            if ($rel -eq '' -or $rel.EndsWith('/')) { $rel = $rel + 'index.html' }
            $full = [System.IO.Path]::GetFullPath((Join-Path $root $rel))
            $inside = $full.StartsWith($root + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
            if ($inside -and (Test-Path $full -PathType Leaf) -and ($req.HttpMethod -eq 'GET' -or $req.HttpMethod -eq 'HEAD')) {
                $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
                $type = $mime[$ext]
                if (-not $type) { $type = 'application/octet-stream' }
                $bytes = [System.IO.File]::ReadAllBytes($full)
                $res.StatusCode = 200
                $res.ContentType = $type
                $res.Headers.Add('Cache-Control', 'no-store')
                $res.Headers.Add('X-Content-Type-Options', 'nosniff')
                $res.ContentLength64 = $bytes.Length
                if ($req.HttpMethod -eq 'GET') { $res.OutputStream.Write($bytes, 0, $bytes.Length) }
            } else {
                $res.StatusCode = 404
                $msg = [System.Text.Encoding]::UTF8.GetBytes('Not found')
                $res.ContentType = 'text/plain; charset=utf-8'
                $res.ContentLength64 = $msg.Length
                $res.OutputStream.Write($msg, 0, $msg.Length)
            }
            Write-Host ("  {0} {1} {2}" -f $res.StatusCode, $req.HttpMethod, $req.Url.AbsolutePath) -ForegroundColor DarkGray
        } catch {
            try { $res.StatusCode = 500 } catch {}
        } finally {
            try { $res.OutputStream.Close() } catch {}
        }
    }
} finally {
    $listener.Stop(); $listener.Close()
}
