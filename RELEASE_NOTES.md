# Mangyomi v2.0.0 Release Notes

## 🚀 Major Security Update: Sandboxed Extensions
This release introduces a completely redesigned extension system built for security and stability.

- **Sandboxed Execution**: Extensions now run in isolated `BrowserWindow` environments with `nodeIntegration: false` and `contextIsolation: false` (restricted).
- **Blocked Node.js APIs**: Direct access to `require`, `process`, `fs`, `path`, and other Node.js globals is now physically blocked.
- **Safe APIs**: Extensions must now use:
    - `fetch()` (Window-scoped, with domain whitelisting)
    - `parseHTMLDoc()` (based on `DOMParser`, replacing `jsdom`)

## ⚠️ Breaking Changes
- **Extension Compatibility**: Extensions written for Mangyomi v1.x are **incompatible** with v2.0.0. All extensions must be updated to the new Manifest v2 format and API guidelines.
- **Manifest v2**: Extension manifests now support a `permissions` field for declaring additional allowed domains (beyond `baseUrl`).

## 📦 Extension Updates
All official extensions have been updated to v2.0.0 to support the new secure architecture:
- `mangakakalot` v2.0.0
- `asuracomic` v2.0.0
- `toonily` v2.0.0
- `weebcentral` v2.0.0
- `hentaiforce` v2.0.0

## 🛠 Fixes & Improvements
- **Robustness**: The application UI now gracefully handles invalid extension metadata without crashing.
- **Performance**: Improved extension loading times and reduced memory footprint by removing `jsdom`.
