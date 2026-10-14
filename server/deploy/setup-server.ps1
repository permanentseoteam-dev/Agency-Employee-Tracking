<#
.SYNOPSIS
  Turns this PC into the PSEO Tracker server in one go: the database as a Windows service, daily backups to E:,
  your first login, and Tailscale so staff PCs and laptops can reach it.

.DESCRIPTION
  Run in PowerShell opened as Administrator, from the repo's server\deploy folder:
    powershell -ExecutionPolicy Bypass -File .\setup-server.ps1
  Optional: -TailscaleMsi <path to tailscale-setup-*-amd64.msi> and -Nssm <path to win64\nssm.exe>;
  without them both are downloaded.

  Steps (safe to run again; finished steps are refreshed or skipped):
    1. Copies pocketbase.exe, pb_migrations, pb_hooks and deploy to D:\PSEOTracker\server. The live server runs
       this copy, so changes in the repo only go live when you run this script again.
    2. Stops the development database (scheduled task "PSEO Tracker Database"), which also uses port 8090.
    3. Installs the "PocketBase" service (install-service.ps1), data in D:\PSEOTracker\pb_data.
    4. Schedules the daily backup copy to E:\PSEOTrackerBackups (register-backup-task.ps1).
    5. First run only: creates your login (create-first-admin.ps1) and tests the backup copy.
    6. Installs Tailscale (always on, even before anyone signs in to Windows) and signs this PC in as
       "agency-server". Your browser opens for the Tailscale sign-in.
  Everything shown is also written to D:\PSEOTracker\setup-log.txt.
#>
param(
  [string]$Root = 'D:\PSEOTracker',
  [string]$BackupDir = 'E:\PSEOTrackerBackups',
  [string]$Hostname = 'agency-server',
  [string]$TailscaleMsi = '',
  [string]$Nssm = '',
  # Close the window at the end instead of waiting for Enter.
  [switch]$NoPause
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { throw 'Run this in PowerShell opened as Administrator.' }

New-Item -ItemType Directory -Force -Path $Root | Out-Null
Start-Transcript -Path (Join-Path $Root 'setup-log.txt') -Append | Out-Null

$repoServer = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$serverDir = Join-Path $Root 'server'
$dataDir = Join-Path $Root 'pb_data'
$deployDir = Join-Path $serverDir 'deploy'
$serviceExe = Join-Path $serverDir 'pocketbase.exe'
$tailscale = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'

function Step([string]$Text) { Write-Host ''; Write-Host "== $Text" -ForegroundColor Cyan }

function Get-Download([string]$Uri, [string]$OutFile) {
  for ($i = 1; $i -le 6; $i++) {
    try { Invoke-WebRequest -Uri $Uri -OutFile $OutFile -UseBasicParsing -TimeoutSec 300; return }
    catch { Write-Host "  download attempt $i failed: $($_.Exception.Message)"; Start-Sleep -Seconds (3 * $i) }
  }
  throw "Could not download $Uri"
}

try {
  # ---- 1. server files ---------------------------------------------------------
  Step "1/6 Copying the server files to $serverDir"
  $service = Get-Service -Name 'PocketBase' -ErrorAction SilentlyContinue
  if ($service -and $service.Status -ne 'Stopped') {
    Write-Host '  stopping the PocketBase service to update its files'
    Stop-Service -Name 'PocketBase' -Force
  }
  New-Item -ItemType Directory -Force -Path $serverDir | Out-Null
  Copy-Item -Path (Join-Path $repoServer 'pocketbase.exe') -Destination $serviceExe -Force
  foreach ($folder in 'pb_migrations', 'pb_hooks', 'deploy') {
    robocopy (Join-Path $repoServer $folder) (Join-Path $serverDir $folder) /MIR /XF nssm.exe /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Copying $folder failed (robocopy exit code $LASTEXITCODE)." }
  }
  $nssmExe = Join-Path $deployDir 'nssm.exe'
  if ($Nssm) { Copy-Item -Path $Nssm -Destination $nssmExe -Force }
  if (-not (Test-Path $nssmExe)) {
    Write-Host '  downloading NSSM (the service wrapper) from nssm.cc'
    $zip = Join-Path $env:TEMP 'nssm-2.24.zip'
    $unzipped = Join-Path $env:TEMP 'nssm-2.24-unzipped'
    Get-Download 'https://nssm.cc/release/nssm-2.24.zip' $zip
    Expand-Archive -Path $zip -DestinationPath $unzipped -Force
    Copy-Item -Path (Join-Path $unzipped 'nssm-2.24\win64\nssm.exe') -Destination $nssmExe -Force
  }
  Write-Host '  done'

  # ---- 2. development database -------------------------------------------------
  Step '2/6 Stopping the development database (it also uses port 8090)'
  $devTask = Get-ScheduledTask -TaskName 'PSEO Tracker Database' -ErrorAction SilentlyContinue
  if ($devTask -and $devTask.State -ne 'Disabled') {
    Disable-ScheduledTask -TaskName 'PSEO Tracker Database' | Out-Null
    Write-Host '  turned off the task "PSEO Tracker Database" (it started the development database at sign-in)'
  }
  $listeners = @(Get-NetTCPConnection -LocalPort 8090 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
  foreach ($procId in $listeners) {
    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if ($proc -and $proc.Path -ne $serviceExe) {
      Stop-Process -Id $procId -Force
      Write-Host "  stopped $($proc.Path) (PID $procId)"
    }
  }
  Start-Sleep -Seconds 2

  # ---- 3. the database service ---------------------------------------------------
  Step "3/6 Installing the PocketBase service (data in $dataDir)"
  & (Join-Path $deployDir 'install-service.ps1') -DataDir $dataDir -ServerDir $serverDir -Nssm $nssmExe

  # ---- 4. backups ------------------------------------------------------------------
  Step "4/6 Scheduling the daily backup copy to $BackupDir"
  & (Join-Path $deployDir 'register-backup-task.ps1') -DataDir $dataDir -BackupDir $BackupDir

  # ---- 5. first login --------------------------------------------------------------
  $marker = Join-Path $Root 'first-login-created.txt'
  if (Test-Path $marker) {
    Step '5/6 First login: already created (run create-first-admin.ps1 to reset it)'
  } else {
    Step '5/6 Creating your first login'
    & (Join-Path $deployDir 'create-first-admin.ps1') -DataDir $dataDir -Exe $serviceExe
    Set-Content -Path $marker -Value "First login created $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
  }

  # Test the backup copy task as it will run every day (as SYSTEM), once a backup exists.
  if (@(Get-ChildItem -Path (Join-Path $dataDir 'backups') -Filter '*.zip' -File -ErrorAction SilentlyContinue).Count -gt 0) {
    Write-Host '  testing the backup copy task'
    Start-ScheduledTask -TaskName 'PSEO Tracker backup copy'
    for ($i = 0; $i -lt 60; $i++) {
      Start-Sleep -Seconds 1
      if ($i -ge 3 -and (Get-ScheduledTask -TaskName 'PSEO Tracker backup copy').State -ne 'Running') { break }
    }
    $result = (Get-ScheduledTaskInfo -TaskName 'PSEO Tracker backup copy').LastTaskResult
    $copies = @(Get-ChildItem -Path $BackupDir -Filter '*.zip' -File -ErrorAction SilentlyContinue).Count
    if ($result -eq 0 -and $copies -gt 0) { Write-Host "  backup copy works: $copies zip file(s) in $BackupDir" -ForegroundColor Green }
    else { Write-Warning ("The backup copy task failed (result 0x{0:X}, {1} zip file(s) in {2})." -f $result, $copies, $BackupDir) }
  }

  # ---- 6. Tailscale ---------------------------------------------------------------
  Step "6/6 Tailscale (the private network staff PCs use to reach this PC as $Hostname)"
  if (-not (Test-Path $tailscale)) {
    if (-not $TailscaleMsi) {
      $TailscaleMsi = Join-Path $env:TEMP 'tailscale-setup-latest-amd64.msi'
      Write-Host '  downloading Tailscale'
      Get-Download 'https://pkgs.tailscale.com/stable/tailscale-setup-latest-amd64.msi' $TailscaleMsi
    }
    Write-Host '  installing Tailscale (always on, also before anyone signs in to Windows)'
    $msi = Start-Process -FilePath 'msiexec.exe' -ArgumentList "/i `"$TailscaleMsi`" /quiet /norestart TS_UNATTENDEDMODE=always" -Wait -PassThru
    if ($msi.ExitCode -notin 0, 3010) { throw "Installing Tailscale failed (msiexec exit code $($msi.ExitCode))." }
    Start-Sleep -Seconds 8
  }

  function Get-TailscaleState {
    $ErrorActionPreference = 'Continue' # a warning on stderr must not count as a failure
    try { (& $tailscale status --json 2>$null | Out-String | ConvertFrom-Json).BackendState } catch { '' }
  }
  if ((Get-TailscaleState) -ne 'Running') {
    $upLog = Join-Path $Root 'tailscale-up.txt'
    Remove-Item $upLog, "$upLog.out" -ErrorAction SilentlyContinue
    # --unattended must be repeated: the installer's TS_UNATTENDEDMODE=always already set it.
    $up = Start-Process -FilePath $tailscale -ArgumentList "up --hostname=$Hostname --unattended --timeout=30m" -NoNewWindow -PassThru `
      -RedirectStandardError $upLog -RedirectStandardOutput "$upLog.out"
    $opened = $false
    while (-not $up.HasExited) {
      if (-not $opened) {
        $match = Select-String -Path $upLog, "$upLog.out" -Pattern 'https://login\.tailscale\.com/\S+' -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($match) {
          $loginUrl = $match.Matches[0].Value
          Write-Host ''
          Write-Host '  Sign in to Tailscale in the browser window that just opened.' -ForegroundColor Yellow
          Write-Host '  New to Tailscale? Sign up there with the agency''s Google or Microsoft account.' -ForegroundColor Yellow
          Write-Host "  (If no window opened, copy this link into your browser: $loginUrl)"
          Start-Process -FilePath 'explorer.exe' -ArgumentList $loginUrl # opens the normal, non-admin browser
          $opened = $true
        }
      }
      Start-Sleep -Seconds 1
    }
  }
  if ((Get-TailscaleState) -ne 'Running') {
    $upLog = Join-Path $Root 'tailscale-up.txt'
    if (Test-Path $upLog) { Get-Content $upLog | ForEach-Object { Write-Host "  tailscale: $_" } }
    Write-Warning 'Tailscale is not signed in yet. Sign in from the Tailscale icon by the clock, then run this script again.'
  } else {
    $self = (& $tailscale status --json | Out-String | ConvertFrom-Json).Self
    Write-Host "  Tailscale is on: this PC is $($self.DNSName.TrimEnd('.')) ($($self.TailscaleIPs -join ', '))"
    try {
      Invoke-RestMethod "http://$($Hostname):8090/api/health" -TimeoutSec 10 -UseBasicParsing | Out-Null
      Write-Host "  The server answers at http://$($Hostname):8090" -ForegroundColor Green
    } catch {
      Write-Warning "http://$($Hostname):8090 did not answer yet: $($_.Exception.Message). If Tailscale renamed this PC, rename it to $Hostname in the Tailscale admin console."
    }
    if ($self.KeyExpiry -and -not $self.Tags) {
      $expires = [string]$self.KeyExpiry
      if ($expires.Length -gt 10) { $expires = $expires.Substring(0, 10) }
      Write-Warning "This PC's Tailscale sign-in expires on $expires. In the Tailscale admin console, open Machines > $Hostname > ... > Disable key expiry, so the server never drops off."
    }
  }

  Write-Host ''
  Write-Host 'SETUP FINISHED' -ForegroundColor Green
  Write-Host "  Server for staff PCs:  http://$($Hostname):8090"
  Write-Host '  Database dashboard:    http://127.0.0.1:8090/_/  (on this PC)'
  Write-Host "  Log of this setup:     $Root\setup-log.txt"
} catch {
  Write-Host ''
  Write-Host "SETUP STOPPED: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'Fix the problem above, then run this script again; finished steps are skipped or refreshed.'
} finally {
  Stop-Transcript | Out-Null
}
if (-not $NoPause) { Read-Host 'Press Enter to close this window' | Out-Null }
