#!/usr/bin/env bash
set -euo pipefail

# Get current version from package.json
CURRENT=$(grep '"version"' package.json | head -1 | sed 's/.*"\([0-9]*\.[0-9]*\.[0-9]*\)".*/\1/')
echo "Current version: $CURRENT"

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

echo "Select bump type:"
echo "  1) patch ($MAJOR.$MINOR.$((PATCH + 1)))"
echo "  2) minor ($MAJOR.$((MINOR + 1)).0)"
echo "  3) major ($((MAJOR + 1)).0.0)"
read -rp "Choice [1/2/3]: " CHOICE

case "$CHOICE" in
  1) NEXT="$MAJOR.$MINOR.$((PATCH + 1))" ;;
  2) NEXT="$MAJOR.$((MINOR + 1)).0" ;;
  3) NEXT="$((MAJOR + 1)).0.0" ;;
  *) echo "Invalid choice"; exit 1 ;;
esac

echo "Next version: $NEXT"

# Type check
echo "Running tsc --noEmit..."
npx tsc --noEmit || { echo "TypeScript check failed"; exit 1; }

# Rust tests
echo "Running cargo test..."
cargo test --manifest-path src-tauri/Cargo.toml || { echo "Rust tests failed"; exit 1; }

# Bump version
npm version "$NEXT" --no-git-tag-version
npm run version:sync -- "$NEXT"

# Tag and push
git add -A
git commit -m "feat: bump version to $NEXT"

if git tag -l "v$NEXT" | grep -q .; then
  echo "Tag v$NEXT already exists."
  read -rp "Overwrite it? [y/N]: " OVERWRITE
  if [[ "$OVERWRITE" =~ ^[Yy]$ ]]; then
    git tag -d "v$NEXT"
    git push origin --delete "v$NEXT"
  else
    echo "Aborted"; exit 1
  fi
fi

git tag "v$NEXT"
git push origin "v$NEXT"

echo "Released v$NEXT"
