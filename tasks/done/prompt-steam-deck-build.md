# Task: Steam Deck Build — Compile & Deploy Tauri Binary to Deck

## Goal

Produce a working DeckForge binary that Mathew can copy to his Steam Deck and launch. The Steam Deck runs SteamOS (Arch Linux, x86_64, glibc). We need a release build of the Tauri app, a launch script, and clear instructions for getting it onto the Deck and adding it as a non-Steam game.

This is NOT a Flatpak build (too complex for first deploy). This is a direct binary + bundle approach.

## Prerequisites

The build machine needs:
- Rust toolchain (stable, x86_64-unknown-linux-gnu target)
- Node.js 18+ and npm
- System libs for Tauri 2 on Linux: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `patchelf`
- The DeckForge repo with all npm deps installed

If building on the Steam Deck itself (Desktop Mode), install deps via `sudo pacman -S webkit2gtk-4.1 gtk3 base-devel rust nodejs npm`.

If cross-building from Ubuntu/Debian, install via `sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev build-essential curl wget file libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf`.

## Build Steps

### 1. Install dependencies and build frontend

```bash
cd ~/Documents/DeckForge
npm install
npm run build
```

Verify `dist/` is populated with the built Svelte app.

### 2. Build Tauri release binary

```bash
npm run tauri build -- --bundles none
```

The `--bundles none` flag skips .deb/.AppImage generation and just produces the raw binary. This is faster and all we need.

Output binary: `src-tauri/target/release/deckforge`

Verify it exists and is a Linux ELF:
```bash
file src-tauri/target/release/deckforge
# Should show: ELF 64-bit LSB pie executable, x86-64
```

### 3. Check binary size and strip debug symbols

```bash
ls -lh src-tauri/target/release/deckforge
strip src-tauri/target/release/deckforge
ls -lh src-tauri/target/release/deckforge
```

Should be ~15-40MB after stripping.

### 4. Create a portable bundle directory

Create a self-contained directory with everything needed:

```bash
mkdir -p ~/deckforge-deck
cp src-tauri/target/release/deckforge ~/deckforge-deck/
cp src-tauri/icons/128x128.png ~/deckforge-deck/deckforge-icon.png
```

### 5. Create a launch script

Create `~/deckforge-deck/launch-deckforge.sh`:

```bash
#!/bin/bash
# DeckForge launcher for Steam Deck
# Ensures Claude Code CLI is on PATH and launches the app

export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$HOME/.npm-global/bin:$PATH"

# Anthropic API key — user must set this
if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "WARNING: ANTHROPIC_API_KEY not set. Claude Code integration will not work."
  echo "Set it with: export ANTHROPIC_API_KEY=sk-ant-..."
fi

# Launch DeckForge
DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$DIR/deckforge"
```

```bash
chmod +x ~/deckforge-deck/launch-deckforge.sh
```

### 6. Create a .desktop entry for Steam Deck

Create `~/deckforge-deck/com.deckforge.app.desktop`:

```ini
[Desktop Entry]
Name=DeckForge
Comment=Steam Deck gamepad interface for Claude Code
Exec=/home/deck/Applications/deckforge/launch-deckforge.sh
Icon=/home/deck/Applications/deckforge/deckforge-icon.png
Terminal=false
Type=Application
Categories=Development;Utility;Game;
StartupWMClass=deckforge
```

### 7. Package it up for transfer

```bash
cd ~
tar czf deckforge-deck.tar.gz deckforge-deck/
ls -lh deckforge-deck.tar.gz
```

## Deploy to Steam Deck

### Option A: SSH/SCP (if on same network)

On the Steam Deck, enable SSH in Desktop Mode:
```bash
sudo systemctl enable --now sshd
passwd  # set a password if not already done
```

From build machine:
```bash
scp deckforge-deck.tar.gz deck@steamdeck.local:~/
ssh deck@steamdeck.local
tar xzf deckforge-deck.tar.gz
mkdir -p ~/Applications
mv deckforge-deck ~/Applications/deckforge
cp ~/Applications/deckforge/com.deckforge.app.desktop ~/.local/share/applications/
```

### Option B: USB drive / SD card

Copy `deckforge-deck.tar.gz` to a USB drive, plug into Steam Deck in Desktop Mode, extract to `~/Applications/deckforge/`, copy .desktop file to `~/.local/share/applications/`.

### Add as Non-Steam Game

1. Open Steam in Desktop Mode
2. Library → Add a Game → Add a Non-Steam Game
3. Browse to `/home/deck/Applications/deckforge/launch-deckforge.sh`
4. Add it
5. Right-click → Properties → set launch options if needed
6. Optionally set a custom icon (the deckforge-icon.png)

### Verify on Deck

1. Launch from Steam in Desktop Mode first — confirm 1280x800 window appears
2. Test gamepad input — all face buttons, D-pad, bumpers should work
3. Switch to Gaming Mode — launch from library, verify it renders correctly
4. Test Claude Code integration — open a project, select a category, verify predictions load

## Runtime Dependencies on Steam Deck

The binary links against system libraries. SteamOS ships most of what Tauri needs, but verify:

```bash
ldd ~/Applications/deckforge/deckforge | grep "not found"
```

If anything is missing, install via `sudo pacman -S <package>`. Common ones:
- `webkit2gtk-4.1` — the webview runtime (critical)
- `gtk3` — GTK windowing

## Claude Code CLI on Steam Deck

DeckForge spawns `claude` as a subprocess. The user needs Claude Code installed on the Deck:

```bash
# Install Node.js if not present
sudo pacman -S nodejs npm

# Install Claude Code globally
npm install -g @anthropic-ai/claude-code

# Set API key
echo 'export ANTHROPIC_API_KEY=sk-ant-your-key-here' >> ~/.bashrc
source ~/.bashrc

# Verify
claude --version
```

## Files to Create/Modify

| File | Change |
|------|--------|
| `scripts/build-deck.sh` | NEW — automated build + package script that runs steps 1-7 |
| `Makefile` | Add `deck` target: `./scripts/build-deck.sh` |
| `scripts/deploy-deck.sh` | NEW — optional SCP deploy script (takes steamdeck hostname as arg) |

### scripts/build-deck.sh

```bash
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
```

### scripts/deploy-deck.sh

```bash
#!/bin/bash
set -euo pipefail

HOST="${1:-deck@steamdeck.local}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE="$REPO_ROOT/deckforge-deck.tar.gz"

if [ ! -f "$BUNDLE" ]; then
  echo "Bundle not found. Run 'make deck' first."
  exit 1
fi

echo "Deploying to $HOST..."
scp "$BUNDLE" "$HOST:~/"
ssh "$HOST" << 'REMOTE'
cd ~
tar xzf deckforge-deck.tar.gz
mkdir -p ~/Applications
rm -rf ~/Applications/deckforge
mv deckforge-deck ~/Applications/deckforge
mkdir -p ~/.local/share/applications
cp ~/Applications/deckforge/com.deckforge.app.desktop ~/.local/share/applications/
rm -f deckforge-deck.tar.gz
echo "DeckForge deployed to ~/Applications/deckforge"
REMOTE

echo "Done. Launch from Steam or Desktop Mode."
```

## Verification

1. `make deck` runs the full build and produces `deckforge-deck.tar.gz`
2. Extract on a Linux machine → `./launch-deckforge.sh` opens the 1280x800 window
3. `ldd deckforge` shows no missing libraries
4. On Steam Deck: launches from Gaming Mode, gamepad works, predictions load
5. Claude Code subprocess spawns successfully when a task is approved

## What This Does NOT Cover

- Flatpak packaging (future — use com.deckforge.app.yml when ready)
- Auto-update mechanism
- Custom Steam Deck icon grids (user can set manually in Steam)
- Building on ARM (Steam Deck is x86_64 only)
