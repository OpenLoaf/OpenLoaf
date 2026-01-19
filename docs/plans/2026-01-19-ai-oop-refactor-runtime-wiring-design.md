# AI OOP Refactor Runtime Wiring Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the legacy AI pipeline with the OOP layered stack as the only runtime path for `/ai/execute`, preserving all current behaviors.

**Architecture:** Keep the existing request/stream semantics but move control flow into the new interface/application/domain/infrastructure layers. `AiExecuteController` and `AiExecuteService` become the single entrypoint, and all request routing is done via use-cases wired through `AiModule`. Delete the legacy pipeline, exports, and command utilities after the new path is proven equivalent.

**Tech Stack:** Hono, AI SDK v6, Prisma, tRPC, existing chat stream services.

## Scope

- Route `/ai/execute` exclusively through `AiExecuteController` -> `AiExecuteService` -> use-cases.
- Keep the current behavior for chat streaming, image generation, and `/summary-title` + `/summary-history` commands.
- Remove legacy pipeline modules and exports after the new stack is the only entrypoint.
- No new user-facing features or command expansions in this pass.

## Constraints

- Preserve SSE output structure (headers, chunks, event types).
- Preserve message persistence order and session preface hash semantics.
- Preserve tool approval strategy and skill resolution order.
- Keep model selection fallback behavior unchanged.

## Current Runtime Summary

- `/ai/execute` currently calls `runAiExecute` in `apps/server/src/ai/pipeline/aiPipeline.ts`.
- `runAiExecute` handles command parsing, skill injection, and routes to:
  - `SummaryTitleUseCase` for `/summary-title`
  - `ChatStreamUseCase` for chat streams (including `/summary-history` compaction path)
  - `ImageRequestUseCase` for `intent=image` + `responseMode=json`
- The layered stack exists, but many files are placeholder-only and not wired into the runtime.

## Wiring Plan Overview

1. Make `AiExecuteController` the only entrypoint for `/ai/execute` route handling.
2. Implement `AiExecuteService` routing to use-cases for:
   - `/summary-title`
   - chat stream (including `/summary-history` compaction)
   - image requests
3. Move command parsing and skill resolution into domain/application services (or reuse existing helpers) but invoked via the new service.
4. Remove legacy pipeline modules (`ai/pipeline/*`) and remove re-exports in `ai/index.ts`.

## Design Details

### 1) Interface Layer

- `apps/server/src/ai/interface/routes/aiExecuteRoutes.ts` should call `AiExecuteController.execute`.
- `AiExecuteController` should:
  - Parse and validate the request payload (existing logic can stay in `aiExecuteRoutes` or be moved here).
  - Build `RequestScope` (session/workspace/project/board/tab/messageId).
  - Delegate to `AiExecuteService`.

### 2) Application Layer

- `AiExecuteService.execute` should:
  - Extract last user message text.
  - Parse command at start of input (keep current semantics: only `/summary-title` and `/summary-history`).
  - Resolve skill injections for user messages (current behavior in `ai/pipeline/skillResolver.ts`).
  - Route to use-cases:
    - `SummaryTitleUseCase` for `/summary-title`.
    - `ChatStreamUseCase` for chat streams (including `/summary-history`).
    - `ImageRequestUseCase` for `intent=image` with `responseMode=json`.
  - Return `Response` with identical SSE/JSON outputs.

### 3) Domain Layer

- Keep command parsing behavior identical to `parseCommandAtStart`.
- Skill resolution order remains: project -> parent -> workspace.
- Session preface building and prompt assembly remain in existing services.

### 4) Infrastructure Layer

- Existing chat stream services (`apps/server/src/ai/application/services/chatStream/*`) remain the runtime implementations for streaming, compaction, and attachment resolution.
- Repository modules like `messageStore` and `messageChainLoader` remain and are invoked by use-cases/services.

## Deletions

After new path is verified:
- Remove `apps/server/src/ai/pipeline/*` (including `aiPipeline.ts`, `commandParser.ts`, `commandRegistry.ts`, `skillResolver.ts`).
- Remove legacy exports from `apps/server/src/ai/index.ts` that point to deleted pipeline modules.
- Remove unused placeholder files that are no longer referenced (verify with `rg`).

## Verification

- Manual smoke checks:
  - `/ai/execute` chat stream: ensure SSE chunks and message persistence order are unchanged.
  - `/ai/execute` with `/summary-title`: ensure title generation, update, and SSE event output are unchanged.
  - `/ai/execute` with `/summary-history`: ensure compact_prompt and compact_summary insertion is unchanged.
  - `/ai/execute` with `intent=image` + `responseMode=json`: ensure JSON response matches current schema.
- Optional automated checks if available: `pnpm check-types`.

## Rollout Notes

- No fallback/feature flag; legacy pipeline is removed.
- Ensure route imports reference the new controller path.

