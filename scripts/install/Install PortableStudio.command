#!/bin/sh
# Double-click to install PortableStudio for Illustrator / Photoshop on macOS (current user).
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/PortableStudio"
EXT_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions"
TARGET="$EXT_DIR/PortableStudio"

if [ ! -d "$SRC" ]; then
  echo "The PortableStudio folder was not found next to this installer."
  exit 1
fi

echo "Installing PortableStudio..."
mkdir -p "$EXT_DIR"
if [ -L "$TARGET" ]; then
  echo "A development copy of PortableStudio is linked at $TARGET. Remove that link first."
  exit 1
fi
rm -rf "$TARGET"
cp -R "$SRC" "$TARGET"
xattr -dr com.apple.quarantine "$TARGET" 2>/dev/null || true

# Unsigned extensions need debug mode on (CEP 9-12).
for v in 9 10 11 12; do
  defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1
done

echo ""
echo "Installed to $TARGET"
echo "Restart Illustrator or Photoshop, then open Window > Extensions > PortableStudio"
echo "(Photoshop: Window > Extensions (Legacy) > PortableStudio)."
