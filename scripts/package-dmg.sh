#!/usr/bin/env bash

set -euo pipefail

APP_PATH="${1:?Usage: package-dmg.sh <app-path> <output-dmg> [volume-name]}"
DMG_PATH="${2:?Usage: package-dmg.sh <app-path> <output-dmg> [volume-name]}"
VOLUME_NAME="${3:-Switchboard}"

if [[ ! -d "$APP_PATH" ]]; then
  echo "App bundle not found: $APP_PATH" >&2
  exit 1
fi

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

APP_NAME="$(basename "$APP_PATH")"
ditto "$APP_PATH" "$WORK_DIR/$APP_NAME"
ln -s /Applications "$WORK_DIR/Applications"

mkdir -p "$(dirname "$DMG_PATH")"
rm -f "$DMG_PATH"

hdiutil create \
  -volname "$VOLUME_NAME" \
  -srcfolder "$WORK_DIR" \
  -ov \
  -format UDZO \
  "$DMG_PATH"
