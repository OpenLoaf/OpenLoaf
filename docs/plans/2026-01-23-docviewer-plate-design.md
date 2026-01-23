# DocViewer Plate Design

## Goal
Replace the existing `DocViewer` implementation with a Plate-based DOC/DOCX viewer/editor that supports read-only and edit modes, uses `DocxPlugin` + `JuicePlugin`, and integrates with the unified file-open flow.

## Non-Goals
- No custom server-side conversion endpoint.
- No full fidelity layout parity with Microsoft Word beyond Plate’s DOCX import/export capabilities.
- No new toolbar features beyond the agreed light set.

## User Experience
- Default to read-only preview.
- If `readOnly === false`, allow toggling into edit mode with a light toolbar.
- Saving persists back to the original `.docx` via `fs.writeBinary`.
- `.doc` files attempt to open in the same viewer; failed imports show an error with a system-open option.

## Data Flow
1. Read file with `trpc.fs.readBinary` and decode base64 → ArrayBuffer in the browser.
2. `importDocx(editor, arrayBuffer)` produces Plate nodes.
3. Render with Plate using a minimal plugin set plus `DocxPlugin`/`JuicePlugin`.
4. Export via `exportToDocx(editor.children, { editorPlugins, editorStaticComponent })`.
5. Convert Blob → base64 and persist using `trpc.fs.writeBinary`.

## Editor Configuration
- **Plugins:** Basic blocks, basic marks, list kit, `DocxPlugin`, `JuicePlugin`.
- **Toolbar:** Undo/Redo, Heading (H1–H3 + paragraph), Bold/Italic/Underline, Bulleted/Numbered list.
- **Read-only mode:** hide toolbar and set Plate `readOnly`.

## Error Handling
- Failed import or missing payload shows an error state.
- `.doc` import failures display an explicit “DOC not supported” message and keep system-open available.

## Integration Points
- `apps/web/src/components/file/DocViewer.tsx` (replace implementation).
- `apps/web/src/components/file/lib/open-file.ts` (`INTERNAL_DOC_EXTS` include `doc`/`docx`).
- `apps/web/package.json` add `@platejs/docx-io`.
- `apps/web/src/components/editor/plugins/docx-export-kit.tsx` (new) for export helpers.

## Risks
- DOCX export styling depends on static component overrides; advanced formatting may degrade.
- DOC import fidelity limited by `@platejs/docx-io` conversion quality.
