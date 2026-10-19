# Watches a folder for new scanned invoices and uploads each one to a
# deployed FLOWER MAN instance automatically. Runs on the scanning
# computer, not the one hosting the app - see README.md in this directory
# for setup. Dependency-free by design: only Windows PowerShell, already
# on every Windows 10/11 machine - no Node, Python, or anything else to
# install on a computer that isn't otherwise a dev machine.
#
# Invoked repeatedly by a Scheduled Task (see install-task.ps1) - every
# run is a single pass over the watch folder, not a long-lived loop, so
# there's nothing to keep running between scans.

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# ---- Config: edit config.ps1 in this same folder (copy it from
# config.ps1.example first) rather than this file, so pulling script
# updates later doesn't clobber your settings. ----
$WatchDir = "$env:USERPROFILE\Scans"
$UploadedDir = Join-Path $WatchDir "uploaded"
$FailedDir = Join-Path $WatchDir "failed"
$AppUrl = $null
$UploadToken = $null
$MinAgeSeconds = 10
$LogFile = "$env:USERPROFILE\FlowermanScanUploader\upload-watcher.log"

$ConfigPath = Join-Path $PSScriptRoot "config.ps1"
if (Test-Path $ConfigPath) {
    . $ConfigPath
}

function Write-Log {
    param([string]$Message)
    $logDir = Split-Path $LogFile -Parent
    if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
    Add-Content -Path $LogFile -Value $line
}

if ([string]::IsNullOrWhiteSpace($AppUrl) -or [string]::IsNullOrWhiteSpace($UploadToken)) {
    Write-Log "ERROR: AppUrl and UploadToken must be set in $ConfigPath - aborting."
    exit 1
}

New-Item -ItemType Directory -Path $WatchDir -Force | Out-Null
New-Item -ItemType Directory -Path $UploadedDir -Force | Out-Null
New-Item -ItemType Directory -Path $FailedDir -Force | Out-Null

# Single-instance guard: an exclusive file handle, not a flag file - if
# this process dies (even a crash), Windows releases the handle on its
# own, so there's nothing that can leak a stale lock to clean up later.
$LockPath = Join-Path $WatchDir ".upload-watcher.lock"
try {
    $lockStream = [System.IO.File]::Open(
        $LockPath, [System.IO.FileMode]::OpenOrCreate,
        [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None
    )
} catch {
    exit 0  # another run is already in progress
}

try {
    function Get-MimeType {
        param([string]$Filename)
        switch ([System.IO.Path]::GetExtension($Filename).ToLowerInvariant()) {
            ".pdf"  { "application/pdf" }
            ".png"  { "image/png" }
            ".jpg"  { "image/jpeg" }
            ".jpeg" { "image/jpeg" }
            ".webp" { "image/webp" }
            default { $null }
        }
    }

    function Invoke-Upload {
        param([string]$FilePath)

        $filename = Split-Path $FilePath -Leaf
        $mime = Get-MimeType $filename
        if (-not $mime) {
            Write-Log "SKIP ${filename}: unrecognized extension"
            return
        }
        $size = (Get-Item $FilePath).Length

        try {
            $initBody = @{ filename = $filename; mimeType = $mime; size = $size } | ConvertTo-Json
            $init = Invoke-RestMethod -Uri "$AppUrl/api/invoices/upload/init" -Method Post `
                -Headers @{ "x-upload-token" = $UploadToken } -ContentType "application/json" -Body $initBody
        } catch {
            Write-Log "FAIL ${filename}: init failed: $($_.Exception.Message)"
            Move-Item -LiteralPath $FilePath -Destination (Join-Path $FailedDir $filename) -Force
            return
        }

        if (-not $init.signedUrl -or -not $init.path) {
            Write-Log "FAIL ${filename}: could not parse init response"
            Move-Item -LiteralPath $FilePath -Destination (Join-Path $FailedDir $filename) -Force
            return
        }

        try {
            Invoke-WebRequest -Uri $init.signedUrl -Method Put -InFile $FilePath `
                -ContentType $mime -UseBasicParsing | Out-Null
        } catch {
            # Left in WatchDir on purpose - the signed URL/path from init
            # is one-time use, so this can't cleanly resume; it'll be
            # retried as a fresh upload attempt (new init) next run.
            Write-Log "FAIL ${filename}: upload to storage failed: $($_.Exception.Message)"
            return
        }

        try {
            $completeBody = @{ path = $init.path; filename = $filename; mimeType = $mime } | ConvertTo-Json
            $complete = Invoke-RestMethod -Uri "$AppUrl/api/invoices/upload/complete" -Method Post `
                -Headers @{ "x-upload-token" = $UploadToken } -ContentType "application/json" -Body $completeBody
        } catch {
            Write-Log "FAIL ${filename}: complete failed: $($_.Exception.Message)"
            Move-Item -LiteralPath $FilePath -Destination (Join-Path $FailedDir $filename) -Force
            return
        }

        Write-Log "OK $filename -> job $($complete.job.id)"
        $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
        Move-Item -LiteralPath $FilePath -Destination (Join-Path $UploadedDir "$timestamp-$filename") -Force
    }

    $now = Get-Date
    Get-ChildItem -LiteralPath $WatchDir -File -ErrorAction SilentlyContinue |
        Where-Object { -not $_.Name.StartsWith(".") } |
        ForEach-Object {
            $ageSeconds = ($now - $_.LastWriteTime).TotalSeconds
            if ($ageSeconds -lt $MinAgeSeconds) { return }  # scanner may still be writing this file
            Invoke-Upload -FilePath $_.FullName
        }
} finally {
    $lockStream.Close()
    Remove-Item -LiteralPath $LockPath -Force -ErrorAction SilentlyContinue
}
