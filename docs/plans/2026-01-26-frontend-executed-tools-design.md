# Frontend-Executed Tools Design (open-url migration)

## Goal
Introduce a unified mechanism for tools that must be executed by the frontend. The server should wait for the frontend to complete and then return the result to the LLM. This will directly replace the current `open-url` data-part flow.

## Summary
- Tool execution is split: server triggers + waits, frontend executes + acknowledges.
- The frontend sends an HTTP acknowledgement with `toolCallId`, status, output, error, and requested time.
- The server waits for the acknowledgement with a timeout (default 60 seconds, configurable per tool via `timeoutSec`).
- `open-url` is migrated first; the old `data-open-browser` flow is removed from the execution path.

## Architecture
### Core Concepts
- **Frontend-Executed Tool**: a ToolDef with `executionMode: "frontend"` (or equivalent marker).
- **Pending Registry (in-memory)**: `toolCallId -> Deferred`, with a deadline and timeout timer.
- **Ack Endpoint**: HTTP endpoint to receive frontend execution results.

### Data Flow
1. LLM calls a frontend-executed tool (example: `open-url`).
2. Server validates input, registers `toolCallId` in the Pending Registry, then waits.
3. Frontend receives tool input via streaming parts, runs the handler, then acknowledges.
4. Server resolves the pending promise on ack; if no ack arrives before timeout, it returns a timeout result.

## API Contract
### Ack Endpoint
`POST /api/tools/ack` (or tRPC mutation)

Payload:
```json
{
  "toolCallId": "string",
  "status": "success" | "failed" | "timeout",
  "output": {},
  "errorText": "string | null",
  "requestedAt": "2025-02-01T12:34:56.789Z"
}
```

Behavior:
- If `toolCallId` is pending, resolve and return `{ ok: true }`.
- If not found (expired or unknown), return 404/410 or `{ ok: false, reason }`.
- Optional idempotency: repeated acks return `{ ok: true, ignored: true }`.

## ToolDef Changes
- Add optional `timeoutSec` to frontend-executed tool parameters.
- Default timeout: 60 seconds.
- `open-url` updated to include `timeoutSec` and the frontend-executed marker.

## Server Implementation
### Pending Registry
- `registerPending(toolCallId, timeoutSec)`
  - Creates a Deferred and a timer.
  - Stores in a Map keyed by `toolCallId`.
- `resolvePending(toolCallId, payload)`
  - Resolves Deferred and clears timer.
- `timeoutPending(toolCallId)`
  - Resolves with `{ status: "timeout" }` and clears entry.

### open-url Tool
- Remove `data-open-browser` write.
- Validate inputs, register pending, await completion.
- Return the ack payload as tool output.

## Frontend Implementation
### Executor
- `FrontendToolExecutor` registry (toolId -> handler).
- `execute(toolCallId, input)` runs handler and then posts ack.

### open-url Handler
- Opens browser panel via existing `pushStackItem` flow.
- On success, ack `status: "success"` with `{ url, viewKey }` output.
- On failure, ack `status: "failed"` with `errorText`.

### Fallback
- Keep the "Open" button in the tool card for manual retry.

## Error Handling
- Missing `toolCallId` on the frontend: do not execute.
- Ack errors: log and surface in UI for debugging.
- Timeout: server returns `{ status: "timeout" }` and cleans pending entry.

## Testing
- Unit: Pending Registry resolution and timeout behavior.
- Integration: tool call -> frontend ack -> server response.
- open-url path: ensures panel opens and ack resolves.
