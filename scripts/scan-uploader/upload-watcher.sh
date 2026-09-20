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
# After a successful upload, wait for extraction to finish and pop up a
# native notification with the invoice's total due - the point being
# someone scanning an invoice can cross-check it against cash in hand
# without opening the app at all. Set NOTIFY_ON_COMPLETE=0 to disable.
NOTIFY_ON_COMPLETE="${NOTIFY_ON_COMPLETE:-1}"
NOTIFY_POLL_INTERVAL_SECONDS="${NOTIFY_POLL_INTERVAL_SECONDS:-3}"
NOTIFY_POLL_MAX_SECONDS="${NOTIFY_POLL_MAX_SECONDS:-90}"

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

extract_json_number_field() {
  # Same caveat as extract_json_field, for an unquoted numeric value.
  echo "$2" | sed -n "s/.*\"$1\":\(-\{0,1\}[0-9]\{1,\}\).*/\1/p"
}

# Cents -> "$12.34" (or "-$12.34"), using only bash builtins.
format_cents() {
  local cents="$1" sign=""
  if [ "$cents" -lt 0 ]; then
    sign="-"
    cents=$(( -cents ))
  fi
  printf '%s$%d.%02d' "$sign" "$(( cents / 100 ))" "$(( cents % 100 ))"
}

# Polls .../summary until the job reaches a terminal status, then prints
# the JSON response (for notify_result to read). Prints nothing on
# timeout. Never fails the whole script - a slow or missed notification
# shouldn't affect the upload, which already succeeded by this point.
poll_job_summary() {
  local job_id="$1" waited=0 response status
  while [ "$waited" -lt "$NOTIFY_POLL_MAX_SECONDS" ]; do
    response=$(curl -sS -X GET "$APP_URL/api/jobs/$job_id/summary" -H "x-upload-token: $UPLOAD_TOKEN" 2>/dev/null) || response=""
    status=$(extract_json_field "status" "$response")
    case "$status" in
      COMPLETED | COMPLETED_WITH_ERRORS | FAILED)
        echo "$response"
        return 0
        ;;
    esac
    sleep "$NOTIFY_POLL_INTERVAL_SECONDS"
    waited=$(( waited + NOTIFY_POLL_INTERVAL_SECONDS ))
  done
  return 1
}

notify() {
  # osascript ships with every Mac - no extra install needed. Notification
  # failures (e.g. Do Not Disturb, no display session) are never fatal.
  osascript -e "display notification \"$2\" with title \"$1\"" >/dev/null 2>&1 || true
}

notify_result() {
  local filename="$1" job_id="$2" summary
  summary=$(poll_job_summary "$job_id") || {
    notify "Scan uploaded: $filename" "Still processing — check Jobs in the app shortly."
    return
  }

  local invoice_number total_cents review_status
  invoice_number=$(extract_json_field "invoiceNumber" "$summary")
  total_cents=$(extract_json_number_field "totalAmountDueCents" "$summary")
  review_status=$(extract_json_field "validationStatus" "$summary")

  if [ -z "$total_cents" ]; then
    # No invoice was created - almost always a duplicate-scan rejection.
    local error_message
    error_message=$(extract_json_field "errorMessage" "$summary")
    notify "Scan not added: $filename" "${error_message:-Could not read this invoice — check the app.}"
    return
  fi

  local amount
  amount=$(format_cents "$total_cents")
  local suffix=""
  if [ "$review_status" != "PASS" ] && [ "$review_status" != "APPROVED" ]; then
    suffix=" (flagged for review)"
  fi
  notify "Invoice #$invoice_number" "Total due: $amount$suffix"
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

  if [ "$NOTIFY_ON_COMPLETE" = "1" ]; then
    notify_result "$filename" "$job_id"
  fi
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
