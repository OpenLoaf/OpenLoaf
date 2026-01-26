# WPS Client Docs Export Design

## Goal
Export WPS client documentation from the Open WPS API into local Markdown files under `docs/`, preserving titles, content, images, and internal navigation.

## Inputs
- `docs/client.json` (primary source for the document tree)
- API fallback for client tree: `https://open.wps.cn/docs/api/collections/client?lang=zh`
- Per-doc API: `https://open.wps.cn/docs/api/doc/<doc-id>?lang=zh&source=local`

## Output Layout
- Each document is saved under `docs/<pageLink>` (mirror the remote path)
- Example:
  - `docs/app-integration-dev/wps365/client/wpsoffice/wps-integration-mode/wps-client-dev-introduction.md`

## Markdown Front Matter
Each output Markdown file starts with YAML front matter:
- `id`
- `fileName`
- `hash`
- `fileSource`
- `pageLink`
- `meta`
- `breadcrumb`

## Content Handling
- Preserve the original Markdown content as returned by the API.
- Rewrite links for local navigation and assets:
  - Internal doc links (e.g. `/app-integration-dev/...`) are rewritten to local relative `.md` paths.
  - Images are downloaded to `docs/assets/` and the Markdown is updated to point to local files.

## Link Rewriting Strategy
- Build a mapping from client tree:
  - `pageLink` (with `.md`)
  - `pageLink` without `.md` (for in-page links that omit the extension)
- For each link target:
  - If it is an internal path and found in the map, replace it with a relative path from the current file.
  - If it is external, keep as-is.

## Image Downloading Strategy
- Detect Markdown images (`![alt](url)`) and HTML images (`<img src="...">`).
- Download HTTP/HTTPS images into `docs/assets/`.
- File names are deterministic: `sha256(url) + original extension`.
- Replace image URLs with relative paths.

## Error Handling and Logging
- Continue on per-doc fetch failures; record failures and report at the end.
- Log summary: total docs, successes, failures, images downloaded, images skipped.

## CLI Behavior
- Default: use `docs/client.json`.
- If missing or `--refresh-client` is passed: fetch the collection and overwrite `docs/client.json`.

## Constraints
- No new dependencies; use Python standard library.
- Keep output ASCII-only in script and docs where possible.
