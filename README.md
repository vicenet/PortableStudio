# PortableStudio

**Open-source brand identity toolkit for Adobe Illustrator and Photoshop.**
Design a template once, tag it, and PortableStudio fills it with any client's brand: name, colours,
fonts, logos, photos and copy. Brand guidelines, logo presentations, social carousels and logo kits
take minutes instead of days.

It also has a local API and an MCP server, so Claude and other tools can run it for you.

## What it does

| | |
|---|---|
| **Templates** | Tag your own Illustrator/Photoshop designs (`{{brand.name}}`, global swatches, Heading/Body styles, logo placeholders). Three starter templates included: 43-page Brand Guidelines, 12-page Logo Presentation, 5-slide Instagram Carousel |
| **Generate & update** | One click fills one or many templates. The editable `.ai` stays open, and **Update open document** re-applies brand changes while keeping your manual edits |
| **Brand profiles** | Save each client once: colours, fonts, logos (plus white/black versions), photos and copy |
| **Logo kit** | SVG, EPS, PDF and PNG in colour, black, white and brand colour, favicons with `favicon.ico`, and social images |
| **Logo grids** | Construction overlays on any vector logo: outlines, anchors, handles, circles, gridlines, clearspace |
| **Colour tools** | Palette from your logo, industry palettes, tints and shades, CMYK, WCAG contrast checks |
| **Copy** | Industry starter copy, or copy written by Claude from a short brief |
| **Smart fitting** | Logos auto-trimmed and recoloured (even PNGs), long text shrunk to fit, photos cropped to their frames |
| **Template packs** | Install `.zip` packs, publish your own, or browse a catalog |
| **API & MCP** | Local REST API (`docs/API.md`) and MCP server (`docs/MCP.md`) |

## Download

Get the latest version from **[Releases](https://github.com/vicenet/PortableStudio/releases)**:

- **Windows:** `PortableStudio-<version>-windows.zip`. Unzip, then double-click **Install PortableStudio.bat**.
- **macOS:** `PortableStudio-<version>-macos.zip`. Unzip, then right-click **Install PortableStudio.command** > Open.
- **Any ZXP installer:** `PortableStudio-<version>.zxp`.

Then restart Illustrator/Photoshop and open **Window > Extensions > PortableStudio**.

## Install (development)

Requirements: Illustrator 2021+ and/or Photoshop 2021+, Node.js 18+ (only for `npm install` and the MCP server).

```bash
git clone <this repo> PortableStudio
cd PortableStudio
npm install
# Windows
powershell -ExecutionPolicy Bypass -File scripts\dev-install.ps1
# macOS
sh scripts/dev-install.sh
```

Restart Illustrator and open **Window > Extensions > PortableStudio**. Then:

1. Click **load the sample brand** in the welcome card.
2. Go to **Templates** and **Build** the starter templates.
3. Back on **Create**, select templates and click **Generate**.

## Make your own templates

See **[docs/TEMPLATE-GUIDE.md](docs/TEMPLATE-GUIDE.md)**. In short: design normally, name things with tags,
then **Templates > Scan open document > Add to library**. Starter templates are drawn by scripts in
`builders/`, which are a good example of how to build templates in code.

## Packaging

```bash
npm run package     # dist/PortableStudio-<version>.zip, plus a signed .zxp if a certificate is configured
npm test            # unit tests (tags, colour, brands, copy, licensing, packs, zip, API, ES3 safety)
```

## Project layout

```
index.html, css/, js/   Panel UI (Adobe CEP: Chromium + Node.js)
host/                   ExtendScript that runs inside Illustrator / Photoshop
core/                   Node modules shared by the panel and the MCP server (API, brands, packs, colour, copy...)
builders/               Scripts that draw the starter templates
templates/              Template library (template file + thumbnail + template.json)
config/                 Industries, template types, app settings
mcp/server.js           MCP server
docs/                   Template guide, API, MCP
```

## Licence

- **Code:** [GPL-3.0](LICENSE). You can use, study, change and share it. If you distribute a modified
  version, it must stay open source under the same licence.
- **Starter templates and sample brand** (`templates/`, `assets/sample/`): [CC0](templates/LICENSE.md),
  so use them in any client work with no attribution needed.
- **Template packs** sold or shared by others are licensed by their authors.

PortableStudio is an independent project and is not affiliated with Adobe or any other plugin vendor.
Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).
