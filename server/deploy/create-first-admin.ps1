<#
.SYNOPSIS
  Creates the first login on a new server: a dashboard superuser and an app admin with the same email and password.

.DESCRIPTION
  setup-server.ps1 runs this for you. To run it by hand (PowerShell opened as Administrator, on the server PC, with
  the PocketBase service running):
    powershell -ExecutionPolicy Bypass -File .\create-first-admin.ps1 -DataDir D:\PSEOTracker\pb_data
  It asks for an email, a full name and a password. The password is typed into this window only and never saved.
  Running it again with the same email resets that password. Everyone else is added in the app
  (Organization > Add employee).
  Afterwards it makes a first backup, so the backup copy to E: can be tested right away.
#>
param(
  [string]$DataDir = 'D:\PSEOTracker\pb_data',
  [string]$Exe = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path 'pocketbase.exe'),
  [string]$Url = 'http://127.0.0.1:8090',
  [string]$TimeZoneId = 'Pakistan Standard Time',
  # Optional, for scripted runs; anything left out is asked for.
  [string]$Email = '',
  [string]$FullName = '',
  [Security.SecureString]$Password = $null
)
$ErrorActionPreference = 'Stop'

function ConvertTo-Plain([Security.SecureString]$Secure) {
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

function Invoke-Api([string]$Method, [string]$Path, $Body, [string]$Token) {
  $request = @{ Method = $Method; Uri = "$Url$Path"; Headers = @{}; TimeoutSec = 30; UseBasicParsing = $true }
  if ($Token) { $request.Headers.Authorization = $Token }
  if ($null -ne $Body) {
    # UTF-8 bytes: Windows PowerShell would otherwise send names with non-English letters garbled.
    $request.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Compress))
    $request.ContentType = 'application/json; charset=utf-8'
  }
  Invoke-RestMethod @request
}

$up = $false
for ($i = 0; $i -lt 30 -and -not $up; $i++) {
  try { Invoke-RestMethod "$Url/api/health" -TimeoutSec 3 -UseBasicParsing | Out-Null; $up = $true } catch { Start-Sleep -Seconds 1 }
}
if (-not $up) { throw "PocketBase is not answering at $Url. Is the PocketBase service running? (Start > Services > PocketBase)" }

Write-Host ''
Write-Host 'Create your login. It is your admin account in PSEO Tracker and your login for the database dashboard.'
$emailPattern = '^[^@\s"]+@[^@\s"]+\.[^@\s"]+$'
$email = $Email.Trim()
while ($email -notmatch $emailPattern) { $email = (Read-Host 'Your email').Trim() }
$name = $FullName.Trim()
while ($name.Length -lt 2) { $name = (Read-Host 'Your full name').Trim() }
if ($Password) {
  $secret = ConvertTo-Plain $Password
  if ($secret.Length -lt 10 -or $secret.Contains('"')) { throw 'The password needs at least 10 characters and no " character.' }
} else {
  while ($true) {
    $secret = ConvertTo-Plain (Read-Host 'Choose a password (at least 10 characters)' -AsSecureString)
    $again = ConvertTo-Plain (Read-Host 'Type the password again' -AsSecureString)
    if ($secret.Length -lt 10) { Write-Host 'Too short: use at least 10 characters.'; continue }
    if ($secret.Contains('"')) { Write-Host 'Please leave out the " character.'; continue }
    if ($secret -cne $again) { Write-Host 'The two passwords are different. Try again.'; continue }
    break
  }
}

# 1. The dashboard superuser. The CLI writes straight to the database, so it works on an empty server.
$ErrorActionPreference = 'Continue' # Windows PowerShell turns a native program's stderr into errors
$output = & $Exe superuser upsert $email $secret --dir $DataDir 2>&1 | Out-String
$code = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
if ($code -ne 0) { throw "Could not save the dashboard login: $output" }
Write-Host "Dashboard login saved for $email."

# 2. The app admin, created (or updated) through the API as that superuser.
$token = (Invoke-Api 'POST' '/api/collections/_superusers/auth-with-password' @{ identity = $email; password = $secret }).token
$filter = [Uri]::EscapeDataString("email = `"$email`"")
$existing = @((Invoke-Api 'GET' "/api/collections/users/records?perPage=1&filter=$filter" $null $token).items)
$body = @{ email = $email; password = $secret; passwordConfirm = $secret; full_name = $name; role = 'admin'; active = $true; verified = $true }
if ($existing.Count -gt 0) {
  Invoke-Api 'PATCH' "/api/collections/users/records/$($existing[0].id)" $body $token | Out-Null
  Write-Host "App admin $email updated: new password, role admin, active."
} else {
  # joined_on = today, so attendance doesn't mark the days before the setup as absent.
  $body.joined_on = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, $TimeZoneId).ToString('yyyy-MM-dd')
  Invoke-Api 'POST' '/api/collections/users/records' $body $token | Out-Null
  Write-Host "App admin $email created (joined $($body.joined_on))."
}

# 3. A first backup, so the copy to the backup drive can be checked today.
try {
  Invoke-Api 'POST' '/api/backups' @{ name = "first-backup-$((Get-Date).ToString('yyyyMMdd-HHmmss')).zip" } $token | Out-Null
  Write-Host 'First backup made.'
} catch {
  Write-Warning "The first backup failed: $($_.Exception.Message). Make one in the dashboard: Settings > Backups > Backup now."
}
