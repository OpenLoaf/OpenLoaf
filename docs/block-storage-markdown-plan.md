# Block Storage + Markdown/MDX Plan

## Goal
- Use block storage as the single source of truth.
- Provide Markdown/MDX import/export with consistent results across web and server.
- Keep `Page.markdown` as a derived cache for export/AI input.
- Defer collaboration (Yjs) to a later stage.

## Current Observations
- `Block.content` is already described as Slate/Plate JSON.
- The web editor uses Plate and already serializes/deserializes Markdown.
- `Page.markdown` exists and can become a second source of truth if not controlled.

## Definitions
- Top-level block: the first-level nodes in the Slate/Plate editor value array.
- Block storage scope: store only top-level nodes as rows in `Block`.

## Storage Strategy
### Single Source of Truth
- `Block` is authoritative for all page content.
- `Page.markdown` is derived from blocks and never edited directly.

### Block Granularity
- Store each top-level node as one `Block` row.
- Keep nested structures (lists, tables, columns, toggles) inside `Block.content.children`.
- Postpone deeper tree splitting until collaboration or granular operations require it.

## Markdown/MDX Conversion Strategy
### Shared Plugin Configuration
- Use the same Plate Markdown plugin configuration on web and server.
- Include MDX support (`remarkMdx`) to avoid losing MDX nodes.

### Conversion Module (packages/api)
Provide a pure-data conversion module with these responsibilities:
- `markdownToBlocks(markdown)`
  - Deserialize Markdown/MDX to Slate nodes using Plate Markdown plugin.
  - Convert top-level nodes into `Block` rows.
- `blocksToMarkdown(blocks)`
  - Order blocks by `order`.
  - Rebuild Slate nodes from blocks.
  - Serialize to Markdown/MDX using Plate Markdown plugin.
- Optional internal helpers for reuse:
  - `blocksToSlateValue(blocks)`
  - `slateValueToBlocks(value)`

## Data Flow
### Import Markdown/MDX
1. Markdown/MDX input.
2. Deserialize to Slate nodes.
3. Convert nodes to `Block` rows.
4. Persist blocks.
5. Regenerate `Page.markdown` (cache).

### Editor Save
1. Editor produces Slate nodes.
2. Convert nodes to blocks.
3. Persist blocks.
4. Regenerate `Page.markdown` (cache).

### Export Markdown/MDX
1. Load blocks.
2. Convert blocks to Slate nodes.
3. Serialize to Markdown/MDX.
4. Return export and/or update `Page.markdown`.

## Consistency Rules
- `Page.markdown` is updated only from blocks.
- Never accept direct writes to `Page.markdown` as the source of truth.
- Web and server must share the same Markdown/MDX plugin configuration.

## Risks and Mitigations
- Double source of truth: avoided by strict one-way derivation.
- Plugin mismatch: solved by shared configuration.
- Ordering conflicts: maintain stable `order` values; revisit if block inserts become frequent.

## Next Steps
1. Decide if `Page.markdown` regeneration is synchronous or async.
2. Define the shared Plate Markdown/MDX plugin config for server use.
3. Implement the conversion module in `packages/api` using the shared config.
4. Wire page save/import/export flows to the conversion module.
