# Starts Dilara TTS API + public Cloudflare tunnel, writes tts-endpoint.js
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$cf = Join-Path $PSScriptRoot "cloudflared.exe"
$api = Join-Path $root "tts-service\tts_api.py"
if (-not (Test-Path $api)) { $api = Join-Path $PSScriptRoot "tts_api.py" }
$endpointJs = Join-Path $root "tts-endpoint.js"

if (-not (Test-Path $cf)) {
  Write-Host "Downloading cloudflared..."
  Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $cf -UseBasicParsing
}

Write-Host "Starting TTS API on :8787 ..."
Start-Process -FilePath "python" -ArgumentList "-u","`"$api`"" -WorkingDirectory (Split-Path $api) -WindowStyle Minimized
Start-Sleep -Seconds 2

$errLog = Join-Path $PSScriptRoot "cf_err.txt"
$outLog = Join-Path $PSScriptRoot "cf_out.txt"
Remove-Item $errLog, $outLog -ErrorAction SilentlyContinue
Write-Host "Starting Cloudflare quick tunnel ..."
Start-Process -FilePath $cf -ArgumentList @("tunnel", "--url", "http://127.0.0.1:8787", "--no-autoupdate") -RedirectStandardError $errLog -RedirectStandardOutput $outLog -WindowStyle Minimized

$url = $null
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Seconds 1
  foreach ($log in @($errLog, $outLog)) {
    if (-not (Test-Path $log)) { continue }
    $m = Select-String -Path $log -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" | Select-Object -First 1
    if ($m) {
      $url = [regex]::Match($m.Line, "https://[a-z0-9-]+\.trycloudflare\.com").Value
      break
    }
  }
  if ($url) { break }
}

if (-not $url) {
  Write-Host "Tunnel URL not found. Check tools/cf_err.txt"
  exit 1
}

$js = @"
// Live Dilara TTS for arbitrary Persian on phone (Safari/Chrome).
// Refresh with: tools/start_tts_public.ps1  (keep PC awake)
window.SETDADR_TTS_API = "$url";
"@
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($endpointJs, $js, $utf8NoBom)

Write-Host "TTS public URL: $url"
Write-Host "Wrote $endpointJs"
Write-Host "Keep this PC on. Commit+push tts-endpoint.js so phone can use it."
