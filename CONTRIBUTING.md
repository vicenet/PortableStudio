# Contributing to PortableStudio

Thanks for helping! Bug reports, fixes, templates and new features are all welcome.

## Setup

```bash
npm install
powershell -ExecutionPolicy Bypass -File scripts\dev-install.ps1   # Windows
sh scripts/dev-install.sh                                           # macOS
npm test
```

The install script links the extension into Adobe's extensions folder, so edits show up when you close
and reopen the panel. Debug the panel in Chrome at `http://localhost:8088` (Illustrator) or
`http://localhost:8089` (Photoshop).

## Rules of the road

- **Host scripts are ES3.** Everything in `host/` and `builders/` runs in Adobe's ExtendScript engine:
  no `let`/`const`, arrow functions, template literals, `Array.forEach`, `Object.keys` or trailing commas.
  `npm test` checks this.
- **Panel code runs on Chromium 88 / Node 15** (Adobe CEP 11). Avoid newer APIs such as `structuredClone`,
  `Array.at` or global `fetch` in Node code (use `core/http.js`).
- **`core/` is shared** by the panel and the MCP server. Keep it free of DOM and Adobe APIs, and add tests
  in `tests/`.
- **Only original or properly licensed assets.** Don't add templates, fonts, images or code taken from
  other products. Templates contributed to this repo are released under CC0 (see `templates/LICENSE.md`).
- Keep changes focused, and describe in the pull request how you tested them in Illustrator/Photoshop.

## Contributing templates

1. Design in Illustrator or Photoshop following `docs/TEMPLATE-GUIDE.md`, or write a builder script in
   `builders/` using `builders/lib.jsx`.
2. Add it through **Templates > Scan open document > Add to library**.
3. Include the template folder (`template.ai|psd`, `thumbnail.png`, `template.json`) in your pull request.

## Licence

By contributing you agree that your code is licensed under GPL-3.0 and your templates/assets under CC0.
