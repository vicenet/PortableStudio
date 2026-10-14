# Signing the installers

Unsigned installers work, but Windows SmartScreen and macOS Gatekeeper warn about them. The release
workflow signs them automatically as soon as the repository has the secrets below. Until then it builds
unsigned installers, exactly as before.

Add secrets under **Settings › Secrets and variables › Actions › New repository secret**. Secrets are
encrypted, never shown in logs, and not available to workflows started from forks.

## Windows (`PortableStudio-<version>-setup.exe`)

You need a **code-signing certificate** (OV or EV) from a certificate authority such as Sectigo, DigiCert
or SSL.com, roughly US$200–500 a year. Export it as a `.pfx` file with a password.

| Secret | Value |
|---|---|
| `WINDOWS_CERT_PFX_BASE64` | The `.pfx` file in base64: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("cert.pfx")) \| Set-Clipboard` |
| `WINDOWS_CERT_PASSWORD` | The `.pfx` password |

Many EV certificates now live on a hardware token or a cloud HSM and can't be exported. For those, use the
provider's signing service (for example SSL.com eSigner or Azure Trusted Signing) and replace the
"Sign the installer" step with the provider's GitHub Action.

## macOS (`PortableStudio-<version>.pkg`)

You need an **Apple Developer Program** membership (US$99 a year) and a **Developer ID Installer**
certificate (Xcode › Settings › Accounts › Manage Certificates, or developer.apple.com). Export it from
Keychain Access as a `.p12` with a password. Notarisation also needs an app-specific password
(appleid.apple.com › Sign-In and Security › App-Specific Passwords).

| Secret | Value |
|---|---|
| `APPLE_INSTALLER_CERT_P12_BASE64` | The `.p12` file in base64: `base64 -i cert.p12 \| pbcopy` |
| `APPLE_INSTALLER_CERT_PASSWORD` | The `.p12` password |
| `APPLE_ID` | Your Apple ID email |
| `APPLE_TEAM_ID` | Your 10-character team ID (developer.apple.com › Membership) |
| `APPLE_APP_PASSWORD` | The app-specific password |

The workflow signs the package with `productsign`, notarises it with `notarytool` and staples the ticket,
so it installs without a warning.

## The `.zxp`

The `.zxp` is signed locally by `npm run package` with a self-signed certificate, which is what Adobe's
tools and Adobe Exchange expect. It does not need a paid certificate.

After adding secrets, re-run the release for an existing tag from **Actions › Release installers ›
Run workflow**.
