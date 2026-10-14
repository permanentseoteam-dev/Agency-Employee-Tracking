<#
.SYNOPSIS
  Sets up a staff PC or laptop for PSEO Tracker: Tailscale (the agency's private network), then the app.

.DESCRIPTION
  Double-click "Set up this PC.cmd" in the same folder. The folder also needs:
    - PSEO-Tracker-Setup-<version>.exe
    - tailscale-setup-<version>-amd64.msi (optional: downloaded when missing)
    - tailscale-key.txt with the auth key (optional: asked for when missing)
  Steps:
    1. Installs Tailscale (always on) and joins the agency network with the auth key from your admin.
       Windows asks for permission once.
    2. Checks that the PSEO Tracker server answers.
    3. Installs PSEO Tracker for the person signed in to Windows, and opens it.
  Safe to run again: finished steps are skipped.
#>
param(
  [string]$Server = 'agency-server',
  # Internal: the part that runs as administrator.
  [switch]$TailscaleOnly,
  [switch]$NoPause
)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$tailscale = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'

function Get-TailscaleState {
  $ErrorActionPreference = 'Continue' # a warning on stderr must not count as a failure
  if (-not (Test-Path $tailscale)) { return 'NotInstalled' }
  try { (& $tailscale status --json 2>$null | Out-String | ConvertFrom-Json).BackendState } catch { '' }
}

function Close-Window([int]$Code) {
  if (-not $NoPause) { Read-Host 'Press Enter to close this window' | Out-Null }
  exit $Code
}

if ($TailscaleOnly) {
  # ---- as administrator: install Tailscale and join the agency network ---------
  try {
    if (-not (Test-Path $tailscale)) {
      $msi = Get-ChildItem -Path $here -Filter 'tailscale-setup-*-amd64.msi' -File | Sort-Object Name -Descending | Select-Object -First 1
      if ($msi) {
        $msiPath = $msi.FullName
      } else {
        $msiPath = Join-Path $env:TEMP 'tailscale-setup-latest-amd64.msi'
        Write-Host 'Downloading Tailscale...'
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri 'https://pkgs.tailscale.com/stable/tailscale-setup-latest-amd64.msi' -OutFile $msiPath -UseBasicParsing
      }
      Write-Host 'Installing Tailscale (always on, also before anyone signs in to Windows)...'
      $install = Start-Process -FilePath 'msiexec.exe' -ArgumentList "/i `"$msiPath`" /quiet /norestart TS_UNATTENDEDMODE=always" -Wait -PassThru
      if ($install.ExitCode -notin 0, 3010) { throw "Installing Tailscale failed (msiexec exit code $($install.ExitCode))." }
      for ($i = 0; $i -lt 30 -and (Get-TailscaleState) -in @('NotInstalled', '', 'NoState'); $i++) { Start-Sleep -Seconds 1 }
    }
    if ((Get-TailscaleState) -ne 'Running') {
      $keyFile = Join-Path $here 'tailscale-key.txt'
      $key = ''
      if (Test-Path $keyFile) { $key = (Get-Content -Path $keyFile -Raw).Trim() }
      while ($key -notlike 'tskey-*') { $key = (Read-Host 'Paste the Tailscale auth key from your admin (it starts with tskey-)').Trim() }
      Write-Host 'Joining the agency network...'
      # --unattended must be given: the installer's TS_UNATTENDEDMODE=always already set it.
      $ErrorActionPreference = 'Continue'
      & $tailscale up "--authkey=$key" --unattended --timeout=60s 2>&1 | ForEach-Object { Write-Host "  $_" }
      $ErrorActionPreference = 'Stop'
    }
    if ((Get-TailscaleState) -ne 'Running') { throw 'Tailscale did not connect. Check the auth key with your admin, then run this again.' }
    Write-Host 'Tailscale is on.' -ForegroundColor Green
  } catch {
    Write-Host "Stopped: $($_.Exception.Message)" -ForegroundColor Red
    Close-Window 1
  }
  exit 0
}

# ---- as the person signed in to Windows ---------------------------------------
try {
  Write-Host 'PSEO Tracker: setting up this PC' -ForegroundColor Cyan
  if ((Get-TailscaleState) -eq 'Running') {
    Write-Host 'Step 1 of 3: Tailscale is already on.'
  } else {
    Write-Host 'Step 1 of 3: Tailscale. Windows asks for permission: click Yes.'
    $elevated = Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -PassThru `
      -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -TailscaleOnly -Server $Server"
    if ($elevated.ExitCode -ne 0 -or (Get-TailscaleState) -ne 'Running') { throw 'Tailscale is not connected yet. Run this again.' }
  }

  Write-Host "Step 2 of 3: checking the server ($Server)..."
  $answered = $false
  for ($i = 0; $i -lt 20 -and -not $answered; $i++) {
    try { Invoke-RestMethod -Uri "http://$($Server):8090/api/health" -TimeoutSec 5 -UseBasicParsing | Out-Null; $answered = $true }
    catch { Start-Sleep -Seconds 3 }
  }
  if (-not $answered) { throw "The server http://$($Server):8090 does not answer. Is the server PC switched on? Ask your admin." }
  Write-Host '  the server answers' -ForegroundColor Green

  Write-Host 'Step 3 of 3: installing PSEO Tracker...'
  $installer = Get-ChildItem -Path $here -Filter 'PSEO-Tracker-Setup-*.exe' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $installer) { throw "PSEO-Tracker-Setup-<version>.exe is missing from $here." }
  Unblock-File -Path $installer.FullName # a copy from Google Drive or email would otherwise show "Windows protected your PC"
  Start-Process -FilePath $installer.FullName -Wait
  Write-Host ''
  Write-Host 'Done. PSEO Tracker is open: sign in with the email and password from your admin.' -ForegroundColor Green
  Write-Host 'From now on it starts by itself whenever this PC starts, and records active and idle time.'
  Close-Window 0
} catch {
  Write-Host ''
  Write-Host "Stopped: $($_.Exception.Message)" -ForegroundColor Red
  Close-Window 1
}
