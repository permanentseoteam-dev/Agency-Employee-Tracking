<#
.SYNOPSIS
  Installs PocketBase as an always-on Windows service on the office server PC (roadmap M12).

.DESCRIPTION
  Run once, in PowerShell opened as Administrator, from this folder:
    powershell -ExecutionPolicy Bypass -File .\install-service.ps1 -DataDir D:\AgencyTracker\pb_data

  What it does:
  - registers the service "PocketBase" with NSSM, starting at boot and restarting itself after a crash
  - gives PocketBase 30 s to shut down cleanly when the service stops (protects the database)
  - writes PocketBase's output to <DataDir>\..\logs
  - opens port 8090 in Windows Firewall for Tailscale addresses only (100.64.0.0/10), not the office LAN or internet
  - turns off sleep and hibernation while on mains power, so the server stays reachable
  It needs nssm.exe (https://nssm.cc/download, the 64-bit win64\nssm.exe) next to this script or passed with -Nssm.
#>
param(
  # Where the database lives. Use a non-C: drive (plan §9).
  [string]$DataDir = 'D:\AgencyTracker\pb_data',
  # The folder holding pocketbase.exe, pb_migrations and pb_hooks (default: the server folder above this script).
  [string]$ServerDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$Nssm = (Join-Path $PSScriptRoot 'nssm.exe'),
  [int]$Port = 8090,
  [string]$ServiceName = 'PocketBase'
)
$ErrorActionPreference = 'Stop'

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { throw 'Run this in PowerShell opened as Administrator.' }
$exe = Join-Path $ServerDir 'pocketbase.exe'
foreach ($p in @($exe, (Join-Path $ServerDir 'pb_migrations'), (Join-Path $ServerDir 'pb_hooks'))) {
  if (-not (Test-Path $p)) { throw "Not found: $p" }
}
if (-not (Test-Path $Nssm)) { throw "nssm.exe not found at $Nssm. Download it from https://nssm.cc/download and put win64\nssm.exe next to this script." }
if ($DataDir.StartsWith('C:', [StringComparison]::OrdinalIgnoreCase)) {
  Write-Warning 'The database is on C:. A non-system drive is safer if Windows has to be reinstalled.'
}

$logs = Join-Path (Split-Path $DataDir -Parent) 'logs'
New-Item -ItemType Directory -Force -Path $DataDir, $logs | Out-Null

if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
  Write-Host "Service $ServiceName exists; stopping it to update its settings."
  & $Nssm stop $ServiceName | Out-Null
} else {
  & $Nssm install $ServiceName $exe | Out-Null
}
$params = "serve --http 0.0.0.0:$Port --dir `"$DataDir`" --migrationsDir `"$(Join-Path $ServerDir 'pb_migrations')`" --hooksDir `"$(Join-Path $ServerDir 'pb_hooks')`""
& $Nssm set $ServiceName Application $exe | Out-Null
& $Nssm set $ServiceName AppParameters $params | Out-Null
& $Nssm set $ServiceName AppDirectory $ServerDir | Out-Null
& $Nssm set $ServiceName DisplayName 'Agency Tracker server (PocketBase)' | Out-Null
& $Nssm set $ServiceName Start SERVICE_AUTO_START | Out-Null
& $Nssm set $ServiceName AppStopMethodConsole 30000 | Out-Null
& $Nssm set $ServiceName AppExit Default Restart | Out-Null
& $Nssm set $ServiceName AppRestartDelay 5000 | Out-Null
& $Nssm set $ServiceName AppStdout (Join-Path $logs 'pocketbase.log') | Out-Null
& $Nssm set $ServiceName AppStderr (Join-Path $logs 'pocketbase.log') | Out-Null
& $Nssm set $ServiceName AppRotateFiles 1 | Out-Null
& $Nssm set $ServiceName AppRotateBytes 10485760 | Out-Null

$rule = 'Agency Tracker server (Tailscale only)'
Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName $rule -Direction Inbound -Protocol TCP -LocalPort $Port -RemoteAddress '100.64.0.0/10' -Action Allow | Out-Null

powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0

& $Nssm start $ServiceName | Out-Null
Start-Sleep -Seconds 3
try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 10
  Write-Host "PocketBase is running: $($health.message)"
} catch {
  Write-Warning "The service started but http://127.0.0.1:$Port/api/health did not answer yet. Check $logs\pocketbase.log."
}
Write-Host ''
Write-Host "Dashboard on this PC: http://127.0.0.1:$Port/_/"
Write-Host "Staff apps connect to:  http://$($env:COMPUTERNAME.ToLower()):$Port  (the Tailscale machine name; check it in the Tailscale admin console)"
