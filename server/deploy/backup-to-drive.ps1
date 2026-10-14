<#
.SYNOPSIS
  Copies PocketBase's daily backup zips to a backup drive (E: by default) and keeps the newest ones.

.DESCRIPTION
  PocketBase makes a backup zip every night at 02:00 (Pakistan time) in <DataDir>\backups and keeps 14.
  This script copies any zip not yet on the backup drive, then deletes the oldest copies beyond -Keep.
  register-backup-task.ps1 runs it every night at 03:00. It can also be run by hand at any time.

  Note: a second drive in the same PC protects against a dead C:/D: drive or a corrupted database,
  but not against theft, fire or ransomware. Copy the newest zip somewhere else now and then.
#>
param(
  [string]$DataDir = 'D:\AgencyTracker\pb_data',
  [string]$BackupDir = 'E:\AgencyTrackerBackups',
  [int]$Keep = 30
)
$ErrorActionPreference = 'Stop'

$source = Join-Path $DataDir 'backups'
if (-not (Test-Path $source)) { throw "No backups folder at $source. Has PocketBase made a backup yet? (Dashboard > Settings > Backups)" }
$drive = Split-Path -Qualifier $BackupDir
if ($drive -and -not (Test-Path "$drive\")) { throw "Backup drive $drive is not available." }
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

$copied = 0
foreach ($zip in Get-ChildItem -Path $source -Filter '*.zip' -File) {
  $target = Join-Path $BackupDir $zip.Name
  if (-not (Test-Path $target) -or (Get-Item $target).Length -ne $zip.Length) {
    Copy-Item -Path $zip.FullName -Destination $target -Force
    $copied++
  }
}

$old = Get-ChildItem -Path $BackupDir -Filter '*.zip' -File | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Keep
foreach ($f in $old) { Remove-Item $f.FullName -Force }

$newest = Get-ChildItem -Path $BackupDir -Filter '*.zip' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$line = '{0}  copied {1}, removed {2}, newest {3}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm'), $copied, @($old).Count, $(if ($newest) { $newest.Name } else { 'none' })
Add-Content -Path (Join-Path $BackupDir 'backup-log.txt') -Value $line
Write-Host $line
