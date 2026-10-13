# PortableStudio local API

While the PortableStudio panel is open in Illustrator or Photoshop, it serves a JSON API on your own
computer only:

| App | Base URL |
|---|---|
| Illustrator | `http://127.0.0.1:7391/v1` |
| Photoshop | `http://127.0.0.1:7392/v1` |

Every request needs the token from **Settings > Local API**:

```
Authorization: Bearer <token>
```

The API refuses requests from web browsers (any request with an `Origin` header), so a website you visit
can't use it. Responses are `{"ok": true, "data": …}` or `{"ok": false, "error": "…"}`.

## Endpoints

| Method & path | Body / query | Does |
|---|---|---|
| `GET /status` | | App, version, license and settings summary |
| `GET /config` | | Industries (voice, palettes, starter copy) and template types |
| `GET /templates` | `?industry=&category=&app=all` | Templates for this app (or all apps) |
| `GET /templates/:id` | | One template |
| `GET /brands` | | Saved brands |
| `GET /brands/:id` | | One brand |
| `POST /brands` | brand object | Create a brand (or overwrite, when `id` is given) |
| `PUT /brands/:id` | partial brand | Update only the fields you send |
| `DELETE /brands/:id` | | Delete a saved brand |
| `POST /generate` | `{brandId \| brand, templateIds[], exportPages?, pageWidth?}` | Fill templates. Returns output folders and a report per template |
| `POST /logo-kit` | `{brandId \| brand}` | Logo files, favicons and social images (Illustrator only) |
| `POST /palette/extract` | `{imagePath, count?}` | Main colours of an image plus suggested roles |
| `POST /palette/report` | `{colors}` or `{brandId}` | Tints, shades, CMYK and WCAG contrast |
| `POST /copy` | `{brandId \| brand, source: "ai"\|"industry", brief?, slides?, save?}` | Write brand copy |
| `GET /packs` | `?catalogUrl=` | Template packs in the catalog |
| `POST /packs/install` | `{packId, catalogUrl?, overwrite?}` | Install a pack |
| `GET /license` | | License status |

`generate` and `logo-kit` run inside the Adobe app and can take a minute or more, so allow for long
response times. Templates for the other app are skipped and reported; the MCP server sends each template
to the right app automatically.

## Example

```bash
TOKEN=...   # Settings > Local API > Copy
curl -s -X POST http://127.0.0.1:7391/v1/brands \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Saffron Kitchen","industry":"restaurant","colors":{"primary":"#C8553D"}}'

curl -s -X POST http://127.0.0.1:7391/v1/generate \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"brandId":"saffron-kitchen","templateIds":["sample-brand-guidelines"],"exportPages":true}'
```

## Brand object

```json
{
  "id": "saffron-kitchen",
  "name": "Saffron Kitchen",
  "tagline": "Spice it up",
  "industry": "restaurant",
  "website": "saffron.example",
  "designerName": "…", "designerEmail": "…",
  "colors": { "primary": "#C8553D", "secondary": "#2D3047", "accent": "#F2D0A4" },
  "fonts": { "heading": { "ps": "Montserrat-Bold", "name": "Montserrat Bold" }, "body": "Inter-Regular" },
  "logos": { "mark": "C:/logos/mark.svg", "full": "C:/logos/full.svg", "type": "" },
  "copy": {
    "headline": "…", "subheadline": "…", "about": "…", "mission": "…", "voice": "…", "cta": "…",
    "values": ["Fresh", "Generous"],
    "slides": [{ "title": "…", "body": "…" }]
  }
}
```

A font can be given as a PostScript name string or as `{ps, name}`. Brands are stored as JSON files in
`Documents/PortableStudio/Brands`.
