#!/bin/sh
# Builds dist/PortableStudio-<version>.pkg on macOS from the staged extension folder.
#   node scripts/package.js && sh installer/macos/build-pkg.sh
# Installs to /Library/Application Support/Adobe/CEP/extensions/PortableStudio (all users).
set -e
cd "$(dirname "$0")/../.."
VERSION="$(node -p "require('./package.json').version")"
STAGE="dist/PortableStudio-$VERSION"
[ -d "$STAGE" ] || { echo "Missing $STAGE - run node scripts/package.js first"; exit 1; }

WORK="$(mktemp -d)"
DEST="$WORK/root/Library/Application Support/Adobe/CEP/extensions/PortableStudio"
mkdir -p "$DEST"
cp -R "$STAGE/." "$DEST/"
find "$WORK/root" -name .DS_Store -delete
chmod -R u+rwX,go+rX "$WORK/root"
chmod +x installer/macos/scripts/postinstall

pkgbuild \
  --root "$WORK/root" \
  --identifier com.portablestudio.extension \
  --version "$VERSION" \
  --install-location / \
  --scripts installer/macos/scripts \
  "$WORK/component.pkg"

# Wrap it in a product archive with a welcome text and the licence.
mkdir -p "$WORK/resources"
cp LICENSE "$WORK/resources/LICENSE.txt"
cat > "$WORK/resources/welcome.txt" <<EOF
PortableStudio $VERSION

An open-source brand identity toolkit for Adobe Illustrator and Photoshop.

After installing, restart Illustrator or Photoshop and open
Window > Extensions > PortableStudio
(Photoshop: Window > Extensions (Legacy) > PortableStudio).
EOF
cat > "$WORK/distribution.xml" <<EOF
<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="2">
  <title>PortableStudio $VERSION</title>
  <welcome file="welcome.txt"/>
  <license file="LICENSE.txt"/>
  <options customize="never" require-scripts="false" hostArchitectures="x86_64,arm64"/>
  <domains enable_localSystem="true"/>
  <choices-outline><line choice="default"/></choices-outline>
  <choice id="default" title="PortableStudio"><pkg-ref id="com.portablestudio.extension"/></choice>
  <pkg-ref id="com.portablestudio.extension" version="$VERSION">component.pkg</pkg-ref>
</installer-gui-script>
EOF
productbuild \
  --distribution "$WORK/distribution.xml" \
  --resources "$WORK/resources" \
  --package-path "$WORK" \
  "dist/PortableStudio-$VERSION.pkg"

rm -rf "$WORK"
echo "Built dist/PortableStudio-$VERSION.pkg"
