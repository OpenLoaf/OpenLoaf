---
name: agent-orchestration-skill
description: >
  Triggers when the master Agent faces a multi-step complex task and is deciding whether / how to outsource sub-tasks to built-in subagents (browser / doc-editor / data-analyst / extractor / canvas-designer / coder, etc.). **Not for**: single-step Q&A / reads / simple side effects (master Agent handles directly), or scenarios where `Agent` is already confirmed and `subagent_type` is known.
version: 5.0.0
---

# Subagent Delegation & the Agent Tool

The master Agent can dispatch built-in or custom subagents on demand via the `Agent` tool, outsourcing specialized sub-tasks. This skill answers four questions: **when to delegate, to whom, how to invoke, and what the system constraints are**.

## Tool Inventory

| Tool | Responsibility | Read-only |
|------|------|------|
| `Agent` | Launches a built-in or custom subagent by `subagent_type` to handle a multi-step complex task | No |

> **Loading**: `Agent` is a core tool — always available, no `ToolSearch` activation required.

## Delegation Decision

```
User message →
  ├─ Simple Q&A / chat / read / query / single-step side effect (create event, send email, create project) → master Agent handles directly
  └─ Multi-step complex task →
      ├─ Web interaction (click/fill form/login/screenshot/paginated scraping) → browser
      ├─ Rich text / long document editing (Markdown, DOCX, PDF) → doc-editor
      ├─ Spreadsheet data analysis / chart generation → data-analyst
      ├─ Structured extraction from PDF / images / web pages → extractor
      ├─ Canvas node operations / layout → canvas-designer
      ├─ Code writing / debugging (global mode only; in project mode the PM does it themselves) → coder
      └─ Mixed task → master Agent decomposes, then delegates to multiple subagents sequentially or in parallel
```

**Don't "delegate everything"**: simple Q&A, single-step operations, and pure reads should be handled directly by the master Agent. Delegation itself introduces context-passing overhead and extra steps — for small tasks the cost outweighs the benefit.

## Six Built-in Subagents

Each subagent has its own system prompt and tool set, with step counts tuned to the task profile.

| Subagent | When to trigger | Tool set | Steps |
|---|---|---|---|
| 📝 **doc-editor** | Rich text / Markdown / Word / PDF editing, long-document rewriting | Write, Read, Glob | 15 |
| 🌐 **browser** | Page navigation, DOM interaction, form filling, screenshots, paginated scraping | browser-*, WebSearch | 20 |
| 📊 **data-analyst** | CSV/Excel cleaning, statistical computation, ECharts/Mermaid charts | Read, Write, Bash | 15 |
| 🔍 **extractor** | PDF/image OCR, table extraction, multi-document comparison extraction | Read, office-read, WebFetch | 10 |
| 🎨 **canvas-designer** | Node add/remove/update, auto layout, text-to-canvas conversion | canvas-*, canvas-read | 15 |
| 💻 **coder** | Multi-language code writing / review / debugging | Write, Read, Grep, Glob, Bash | 20 |

## Agent Tool Invocation

```
Agent { description: "Scrape product table from site A", prompt: "...", subagent_type: "browser" }
```

| Parameter | Purpose |
|---|---|
| `description` | Short title, shown to the user as progress |
| `prompt` | The full instruction handed to the subagent |
| `subagent_type` | Subagent type |

| subagent_type | Scenario | Capabilities |
|---|---|---|
| `general-purpose` | General tasks (default) | Full tool set |
| `explore` | Codebase/doc exploration, read-only analysis | Read-only tools |
| `plan` | Solution design, produce an implementation plan | Read-only tools |
| Any of the 6 built-in subagent names above | Specialized tasks | Tool set defined per subagent |
| Custom Agent name | A registered specialized Agent | Tool set defined by that Agent |

**The Agent tool waits synchronously by default** for the subagent to complete and return — after calling, you immediately get the output and proceed to the next step; no extra wait tool needed.

## SendMessage: Follow-up Instructions

When a subagent is already running but needs additional instructions or a course correction:

```
SendMessage { toolCallId: "agent-xxx", message: "Additional requirement: output results in JSON format" }
```

`SendMessage` **auto-resumes a stopped agent** — no need to recreate via `Agent`, avoiding the cost of re-passing the full context.

## Parallel Fan-out & Aggregation

When sub-tasks are independent of each other, **issue multiple Agent calls in the same turn**; each returns synchronously, and the master Agent aggregates:

```
Master Agent decomposes task → issues in parallel:
  Agent { description: "Scrape site A", subagent_type: "browser", prompt: "..." }
  Agent { description: "Scrape site B", subagent_type: "browser", prompt: "..." }
  Agent { description: "Scrape site C", subagent_type: "browser", prompt: "..." }
  ↓ Each returns synchronously: A / B / C
Master Agent aggregates → final response
```

**Good for parallel**: sub-tasks are independent and parallelism meaningfully shortens total runtime.
**Not for parallel**: later tasks depend on earlier tasks' output (serial dependency); total count exceeds the concurrency limit of 4 and needs batching.

## Context Inheritance

Subagents automatically inherit from the master Agent:

- **projectId** — same project sandbox; path permissions and file access stay consistent
- **Skills tied to pageContext** — the subagent sees the same capability awareness (if the master Agent creates an extractor on the email page, the extractor also sees `email-ops`)
- **Temporary project path** — if the master Agent has created a temp project, subagents share that directory

This means you **don't need** to repeat environment information in the prompt — the subagent can derive it from inherited context.

## System Hard Limits

| Limit | Value | Rationale |
|---|---|---|
| Max delegation depth | 2 (master → sub; sub cannot spawn further) | Each level copies context — deeper nesting grows token consumption exponentially; also avoids cascading failures that are hard to diagnose |
| Max concurrency | 4 subagents | Balance point between response speed and system resources (memory, API connections) |
| Auto cleanup | 5 minutes | Completed Agents are auto-removed from memory to prevent accumulation leaks |
| Hard step limit | Master 200 / Sub 10-20 | Sub values as listed above; Master has a larger budget for coordination work |

Subagent streaming output is pushed to the frontend via `data-sub-agent-start / delta / chunk / end` events. Each toolCallId corresponds to one independent stream, supporting multiple concurrent subagents streaming simultaneously. State transitions: `output-streaming` → `output-available` | `output-error`.

## Common Misjudgments

- **Don't nest hierarchically**: subagents cannot spawn further subagents. When deeper nesting seems needed, re-decompose so the master Agent invokes multiple subagents in sequence.
- **Don't pick the wrong type**: for page interaction choose browser; to merely read a static page use WebFetch (the master Agent can call it directly); for OCR choose extractor; for precise DOM manipulation choose browser.
- **Don't re-`Agent` when one already exists**: use `SendMessage` to append instructions and reuse the existing context.
- **Don't delegate simple tasks**: a single read, a single query, a single create — the master Agent doing it itself is far faster than delegating.
