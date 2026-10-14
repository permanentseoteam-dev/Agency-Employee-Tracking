<#
.SYNOPSIS
  Restore drill: proves a backup zip can be brought back, without touching the live server.

.DESCRIPTION
  Unzips the newest backup (or -Zip) into a temporary folder, starts a second PocketBase on
  127.0.0.1:8099 with it, signs in with a throwaway superuser created only in that copy, and
  prints how many records each important collection holds. Then it stops and deletes the copy.
    powershell -ExecutionPolicy Bypass -File .\restore-drill.ps1 -BackupDir E:\PSEOTrackerBackups

  To restore for real after a disaster, see docs/deployment.md ("Restoring a backup").
#>
param(
  [string]$BackupDir = 'E:\PSEOTrackerBackups',
  [string]$Zip = '',
  [string]$ServerDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [int]$Port = 8099
)
$ErrorActionPreference = 'Stop'

if (-not $Zip) {
  $newest = Get-ChildItem -Path $BackupDir -Filter '*.zip' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $newest) { throw "No backup zips in $BackupDir." }
  $Zip = $newest.FullName
}
$exe = Join-Path $ServerDir 'pocketbase.exe'
$scratch = Join-Path ([IO.Path]::GetTempPath()) ('agency-restore-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
$data = Join-Path $scratch 'pb_data'
New-Item -ItemType Directory -Force -Path $data | Out-Null
Write-Host "Restoring $Zip into $data"
Expand-Archive -Path $Zip -DestinationPath $data -Force
if (-not (Test-Path (Join-Path $data 'data.db'))) { throw 'The zip has no data.db. Is it a PocketBase backup?' }

$common = @('--dir', $data, '--migrationsDir', (Join-Path $ServerDir 'pb_migrations'), '--hooksDir', (Join-Path $ServerDir 'pb_hooks'))
$email = 'restore-drill@local.test'
$password = 'Drill-' + [Guid]::NewGuid().ToString('N').Substring(0, 12)
& $exe superuser upsert $email $password @common | Out-Null

$proc = Start-Process -FilePath $exe -ArgumentList (@('serve', '--http', "127.0.0.1:$Port") + $common) -PassThru -WindowStyle Hidden
try {
  $up = $false
  for ($i = 0; $i -lt 50 -and -not $up; $i++) {
    Start-Sleep -Milliseconds 300
    try { Invoke-RestMethod "http://127.0.0.1:$Port/api/health" -TimeoutSec 2 | Out-Null; $up = $true } catch {}
  }
  if (-not $up) { throw 'The restored copy did not start.' }
  $auth = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$Port/api/collections/_superusers/auth-with-password" -ContentType 'application/json' -Body (@{ identity = $email; password = $password } | ConvertTo-Json)
  $headers = @{ Authorization = $auth.token }
  Write-Host ''
  Write-Host 'Records in the restored copy:'
  $total = 0
  foreach ($c in 'users', 'teams', 'salaries', 'activity_segments', 'attendance', 'leave_requests', 'holidays', 'payroll_runs', 'payroll_items') {
    $n = (Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/collections/$c/records?perPage=1&skipTotal=0" -Headers $headers).totalItems
    $total += $n
    Write-Host ('  {0,-18} {1}' -f $c, $n)
  }
  $latest = (Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/collections/activity_segments/records?perPage=1&sort=-started_at" -Headers $headers).items
  if ($latest) { Write-Host "  newest tracked time: $($latest[0].started_at) (UTC)" }
  Write-Host ''
  if ($total -gt 0) { Write-Host "Restore drill passed: $(Split-Path $Zip -Leaf) restores and its data is readable." -ForegroundColor Green }
  else { Write-Warning 'The copy started but holds no records. Check that the right zip was used.' }
} finally {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 500
  Remove-Item -Recurse -Force $scratch -ErrorAction SilentlyContinue
}
