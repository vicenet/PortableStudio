# Designing PortableStudio templates

Design normally in Illustrator or Photoshop. To make something swappable, give it a **tag**: a name in
double curly braces, like `{{brand.name}}`. When someone clicks Generate, PortableStudio opens a copy of your
file, fills every tag with their brand, and saves the result.

## Available tags

| Tag | Becomes |
|---|---|
| `{{brand.name}}` | Brand name |
| `{{brand.tagline}}` | Tagline (empty if not given) |
| `{{brand.industry}}` | Industry name |
| `{{brand.website}}` | Website |
| `{{designer.name}}`, `{{designer.email}}` | The designer's details |
| `{{date}}`, `{{year}}` | e.g. "October 2026", "2026" |
| `{{color.primary.hex}}` / `.rgb` / `.cmyk` | Colour values as text (also `secondary`, `accent`) |
| `{{font.heading}}`, `{{font.body}}` | Font names as text |
| `{{logo.mark}}`, `{{logo.full}}`, `{{logo.type}}` | Logo placeholders (see below) |
| `{{copy.headline}}`, `{{copy.subheadline}}`, `{{copy.cta}}` | Short brand copy |
| `{{copy.about}}`, `{{copy.mission}}`, `{{copy.voice}}` | Longer brand copy |
| `{{copy.values}}` | All values, one per line. Or `{{copy.value1}}` … `{{copy.value6}}` (empty when the brand has fewer) |
| `{{copy.slide1.title}}`, `{{copy.slide1.body}}` … `slide5` | Carousel slide text |

The copy comes from the **Brand copy** section of the panel: written by Claude, taken from the
industry's starter copy, or typed in by hand.

| Photo tag | Becomes |
|---|---|
| `{{image.photo1}}` … `{{image.photo4}}` | Photos chosen in the panel's **Photos** section |

### Logo and photo modifiers (Illustrator)

Add these after a `\|` in a placeholder's name, e.g. `{{logo.full\|white}}`.

| Modifier | Effect |
|---|---|
| `cover` | Fill the box and crop to it (use for photos) |
| `white`, `black`, `primary`, `secondary`, `accent` | Logo in one colour. Uses the brand's **White/Black versions** when provided; otherwise vector logos are recoloured and transparent PNGs get generated colour versions |
| `grid` | Construction page: the logo faded, with outlines, anchor points, handles and circles drawn over it (vector logos) |
| `stretch`, `rotate`, `flipx`, `flipy`, `faded` | Deliberately wrong versions for "logo misuse" pages |

Multi-colour logos lose detail when flattened to one colour, so add the brand's real white and black
artwork under **Logos > One-colour versions** in the panel. Raster logos (PNG/JPG) are trimmed of empty margins automatically. Logos and photos are copied into a
`Links` folder next to each generated file and linked rather than embedded, which keeps files small.

Tags are not case-sensitive. A tag the panel can't fill stays visible and is listed after generating, so
typos are easy to spot.

## Illustrator

| To make this swappable | Do this |
|---|---|
| **Text** | Type the tag inside any text, e.g. `Brand guidelines for {{brand.name}}`. Each tag keeps the styling of the text around it. Or name the text object with a tag to replace its whole content. |
| **Colours** | Create swatches named **Primary**, **Secondary** and **Accent**, and tick **Global** when creating them. Use these swatches for every fill and stroke that should follow the brand. Changing the swatch recolours all of it. |
| **Fonts** | Create paragraph (or character) styles named **Heading** and **Body** and apply them to your text. Don't change the font directly on that text, or the style can't change it. |
| **Logos** | Draw a rectangle where the logo should go and name it `{{logo.mark}}` (Layers panel, double-click the name). The logo is scaled to fit inside it, centred, and the rectangle is removed. Add `\|cover` to fill the box instead, e.g. `{{logo.mark\|cover}}`. |
| **Pages** | One artboard per page. Carousels are artboards side by side. |

Before adding the template: **embed** any photos you use (Links panel > Embed Image). Otherwise the template
breaks when it's copied.

## Photoshop

Everything in Photoshop is tagged by **layer name**.

| To make this swappable | Do this |
|---|---|
| **Text** | Name the text layer with a tag: `{{brand.name}}`. Add a font role and/or colour after a `\|`: `{{brand.name\|heading}}`, `{{brand.website\|body\|secondary}}`. You can also type tags inside the text itself. |
| **Colours** | Use a Solid Color fill layer (Layer > New Fill Layer > Solid Color) named `{{color.primary}}`. Clip other layers to it, or use it as the background. |
| **Logos (flat layouts)** | Make any layer (e.g. a grey box) the size and position of the logo area and name it `{{logo.mark}}`. The logo is placed, fitted inside it, and the placeholder is deleted. |
| **Logos (mockups)** | For mockups with perspective, warps or effects, use a smart object named `{{logo.mark\|replace}}`. Its contents get replaced, so all the effects stay. Size the smart object's contents to the shape of a typical logo. |

Photoshop can't place SVG files. Use PNG or PDF logos there.

## Carousels and multi-page exports

- **Illustrator:** one artboard per slide (e.g. 1080×1350), placed left to right.
- **Photoshop:** one artboard per slide (Layer > New > Artboard). Each slide is exported in reading
  order, top to bottom and then left to right.

Give the template the type **Social Carousel** and every slide is exported as its own PNG
(`Pages/<brand>-<template>-01.png` …), ready to upload. For any other template, tick
**Also export each page / slide as PNG**.

## Adding the design to the library

1. Save your design (`.ai` or `.psd`).
2. In the PortableStudio panel, go to **Templates** > **Scan open document**.
3. Fix any warnings it shows (e.g. "Swatch Primary must be a Global swatch").
4. Enter a name, type and industries, then click **Add to library**.

This copies your file into `templates/<name>/` with a thumbnail and a `template.json`. Clicking **Edit**
in the library opens the template copy so you can change it later. Re-save it there and it's updated.

Tip: **Create sample template** builds a small, fully tagged example. Open its Layers panel to see the
conventions in practice.

## Text that might run long

Use **area text** (click-drag a text box) for anything with variable length: headlines, about,
mission, carousel slides. If the filled text doesn't fit, PortableStudio shrinks it step by step until it does and
lists it in the report. Point text (a single click) never wraps or shrinks.

## Building templates in code

The starter templates are drawn by scripts in `builders/` using `builders/lib.jsx` (rectangles, text,
placeholders, patterns, gradients and multi-paragraph text boxes). Copy one of them to start a new template
family, then add it to `STARTERS` in `js/studio.js` so it appears under **Templates > Starter templates**.
