<#
.SYNOPSIS
  Schedules scripts\backup-supabase.mjs (the live Supabase project) every day at 13:30.

.DESCRIPTION
  Run once, in PowerShell opened as Administrator, from the repo folder:
    powershell -ExecutionPolicy Bypass -File .\scripts\register-supabase-backup-task.ps1
  The task runs as SYSTEM, whether or not anyone is signed in. If the PC was off at 13:30, it
  runs as soon as the PC is on again. Backups go to E:\PSEOTrackerBackups\supabase (the last
  14 days); each run is logged in backup.log there. A daily run also keeps the free project
  from pausing.
#>
param(
  [string]$Target = 'live',
  [string]$OutDir = 'E:\PSEOTrackerBackups\supabase',
  [int]$Keep = 14,
  [string]$At = '13:30',
  # SYSTEM has its own LOCALAPPDATA, so the tools folder is passed explicitly.
  [string]$PgBin = (Join-Path $env:LOCALAPPDATA 'PSEO Tracker Tools\pgsql\bin'),
  [string]$Node = (Get-Command node).Source
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$script = Join-Path $PSScriptRoot 'backup-supabase.mjs'
if (-not (Test-Path (Join-Path $PgBin 'pg_dump.exe'))) { throw "pg_dump.exe not found in $PgBin" }
$taskArgs = "`"$script`" $Target --out `"$OutDir`" --keep $Keep --pg-bin `"$PgBin`""
$action = New-ScheduledTaskAction -Execute $Node -Argument $taskArgs -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -Daily -At $At
# Battery allowed: a UPS on USB makes Windows report battery power during a power cut.
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName 'PSEO Tracker Supabase backup' -Action $action -Trigger $trigger -Settings $settings -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
Write-Host "Scheduled: every day at $At, back up the $Target project to $OutDir (keeping $Keep days)."
Write-Host 'Run it now to test:  Start-ScheduledTask -TaskName "PSEO Tracker Supabase backup"'
