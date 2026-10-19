# Registers a Windows Scheduled Task that runs upload-watcher.ps1 every
# minute, indefinitely, starting now and again at every logon. Run this
# once after setting up config.ps1 (see README.md).
#
# Safe to re-run: Register-ScheduledTask -Force replaces the existing
# task definition instead of erroring if it's already installed.

$ErrorActionPreference = "Stop"

$TaskName = "FlowermanScanUploader"
$ScriptPath = Join-Path $PSScriptRoot "upload-watcher.ps1"

if (-not (Test-Path (Join-Path $PSScriptRoot "config.ps1"))) {
    Write-Host "config.ps1 not found next to this script - copy config.ps1.example to config.ps1 and fill it in first." -ForegroundColor Yellow
    exit 1
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ScriptPath`""

$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
    -RepetitionInterval (New-TimeSpan -Minutes 1) `
    -RepetitionDuration (New-TimeSpan -Days 3650)

$logonTrigger = New-ScheduledTaskTrigger -AtLogOn

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
    -MultipleInstances IgnoreNew `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries

$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive

Register-ScheduledTask -TaskName $TaskName `
    -Action $action `
    -Trigger @($trigger, $logonTrigger) `
    -Settings $settings `
    -Principal $principal `
    -Force | Out-Null

Write-Host "Installed scheduled task '$TaskName' - it checks $PSScriptRoot\config.ps1's WatchDir every minute."
Write-Host "Check progress any time with: Get-ScheduledTaskInfo -TaskName '$TaskName'"
