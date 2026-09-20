#!/bin/bash
# Watches a folder for new scanned invoices and uploads each one to a
# deployed FLOWER MAN instance automatically. Runs on the scanning
# computer, not the one hosting the app — see README.md in this directory
# for setup. Deliberately dependency-free (bash + curl, both ship with
# macOS) since this computer isn't a dev machine and shouldn't need Node,
# Python, or Homebrew installed just to run this.
#
# Invoked repeatedly by launchd (see com.flowerman.scanuploader.plist) —
# every run is a single pass over the watch folder, not a long-lived loop,
# so there's nothing to keep running between scans.

set -euo pipefail

# ---- Config: edit these for your setup, or override via
# ~/.flowerman-scan-uploader.env (sourced below if present) ----
WATCH_DIR="${WATCH_DIR:-$HOME/Scans}"
UPLOADED_DIR="${UPLOADED_DIR:-$WATCH_DIR/uploaded}"
FAILED_DIR="${FAILED_DIR:-$WATCH_DIR/failed}"
APP_URL="${APP_URL:-}"
UPLOAD_TOKEN="${UPLOAD_TOKEN:-}"
MIN_AGE_SECONDS="${MIN_AGE_SECONDS:-10}"
LOG_FILE="${LOG_FILE:-$HOME/Library/Logs/flowerman-scan-uploader.log}"

CONFIG_FILE="$HOME/.flowerman-scan-uploader.env"
if [ -f "$CONFIG_FILE" ]; then
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
fi

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG_FILE"
}

if [ -z "$APP_URL" ] || [ -z "$UPLOAD_TOKEN" ]; then
  log "ERROR: APP_URL and UPLOAD_TOKEN must be set (in $CONFIG_FILE or the environment) — aborting."
  exit 1
fi

mkdir -p "$WATCH_DIR" "$UPLOADED_DIR" "$FAILED_DIR"

# Single-instance guard: WatchPaths and the StartInterval fallback can both
# fire close together. A stale lock (a crashed prior run) is reclaimed
# after 10 minutes rather than blocking forever.
LOCK_DIR="$WATCH_DIR/.upload-watcher.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  lock_age=$(( $(date +%s) - $(stat -f%m "$LOCK_DIR" 2>/dev/null || echo 0) ))
  if [ "$lock_age" -lt 600 ]; then
    exit 0
  fi
  log "WARN: reclaiming stale lock (${lock_age}s old)"
  rmdir "$LOCK_DIR" 2>/dev/null || true
  mkdir "$LOCK_DIR" 2>/dev/null || exit 0
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

mime_type_for() {
  case "${1##*.}" in
    pdf|PDF) echo "application/pdf" ;;
    png|PNG) echo "image/png" ;;
    jpg|jpeg|JPG|JPEG) echo "image/jpeg" ;;
    webp|WEBP) echo "image/webp" ;;
    *) echo "" ;;
  esac
}

extract_json_field() {
  # Only safe for this app's own simple, controlled JSON responses (no
  # nested objects, no escaped quotes in values) — not a general parser.
  echo "$2" | sed -n "s/.*\"$1\":\"\([^\"]*\)\".*/\1/p"
}

upload_one() {
  local file="$1"
  local filename mime size init_response signed_url path put_status complete_response complete_status job_id

  filename=$(basename "$file")
  mime=$(mime_type_for "$filename")
  if [ -z "$mime" ]; then
    log "SKIP $filename: unrecognized extension"
    return
  fi

  size=$(stat -f%z "$file")

  init_response=$(curl -sS -w '\n%{http_code}' -X POST "$APP_URL/api/invoices/upload/init" \
    -H "Content-Type: application/json" \
    -H "x-upload-token: $UPLOAD_TOKEN" \
    -d "{\"filename\":\"$filename\",\"mimeType\":\"$mime\",\"size\":$size}") || {
    log "FAIL $filename: init request could not be sent"
    return
  }
  init_status="${init_response##*$'\n'}"
  init_body="${init_response%$'\n'*}"
  if [ "$init_status" != "200" ]; then
    log "FAIL $filename: init returned $init_status: $init_body"
    mv "$file" "$FAILED_DIR/"
    return
  fi

  signed_url=$(extract_json_field "signedUrl" "$init_body")
  path=$(extract_json_field "path" "$init_body")
  if [ -z "$signed_url" ] || [ -z "$path" ]; then
    log "FAIL $filename: could not parse init response: $init_body"
    mv "$file" "$FAILED_DIR/"
    return
  fi

  put_status=$(curl -sS -o /dev/null -w '%{http_code}' -X PUT "$signed_url" \
    -H "Content-Type: $mime" \
    --data-binary "@$file") || {
    log "FAIL $filename: PUT to storage could not be sent"
    return
  }
  if [ "$put_status" != "200" ]; then
    log "FAIL $filename: storage PUT returned $put_status"
    return
  fi

  complete_response=$(curl -sS -w '\n%{http_code}' -X POST "$APP_URL/api/invoices/upload/complete" \
    -H "Content-Type: application/json" \
    -H "x-upload-token: $UPLOAD_TOKEN" \
    -d "{\"path\":\"$path\",\"filename\":\"$filename\",\"mimeType\":\"$mime\"}") || {
    log "FAIL $filename: complete request could not be sent"
    return
  }
  complete_status="${complete_response##*$'\n'}"
  complete_body="${complete_response%$'\n'*}"
  if [ "$complete_status" != "200" ]; then
    log "FAIL $filename: complete returned $complete_status: $complete_body"
    mv "$file" "$FAILED_DIR/"
    return
  fi

  job_id=$(extract_json_field "id" "$complete_body")
  log "OK $filename -> job $job_id"
  mv "$file" "$UPLOADED_DIR/$(date +%Y%m%d-%H%M%S)-$filename"
}

now=$(date +%s)
find "$WATCH_DIR" -maxdepth 1 -type f ! -name '.*' -print0 | while IFS= read -r -d '' file; do
  mtime=$(stat -f%m "$file" 2>/dev/null || echo "$now")
  age=$(( now - mtime ))
  if [ "$age" -lt "$MIN_AGE_SECONDS" ]; then
    continue # scanner may still be writing this file
  fi
  upload_one "$file"
done
