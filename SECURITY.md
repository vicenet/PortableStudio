# Security policy

## Supported versions

Security fixes go into the latest release. Please update before reporting.

| Version | Supported |
|---|---|
| Latest release | ✅ |
| Older releases | ❌ |

## Reporting a vulnerability

**Please don't open a public issue for security problems.**

Report it privately through GitHub instead:
[**Security › Report a vulnerability**](https://github.com/vicenet/PortableStudio/security/advisories/new).

Include what you found, how to reproduce it, and which version and operating system you used. You'll
get a reply within 7 days. Once a fix is released, the advisory is published and you're credited
(unless you'd rather not be).

## Scope

PortableStudio runs inside Adobe Illustrator and Photoshop with Node.js enabled, so these matter most:

- the local REST API (`127.0.0.1` only, bearer token) and the MCP server
- template packs (`.zip`) installed from other people
- handling of brand files, fonts and images
- the installers and the signed `.zxp`

Release files are built from this repository by GitHub Actions (`.github/workflows/release.yml`).
Only download them from the [Releases page](https://github.com/vicenet/PortableStudio/releases).
