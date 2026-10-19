# Scan uploader (Windows)

Windows version of `scripts/scan-uploader/` (the macOS one) - same job,
same upload flow against the deployed app, just PowerShell + Windows
Task Scheduler instead of bash + launchd. Use this one if the scanning
computer is a Windows PC instead of a Mac.

Watches a folder on the **scanning computer** (not the one hosting the
app) for new files and uploads each one to a deployed FLOWER MAN
instance automatically, using the same fast upload path the web UI uses
(see the main README's "Direct-to-Storage uploads" section) - just
triggered by a new file appearing (checked once a minute) instead of a
browser click.

After a scan uploads, check the **Jobs** tab in the app and click into
it to see the invoice's total - e.g. to cross-check against cash in
hand. Extraction takes a few seconds, so the total won't be there
instantly.

Dependency-free by design: only Windows PowerShell, already on every
Windows 10/11 machine. No Node, Python, or anything else to install.

## Requirements

- The FLOWER MAN app must be deployed somewhere with a real URL (this
  doesn't work against a `npm run dev` instance on someone else's
  computer).
- `UPLOAD_API_TOKEN` set in that deployment's environment variables.
- Your scanner (or its companion software) must save finished scans as
  a file - PDF, PNG, JPEG, or WebP - into a folder on this PC. Check
  your scanner software's settings for something like "save to folder"
  or "output destination."

## Setup

1. Copy this whole `scan-uploader-windows` folder to the scanning
   computer, e.g. `C:\Users\<you>\FlowermanScanUploader\`.
2. Copy the config template and fill it in, in that same folder:
   ```powershell
   Copy-Item config.ps1.example config.ps1
   notepad config.ps1
   ```
   Set `$AppUrl` to your deployed app's URL, `$UploadToken` to the same
   value as `UPLOAD_API_TOKEN` in the app's environment, and `$WatchDir`
   to the folder your scanner saves to (create it if it doesn't exist
   yet).
3. Test it manually first, with a real scanned file sitting in
   `$WatchDir`. Open PowerShell in this folder and run:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\upload-watcher.ps1
   Get-Content "$env:USERPROFILE\FlowermanScanUploader\upload-watcher.log" -Tail 20
   ```
   You should see an `OK <filename> -> job <id>` line, and the file
   should move into `<WatchDir>\uploaded\`. If something's wrong, the
   log line explains what failed (bad token, unreachable URL, wrong
   file type, etc.) and the file moves to `<WatchDir>\failed\` instead
   of retrying forever.
4. Install the scheduled task so it runs automatically from now on:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\install-task.ps1
   ```
5. Scan something. It should upload within about a minute - the task
   checks the folder every 60 seconds. Check the log file if not, then
   check the Jobs tab in the app for the total.

If Windows prompts about running a script from the internet/another
computer when you first run these (a "this file came from another
computer" security warning), right-click each `.ps1` file → Properties
→ check "Unblock" → OK, then retry.

## Checking on it later

- Activity log: `%USERPROFILE%\FlowermanScanUploader\upload-watcher.log`
- Task status: `Get-ScheduledTaskInfo -TaskName FlowermanScanUploader`
  (or open Task Scheduler → look for "FlowermanScanUploader")
- Files that failed to upload sit in `<WatchDir>\failed\` - move them
  back into `<WatchDir>` to retry after fixing whatever the log says was
  wrong.
- To stop it: `powershell -ExecutionPolicy Bypass -File .\uninstall-task.ps1`
- To change config (URL, token, folders): edit `config.ps1` - takes
  effect on the next run, no reinstall needed.

## Why not just sync the folder with OneDrive instead?

That would work too, but you'd still need something on the app side to
watch the synced folder and call the upload API - this script is that
piece either way. Pointing `$WatchDir` at a OneDrive-synced folder
instead of a local one works fine if that's more convenient; nothing
here assumes the folder is local-only.
