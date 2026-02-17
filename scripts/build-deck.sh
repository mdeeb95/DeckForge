#!/bin/bash
set -euo pipefail

echo "=== DeckForge Steam Deck Build ==="

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$REPO_ROOT/deckforge-deck"

echo "[1/5] Installing npm dependencies..."
cd "$REPO_ROOT"
npm install

echo "[2/5] Building frontend..."
npm run build

echo "[3/5] Building Tauri release binary..."
npm run tauri build -- --bundles none

echo "[4/5] Stripping binary..."
strip "$REPO_ROOT/src-tauri/target/release/deckforge"

echo "[5/5] Packaging bundle..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
cp "$REPO_ROOT/src-tauri/target/release/deckforge" "$BUILD_DIR/"
cp "$REPO_ROOT/src-tauri/icons/128x128.png" "$BUILD_DIR/deckforge-icon.png"

# Create launch script
cat > "$BUILD_DIR/launch-deckforge.sh" << 'LAUNCHER'
#!/bin/bash
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$HOME/.npm-global/bin:$PATH"
if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "WARNING: ANTHROPIC_API_KEY not set."
fi
DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$DIR/deckforge"
LAUNCHER
chmod +x "$BUILD_DIR/launch-deckforge.sh"

# Create .desktop entry
cat > "$BUILD_DIR/com.deckforge.app.desktop" << 'DESKTOP'
[Desktop Entry]
Name=DeckForge
Comment=Steam Deck gamepad interface for Claude Code
Exec=/home/deck/Applications/deckforge/launch-deckforge.sh
Icon=/home/deck/Applications/deckforge/deckforge-icon.png
Terminal=false
Type=Application
Categories=Development;Utility;Game;
StartupWMClass=deckforge
DESKTOP

# Tar it up
cd "$REPO_ROOT"
tar czf deckforge-deck.tar.gz deckforge-deck/

SIZE=$(du -sh deckforge-deck.tar.gz | cut -f1)
echo ""
echo "=== Build complete ==="
echo "Bundle: $REPO_ROOT/deckforge-deck.tar.gz ($SIZE)"
echo "Deploy: scp deckforge-deck.tar.gz deck@steamdeck.local:~/"
