<#
.SYNOPSIS
  Schedules backup-to-drive.ps1 every day at 13:30, after PocketBase's 13:00 backup.

.DESCRIPTION
  Run once, in PowerShell opened as Administrator:
    powershell -ExecutionPolicy Bypass -File .\register-backup-task.ps1 -DataDir D:\PSEOTracker\pb_data -BackupDir E:\PSEOTrackerBackups
  The task runs as SYSTEM, whether or not anyone is signed in. If the PC was off at 13:30,
  it runs as soon as the PC is on again.
#>
param(
  [string]$DataDir = 'D:\PSEOTracker\pb_data',
  [string]$BackupDir = 'E:\PSEOTrackerBackups',
  [int]$Keep = 30,
  [string]$At = '13:30'
)
$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'backup-to-drive.ps1'
$taskArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$script`" -DataDir `"$DataDir`" -BackupDir `"$BackupDir`" -Keep $Keep"
# The full path: SYSTEM's PATH may not include PowerShell's folder (then the task fails with 0x80070002).
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$action = New-ScheduledTaskAction -Execute $powershell -Argument $taskArgs
$trigger = New-ScheduledTaskTrigger -Daily -At $At
# Battery allowed: a UPS on USB makes Windows report battery power during a power cut.
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName 'PSEO Tracker backup copy' -Action $action -Trigger $trigger -Settings $settings -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
Write-Host "Scheduled: every day at $At, copy backups from $DataDir\backups to $BackupDir (keeping $Keep)."
Write-Host 'Run it now to test:  Start-ScheduledTask -TaskName "PSEO Tracker backup copy"'
