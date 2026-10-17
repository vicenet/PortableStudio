# Using PortableStudio from Claude (MCP)

The MCP server lets Claude Desktop, Claude Code or any MCP client run PortableStudio for you, e.g.
*"Create a brand for Saffron Kitchen, an Indian restaurant in Leeds, write its copy, pick colours that
pass contrast checks, then generate the guidelines and a 5-slide Instagram carousel."*

## Setup

1. Install Node.js 18 or later.
2. In the project folder run `npm install`. This only needs doing once.
3. Add the server to your MCP client. **Settings > MCP > Copy config** in the panel gives you this with
   the right path:

   ```json
   {
     "mcpServers": {
       "portablestudio": {
         "command": "node",
         "args": ["D:/Developments/PortableStudio/mcp/server.js"]
       }
     }
   }
   ```

   - Claude Desktop: Settings > Developer > Edit Config, paste it in, restart Claude.
   - Claude Code: `claude mcp add portablestudio -- node D:/Developments/PortableStudio/mcp/server.js`

4. To generate files, keep Illustrator and/or Photoshop open with the PortableStudio panel showing.
   Brand, copy, colour and pack tools work without them.

## Tools

| Tool | Needs Adobe app open? | Does |
|---|---|---|
| `status` | | Which apps are connected |
| `list_industries` | | Industries with tone of voice and palettes |
| `list_templates` | | Templates, filterable by app, industry, type |
| `list_brands`, `get_brand` | | Read saved brands |
| `save_brand` | | Create a brand, or update the fields you pass |
| `delete_brand` | | Delete a saved brand |
| `write_brand_copy` | | Copy from Claude (`source: "ai"`) or industry starter copy |
| `color_report` | | Tints, shades, CMYK, WCAG contrast |
| `extract_palette_from_logo` | Illustrator or Photoshop | Colours from a logo image |
| `generate` | the template's app | Fill templates, export PDF/PNG and per-page PNGs |
| `export_logo_kit` | Illustrator | Logo formats, colour versions, favicons, social images |
| `list_template_packs`, `install_template_pack` | | Browse and install packs |

Every tool declares all four MCP hints (`readOnlyHint`, `destructiveHint`, `idempotentHint`,
`openWorldHint`) so your client can ask before anything that changes or deletes data. Only
`write_brand_copy`, `list_template_packs` and `install_template_pack` reach the internet. `save_brand`,
`delete_brand`, `write_brand_copy` (when saving) and `install_template_pack` (when overwriting) can
replace existing data. `generate` and `export_logo_kit` always write into a new timestamped folder.

`write_brand_copy` with `source: "ai"` uses the Anthropic API key from PortableStudio Settings, or the
`ANTHROPIC_API_KEY` environment variable of the MCP server.

## How it connects

The MCP server reads the same data files as the panel (brands, templates, settings). For work that has
to happen inside Illustrator or Photoshop, it calls the panel's local API (see `API.md`). It uses the
API token stored in your settings file, so you don't need to configure a token.
