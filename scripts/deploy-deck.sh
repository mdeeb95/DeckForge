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
