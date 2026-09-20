# Scan uploader

Watches a folder on the **scanning computer** (not the one hosting the app)
for new files and uploads each one to a deployed FLOWER MAN instance
automatically, using the same fast upload path the web UI uses (see the
main README's "Direct-to-Storage uploads" section) — just triggered by a
new file appearing instead of a browser click.

Once uploaded, it waits for extraction to finish and pops up a native
macOS notification with the invoice's total due — so whoever's scanning
can immediately cross-check that total against cash in hand without
opening the app at all. If the scan gets rejected instead (most often a
duplicate — the same invoice already on file), the notification shows why.

Dependency-free by design: only `bash` and `curl`, both already on macOS.
No Node, Python, or Homebrew install needed on a computer that isn't
otherwise a dev machine.

## Requirements

- The FLOWER MAN app must be deployed somewhere with a real URL (this
  doesn't work against a `npm run dev` instance on someone else's laptop).
- `UPLOAD_API_TOKEN` set in that deployment's environment variables.
- Your scanner (or its companion software) must save finished scans as a
  file — PDF, PNG, JPEG, or WebP — into a folder on this Mac. Check your
  scanner software's settings for something like "save to folder" or
  "output destination."

## Setup

1. Copy this whole `scan-uploader` folder to the scanning computer, e.g.
   `~/flowerman-scan-uploader/`.
2. Copy the config template and fill it in:
   ```bash
   cp config.env.example ~/.flowerman-scan-uploader.env
   ```
   Edit `~/.flowerman-scan-uploader.env`: set `APP_URL` to your deployed
   app's URL, `UPLOAD_TOKEN` to the same value as `UPLOAD_API_TOKEN` in
   the app's environment, and `WATCH_DIR` to the folder your scanner saves
   to (create it if it doesn't exist yet).
3. Make the script executable:
   ```bash
   chmod +x ~/flowerman-scan-uploader/upload-watcher.sh
   ```
4. Test it manually first, with a real scanned file sitting in `WATCH_DIR`:
   ```bash
   ~/flowerman-scan-uploader/upload-watcher.sh
   tail -f ~/Library/Logs/flowerman-scan-uploader.log
   ```
   You should see an `OK <filename> -> job <id>` line, and the file should
   move into `WATCH_DIR/uploaded/`. If something's wrong, the log line
   explains what failed (bad token, unreachable URL, wrong file type,
   etc.) and the file moves to `WATCH_DIR/failed/` instead of retrying
   forever. A few seconds after the `OK` line, a notification should pop
   up with the invoice's total due (or, if it's a duplicate, an
   explanation instead) — set `NOTIFY_ON_COMPLETE=0` in the config to turn
   this off if it's not wanted.
5. Install the LaunchAgent so it runs automatically from now on:
   ```bash
   mkdir -p ~/Library/LaunchAgents
   cp com.flowerman.scanuploader.plist ~/Library/LaunchAgents/
   ```
   Edit `~/Library/LaunchAgents/com.flowerman.scanuploader.plist`: replace
   both `YOUR_USERNAME` placeholders — the script path in
   `ProgramArguments` and the folder in `WatchPaths` (must match
   `WATCH_DIR` in your config).
   ```bash
   launchctl load ~/Library/LaunchAgents/com.flowerman.scanuploader.plist
   ```
6. Scan something. It should upload within a few seconds — `WatchPaths`
   triggers a run as soon as the file appears, with a 1-minute timer as a
   fallback in case that event is ever missed — followed shortly by a
   notification with the total due. Check the log file if not.

## Checking on it later

- Activity log: `~/Library/Logs/flowerman-scan-uploader.log`
- launchd-level errors (the script itself crashing, not upload failures):
  `/tmp/flowerman-scan-uploader.stderr.log`
- Files that failed to upload sit in `WATCH_DIR/failed/` — move them back
  into `WATCH_DIR` to retry after fixing whatever the log says was wrong.
- To stop it: `launchctl unload ~/Library/LaunchAgents/com.flowerman.scanuploader.plist`
- To change config (URL, token, folders): edit
  `~/.flowerman-scan-uploader.env` — takes effect on the next run, no
  reinstall needed.

## Why not just sync the folder with Dropbox/iCloud instead?

That would work too, but you'd still need something on the app side to
watch the synced folder and call the upload API — this script is that
piece either way. Pointing `WATCH_DIR` at a cloud-synced folder instead of
a local one works fine if that's more convenient; nothing here assumes the
folder is local-only.
