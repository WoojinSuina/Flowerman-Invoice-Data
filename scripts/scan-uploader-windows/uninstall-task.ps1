# Removes the scheduled task installed by install-task.ps1. Does not
# touch config.ps1, the watch folder, or its uploaded/failed subfolders.

$TaskName = "FlowermanScanUploader"
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "Removed scheduled task '$TaskName' (if it existed)."
