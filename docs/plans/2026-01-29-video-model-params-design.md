# Video Model Parameters Design

## Context
We need a single source of truth for video model parameters so the frontend can render model-specific controls and the backend can validate input and map parameters to provider requests. This should support Qwen video models (wan2.6-i2v / wan2.6-i2v-flash) and Volcengine (jimeng_ti2v_v30_pro) without duplicating logic. The existing `VideoGenerateNode` uses fixed duration/ratio controls and Volcengine-specific request payload; this must be generalized based on `ModelDefinition`.

## Goals
- Extend `ModelDefinition` with a `parameters` field describing UI and request requirements.
- Frontend renders video generation controls based on model parameters.
- Backend enforces required parameters, applies defaults, and forwards a normalized payload to provider adapters.
- Provider adapters handle provider-specific field mapping (e.g., duration -> frames for Volcengine).

## Non-goals
- No dynamic mapping rules inside model definitions (no `mapTo`/`transform`).
- No changes to prompt/image input flow beyond parameter support.
- No change to non-video models unless they opt into the same parameter schema.

## Parameter Schema (ModelDefinition.parameters)
A parameter entry includes:
- `key`: string (e.g., `duration`, `resolution`, `aspectRatio`).
- `title`: string for UI label.
- `type`: `select` | `number` | `boolean` | `text`.
- `unit`: optional string (e.g., "秒").
- `values`: optional list for select.
- `min`/`max`/`step`: optional for number.
- `default`: optional default value (always sent when unset).
- `request`: boolean; when true the parameter is required.

Semantics: all parameters are sent to backend. If user does not provide a value, frontend uses `default` and still sends it. Backend also applies defaults as a guardrail. If `request: true` and no value is resolved (including default), backend rejects the request.

## Frontend Behavior
`VideoGenerateNode` uses `modelDefinition.parameters` for dynamic controls and payload assembly:
- Build UI controls per parameter type.
- Initialize local state from `default`.
- Always include parameter values in `videoGenerate` input payload.
- If a required parameter is missing and has no default, block the run with a clear message.

## Backend Behavior
`runProviderRequest` (or video generation request path) resolves `modelDefinition.parameters`:
- Merge input payload with defaults for missing fields.
- Validate required parameters.
- Pass normalized payload to provider adapter.

Provider adapter performs mapping:
- Volcengine: `duration` -> `frames`, `aspectRatio` -> `aspect_ratio`.
- Qwen: direct fields (e.g., `resolution`, `duration`, `prompt_extend`, `shot_type`).

## Model Registry Updates
Add Qwen video models in `apps/web/src/lib/model-registry/providers/qwen.json` with `video_generation` tag and appropriate `parameters`.
Add Volcengine video model parameters to its registry entry so UI is consistent.

## Testing
- Manual: select each model and verify controls render and defaults apply.
- Run video generation with missing required params to ensure frontend and backend errors.
- Verify Volcengine duration maps to frames; Qwen receives resolution/duration fields.
