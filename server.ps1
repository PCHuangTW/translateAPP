# LinguaFlow Lightweight Static Web Server
$ErrorActionPreference = "Continue"

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$port = 8080
$rootDir = $PSScriptRoot

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".htm"  = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".gif"  = "image/gif"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
    ".mp3"  = "audio/mpeg"
    ".wav"  = "audio/wav"
    ".webm" = "audio/webm"
}

# Detect Local IPv4
$ipObj = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } | Select-Object -First 1
$localIP = if ($ipObj) { $ipObj.IPAddress } else { "127.0.0.1" }

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $port)
$listener.Start()

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " LinguaFlow Local Web Server Started" -ForegroundColor Green
Write-Host " Local Access URL:   http://localhost:$port" -ForegroundColor Yellow
Write-Host " Mobile Access URL:  http://${localIP}:$port" -ForegroundColor Yellow
Write-Host " Project Directory:  $rootDir" -ForegroundColor Gray
Write-Host " Press [Ctrl + C] to stop the server" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        $client.ReceiveTimeout = 3000
        $client.SendTimeout = 3000

        try {
            $stream = $client.GetStream()
            $buffer = New-Object byte[] 8192
            $bytesRead = $stream.Read($buffer, 0, $buffer.Length)
            if ($bytesRead -gt 0) {
                $requestText = [System.Text.Encoding]::ASCII.GetString($buffer, 0, $bytesRead)
                $firstLine = ($requestText -split "`r`n")[0]
                $parts = $firstLine -split " "

                if ($parts.Length -ge 2 -and $parts[0] -eq "GET") {
                    $rawPath = ($parts[1] -split "\?")[0]
                    $decodedPath = [System.Uri]::UnescapeDataString($rawPath).TrimStart('/')
                    if ([string]::IsNullOrWhiteSpace($decodedPath)) {
                        $decodedPath = "index.html"
                    }

                    $fullPath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($rootDir, $decodedPath))
                    if ($fullPath.StartsWith($rootDir, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
                        $ext = [System.IO.Path]::GetExtension($fullPath).ToLower()
                        $contentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
                        $fileBytes = [System.IO.File]::ReadAllBytes($fullPath)

                        $header = "HTTP/1.1 200 OK`r`nContent-Type: $contentType`r`nContent-Length: $($fileBytes.Length)`r`nAccess-Control-Allow-Origin: *`r`nConnection: close`r`n`r`n"
                        $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
                        $stream.Write($headerBytes, 0, $headerBytes.Length)
                        $stream.Write($fileBytes, 0, $fileBytes.Length)
                        $stream.Flush()
                        Write-Host "[200 OK] $decodedPath" -ForegroundColor DarkGreen
                    } else {
                        $notFound = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
                        $header = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain`r`nContent-Length: $($notFound.Length)`r`nConnection: close`r`n`r`n"
                        $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
                        $stream.Write($headerBytes, 0, $headerBytes.Length)
                        $stream.Write($notFound, 0, $notFound.Length)
                        $stream.Flush()
                        Write-Host "[404 Not Found] $decodedPath" -ForegroundColor DarkYellow
                    }
                }
            }
        } catch {
            # Catch transient network close
        } finally {
            $client.Close()
        }
    }
} finally {
    $listener.Stop()
}
