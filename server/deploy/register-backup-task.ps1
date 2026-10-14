<#
.SYNOPSIS
  Schedules backup-to-drive.ps1 every night at 03:00, after PocketBase's 02:00 backup.

.DESCRIPTION
  Run once, in PowerShell opened as Administrator:
    powershell -ExecutionPolicy Bypass -File .\register-backup-task.ps1 -DataDir D:\PSEOTracker\pb_data -BackupDir E:\PSEOTrackerBackups
  The task runs as SYSTEM, whether or not anyone is signed in.
#>
param(
  [string]$DataDir = 'D:\PSEOTracker\pb_data',
  [string]$BackupDir = 'E:\PSEOTrackerBackups',
  [int]$Keep = 30,
  [string]$At = '03:00'
)
$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'backup-to-drive.ps1'
$taskArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$script`" -DataDir `"$DataDir`" -BackupDir `"$BackupDir`" -Keep $Keep"
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $taskArgs
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName 'PSEO Tracker backup copy' -Action $action -Trigger $trigger -Settings $settings -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
Write-Host "Scheduled: every day at $At, copy backups from $DataDir\backups to $BackupDir (keeping $Keep)."
Write-Host 'Run it now to test:  Start-ScheduledTask -TaskName "PSEO Tracker backup copy"'
