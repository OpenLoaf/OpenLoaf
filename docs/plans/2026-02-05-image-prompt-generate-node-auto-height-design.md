# Image Prompt Generate Node Auto Height Design

## Context
The image prompt generation node keeps a fixed height and caps the "图片内容" area with a max height + scrollbar. This leaves the node tall when empty and forces scrolling for longer outputs. The requested behavior is to shrink when empty and grow with content.

## Goals
- Node height shrinks when there is no result text.
- Node height grows with result text content.
- Remove the max height/scrolling constraint from the "图片内容" area.

## Approach
- Add a container ref and measure its intrinsic height by temporarily setting height to auto and reading scrollHeight.
- Schedule height updates in requestAnimationFrame when result text or status changes, then update `element.xywh` via `engine.doc.updateElement`.
- Skip updates while locked or dragging to avoid jitter.
- Remove the max height style and overflow on the "图片内容" container.

## Files to Change
- `apps/web/src/components/board/nodes/ImagePromptGenerateNode.tsx`

## Testing
- With empty output, confirm the node is shorter than the old default.
- With a short output, confirm the node expands to fit without scrollbars.
- With a long output streaming, confirm the node grows with content and no internal scroll area appears.
