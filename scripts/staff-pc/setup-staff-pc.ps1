<#
.SYNOPSIS
  Sets up a staff PC or laptop for PSEO Tracker: Tailscale (the agency's private network), then the app.

.DESCRIPTION
  Run by the office setup file (PSEO-Tracker-Office-Setup-<version>.exe), or by double-clicking
  "Set up this PC.cmd" in the same folder. The folder also needs:
    - PSEO-Tracker-Setup-<version>.exe
    - tailscale-setup-<version>-amd64.msi (optional: downloaded when missing)
    - tailscale-key.txt with the auth key (optional: asked for when missing)
  Steps:
    1. Installs Tailscale (always on) and joins the agency network with the auth key. A PC whose
       Tailscale is signed in to another account is switched to the agency network.
       Windows asks for permission once.
    2. Checks that the PSEO Tracker server answers.
    3. Installs PSEO Tracker for the person signed in to Windows, and opens it.
  Safe to run again: finished steps are skipped. -CheckOnly reports what it finds and changes nothing.
#>
param(
  [string]$Server = 'agency-server',
  # Report the files, the key, Tailscale and the server; install nothing.
  [switch]$CheckOnly,
  # Internal: the part that runs as administrator.
  [switch]$TailscaleOnly,
  # Internal, with -TailscaleOnly: leave another Tailscale account and join the agency network.
  [switch]$SwitchAccount,
  # Close the window at the end when everything worked (errors always wait for Enter).
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

function Get-Tailnet {
  $ErrorActionPreference = 'Continue'
  try { (& $tailscale status --json 2>$null | Out-String | ConvertFrom-Json).CurrentTailnet.Name } catch { '' }
}

function Get-Key {
  $keyFile = Join-Path $here 'tailscale-key.txt'
  if (Test-Path $keyFile) { return (Get-Content -Path $keyFile -Raw).Trim() }
  return ''
}

function Test-Server([int]$Tries) {
  for ($i = 0; $i -lt $Tries; $i++) {
    try { Invoke-RestMethod -Uri "http://$($Server):8090/api/health" -TimeoutSec 5 -UseBasicParsing | Out-Null; return $true }
    catch { if ($i -lt $Tries - 1) { Start-Sleep -Seconds 3 } }
  }
  return $false
}

function Close-Window([int]$Code) {
  if ($Code -ne 0 -or -not $NoPause) { Read-Host 'Press Enter to close this window' | Out-Null }
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
    if ($SwitchAccount -or (Get-TailscaleState) -ne 'Running') {
      $key = Get-Key
      while ($key -notlike 'tskey-*') { $key = (Read-Host 'Paste the Tailscale auth key from your admin (it starts with tskey-)').Trim() }
      $ErrorActionPreference = 'Continue'
      if ($SwitchAccount) {
        Write-Host "Leaving the other Tailscale account ($(Get-Tailnet)) and joining the agency network..."
        # --reset: the old account's settings would otherwise block the change.
        & $tailscale up --reset --force-reauth "--authkey=$key" --unattended --timeout=60s 2>&1 | ForEach-Object { Write-Host "  $_" }
      } else {
        Write-Host 'Joining the agency network...'
        # --unattended must be given: the installer's TS_UNATTENDEDMODE=always already set it.
        & $tailscale up "--authkey=$key" --unattended --timeout=60s 2>&1 | ForEach-Object { Write-Host "  $_" }
      }
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

if ($CheckOnly) {
  # ---- report only --------------------------------------------------------------
  $installer = Get-ChildItem -Path $here -Filter 'PSEO-Tracker-Setup-*.exe' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  $msi = Get-ChildItem -Path $here -Filter 'tailscale-setup-*-amd64.msi' -File | Select-Object -First 1
  $key = Get-Key
  $state = Get-TailscaleState
  $answers = $state -eq 'Running' -and (Test-Server 1)
  Write-Host "PSEO Tracker installer:   $(if ($installer) { $installer.Name } else { 'MISSING' })"
  Write-Host "Tailscale installer:      $(if ($msi) { $msi.Name } else { 'not included (downloaded when needed)' })"
  Write-Host "Tailscale key:            $(if ($key -like 'tskey-auth-*') { 'present (' + $key.Substring(0, 11) + '...)' } elseif ($key) { 'WRONG FORMAT' } else { 'MISSING' })"
  Write-Host "Tailscale on this PC:     $state$(if ($state -eq 'Running') { ', network ' + (Get-Tailnet) })"
  Write-Host "Server $($Server):8090:   $(if ($answers) { 'answers' } else { 'does not answer' })"
  Write-Host 'Check only: nothing was installed or changed.'
  $ok = $installer -and ($key -like 'tskey-auth-*')
  Close-Window $(if ($ok) { 0 } else { 1 })
}

# ---- as the person signed in to Windows ---------------------------------------
try {
  Write-Host 'PSEO Tracker: setting up this PC' -ForegroundColor Cyan
  $state = Get-TailscaleState
  $switch = $false
  if ($state -eq 'Running') {
    if (Test-Server 2) {
      Write-Host 'Step 1 of 3: Tailscale is already on the agency network.'
    } elseif ((Get-Key) -like 'tskey-*') {
      Write-Host "Step 1 of 3: Tailscale is signed in to another account ($(Get-Tailnet)). Switching it to the agency network."
      Write-Host '  Windows asks for permission: click Yes.'
      $switch = $true
    } else {
      throw "Tailscale is signed in to another account ($(Get-Tailnet)). Sign it in with the agency's Tailscale account, then run this again."
    }
  } else {
    Write-Host 'Step 1 of 3: Tailscale. Windows asks for permission: click Yes.'
  }
  if ($state -ne 'Running' -or $switch) {
    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -TailscaleOnly -Server $Server"
    if ($switch) { $arguments += ' -SwitchAccount' }
    $elevated = Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -PassThru -ArgumentList $arguments
    if ($elevated.ExitCode -ne 0 -or (Get-TailscaleState) -ne 'Running') { throw 'Tailscale is not connected yet. Run this again.' }
  }

  Write-Host "Step 2 of 3: checking the server ($Server)..."
  if (-not (Test-Server 20)) { throw "The server http://$($Server):8090 does not answer. Is the server PC switched on? Ask your admin." }
  Write-Host '  the server answers' -ForegroundColor Green

  Write-Host 'Step 3 of 3: installing PSEO Tracker...'
  $installer = Get-ChildItem -Path $here -Filter 'PSEO-Tracker-Setup-*.exe' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $installer) { throw "PSEO-Tracker-Setup-<version>.exe is missing from $here." }
  Unblock-File -Path $installer.FullName # a copy from Google Drive or email would otherwise show "Windows protected your PC"
  Start-Process -FilePath $installer.FullName -Wait
  Write-Host ''
  Write-Host 'Done. PSEO Tracker is open: sign in, or click "Create an account".' -ForegroundColor Green
  Write-Host 'From now on it starts by itself whenever this PC starts, and records active and idle time.'
  Close-Window 0
} catch {
  Write-Host ''
  Write-Host "Stopped: $($_.Exception.Message)" -ForegroundColor Red
  Close-Window 1
}
