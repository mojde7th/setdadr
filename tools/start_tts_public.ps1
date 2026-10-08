# Starts Dilara TTS API + public Cloudflare tunnel, writes tts-endpoint.js
$ErrorActionPreference = "Stop"
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -ErrorAction SilentlyContinue
if (-not $root) { $root = Resolve-Path (Join-Path $PSScriptRoot "..") }
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
Start-Process -FilePath $cf -ArgumentList @("tunnel","--url","http://127.0.0.1:8787") -RedirectStandardError $errLog -RedirectStandardOutput $outLog -WindowStyle Minimized

$url = $null
for ($i = 0; $i -lt 30; $i++) {
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

@"
// آدرس سرور صدای دیلارا (هر جمله). با tools/start_tts_public.ps1 به‌روز می‌شود.
window.SETDADR_TTS_API = `"$url`";
"@ | Set-Content -Path $endpointJs -Encoding UTF8

Write-Host "TTS public URL: $url"
Write-Host "Wrote $endpointJs — commit+push so the phone can use it."
Write-Host "Keep this PC on while you need live sentence TTS; cached names work offline after first play."
