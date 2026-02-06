# Manifest updatedAt design

Date: 2026-02-06

## Overview
We want each published component entry in the remote `manifest.json` to include a publish timestamp so clients and operators can see when the current artifact was produced. The timestamp should be set during `pnpm publish` and be stable across time zones.

## Goals
- Add a per-component `updatedAt` field to `manifest.web` and `manifest.server`.
- Use ISO 8601 UTC strings (e.g. `2026-02-06T12:34:56Z`) for easy sorting and logging.
- Keep the change backward-compatible for existing clients.

## Non-goals
- No change to update selection logic.
- No schema version bump.
- No UI changes.

## Design
### Data model
- `manifest.web.updatedAt` and `manifest.server.updatedAt` are added.
- Value is generated via `new Date().toISOString()` at publish time.

### Publish flow
- Web publish script updates `manifest.web` with `version`, `url`, `sha256`, `size`, and `updatedAt`.
- Server publish script updates `manifest.server` with `version`, `url`, `sha256`, `size`, and `updatedAt`.
- Existing manifest download/upload flow stays the same.

### Error handling
- If `manifest.json` download fails, scripts create a new manifest and still set `updatedAt`.
- If upload fails, the publish step fails as it does today; no special retry logic is added.

### Compatibility
- Clients that ignore unknown fields continue to work.
- No change to `schemaVersion`.

## Testing and verification
- Manual: run publish scripts and verify `manifest.json` in R2 contains the new `updatedAt` fields.
- Optional: add a local log or JSON dump during dry runs to confirm timestamp format.

## Rollout
- Change is safe to deploy immediately because it only adds fields.
