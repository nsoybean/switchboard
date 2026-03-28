#!/usr/bin/env bash
set -euo pipefail

APP_NAME="Switchboard"
REPO="nsoybean/switchboard"
INSTALL_DIR="/Applications"

echo "Installing $APP_NAME..."

# Detect architecture
ARCH="$(uname -m)"
case "$ARCH" in
  arm64)  ARCH_SUFFIX="aarch64" ;;
  x86_64) ARCH_SUFFIX="x86_64" ;;
  *)
    echo "Unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

# Get latest release tag
LATEST_TAG="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')"
VERSION="${LATEST_TAG#v}"

if [ -z "$VERSION" ]; then
  echo "Failed to determine latest version" >&2
  exit 1
fi

echo "Latest version: $VERSION"

DMG_NAME="${APP_NAME}_${VERSION}_${ARCH_SUFFIX}.dmg"
DMG_URL="https://github.com/$REPO/releases/download/$LATEST_TAG/$DMG_NAME"

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

echo "Downloading $DMG_NAME..."
curl -fSL "$DMG_URL" -o "$WORK_DIR/$DMG_NAME"

echo "Mounting DMG..."
MOUNT_POINT="$(hdiutil attach "$WORK_DIR/$DMG_NAME" -nobrowse -noautoopen | tail -1 | awk '{print $NF}')"

# Remove old version if it exists
if [ -d "$INSTALL_DIR/$APP_NAME.app" ]; then
  echo "Removing previous installation..."
  rm -rf "$INSTALL_DIR/$APP_NAME.app"
fi

echo "Installing to $INSTALL_DIR..."
cp -R "$MOUNT_POINT/$APP_NAME.app" "$INSTALL_DIR/"

echo "Cleaning up..."
hdiutil detach "$MOUNT_POINT" -quiet

echo ""
echo "$APP_NAME $VERSION installed successfully!"
echo "You can launch it from $INSTALL_DIR or Spotlight."
