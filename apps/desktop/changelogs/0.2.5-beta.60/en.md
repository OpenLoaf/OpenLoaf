## What's Changed

### 🐛 Bug Fixes

- **macOS codesign failure on beta.59**: The newly-packaged `skia-canvas` / `node-pptx-png-v2` carried `node_modules/.bin/*` symlinks (e.g., `cargo-cp-artifact`, `node-pre-gyp`, `nopt`) whose targets were not copied into the bundle. macOS codesign rejected them with _"invalid destination for symbolic link in bundle"_. `postPackage` now filters out `.bin/` entries — they are build-time CLI shims, unused at runtime.
