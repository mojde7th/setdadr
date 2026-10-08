# Starts Dilara TTS API + public Cloudflare tunnel, writes tts-endpoint.js
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$cf = Join-Path $PSScriptRoot "cloudflared.exe"
$api = Join-Path $PSScriptRoot "tts_api.py"
$endpointJs = Join-Path $root "tts-endpoint.js"

Write-Host "Starting TTS API on :8787 ..."
Start-Process -FilePath "python" -ArgumentList "`"$api`"" -WorkingDirectory $root -WindowStyle Minimized

Start-Sleep -Seconds 2
$errLog = Join-Path $PSScriptRoot "cf_err.txt"
$outLog = Join-Path $PSScriptRoot "cf_out.txt"
Remove-Item $errLog, $outLog -ErrorAction SilentlyContinue
Write-Host "Starting Cloudflare quick tunnel ..."
Start-Process -FilePath $cf -ArgumentList @("tunnel", "--url", "http://127.0.0.1:8787") -RedirectStandardError $errLog -RedirectStandardOutput $outLog -WindowStyle Minimized

$url = $null
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Seconds 1
  if (Test-Path $errLog) {
    $m = Select-String -Path $errLog -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" | Select-Object -First 1
    if ($m) {
      $url = [regex]::Match($m.Line, "https://[a-z0-9-]+\.trycloudflare\.com").Value
      break
    }
  }
}

if (-not $url) {
  Write-Host "Tunnel URL not found. Check tools/cf_err.txt"
  exit 1
}

$js = @"
// Ø¢Ø¯Ø±Ø³ Ø³Ø±ÙˆØ± ØµØ¯Ø§ÛŒ Ø¯ÛŒÙ„Ø§Ø±Ø§ (Ù‡Ø± Ø¬Ù…Ù„Ù‡). Ø¨Ø§ tools/start_tts_public.ps1 Ø¨Ù‡ Ø±ÙˆØ² Ù…ÛŒ Ø´ÙˆØ¯.
window.SETDADR_TTS_API = "$url";
"@
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($endpointJs, $js, $utf8NoBom)

Write-Host "TTS public URL: $url"
Write-Host "Wrote $endpointJs"
Write-Host "Keep this PC on. Commit+push tts-endpoint.js so phone can use it."
