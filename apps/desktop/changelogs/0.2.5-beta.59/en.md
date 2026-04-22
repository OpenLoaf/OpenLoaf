## What's Changed

### 🐛 Bug Fixes

- **Windows server crash on launch**: `skia-canvas` and `node-pptx-png-v2` were marked as webpack/esbuild externals in beta.58 but never copied into the packaged `resources/node_modules/`, so the bundled `server.mjs` threw `ERR_MODULE_NOT_FOUND: skia-canvas` on startup. Added both packages (plus their transitive deps) to the `postPackage` collection list in `forge.config.ts`.
