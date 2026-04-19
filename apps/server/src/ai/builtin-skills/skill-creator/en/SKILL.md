---
name: skill-creator-skill
description: >
  Triggers when the user wants to create, edit, improve, or debug an OpenLoaf custom Skill. Typical phrasings: "help me create a skill", "build a new skill", "turn what we just did into a skill", "write a skill that auto-XX", "tweak this skill", "why isn't this skill triggering", "edit my custom skill", "add a global skill", "add a skill to the current project". Any create / modify / tune request touching a `SKILL.md` under `.openloaf/skills/` should load this skill. Also applies when the user wants to understand the skill format, troubleshoot triggering issues, or solidify a conversation workflow into a reusable capability. Not for: modifying built-in skills (e.g. file-ops, email-ops) — those are read-only capabilities shipped with the platform.
---

# Skill Creation and Optimization Guide

This skill guides you in creating, editing, and improving custom Skills for OpenLoaf. A Skill is a chunk of Markdown instructions that gets auto-loaded into the conversation when the user's request matches its `description`, letting the AI perform tasks following the method inside.

## Tool Inventory

| Tool | Responsibility | Read-only |
|------|---------------|-----------|
| `Read` / `Glob` / `Grep` | Read existing skills and locate anchors (always-available tools) | Yes |
| `Write` | Create new `SKILL.md` / `openloaf.json` / helper scripts (always-available tools) | No |
| `Edit` | Modify existing skill content (always-available tools) | No |

> **Loading**: All core tools, always available, no `ToolSearch` activation needed. This skill has no dedicated deferred tools — it's an instructional skill that teaches the AI how to organize custom skill files.

## Scope: Global Skill vs Project Skill

User-defined skills come in two scopes. **Figure out where it belongs before doing anything.** Priority from low to high: `builtin < global < project`; project skills override global skills of the same name.

### Global Skill

- **Path**: `~/.openloaf/skills/<skill-name>/SKILL.md`
- **Visibility**: All conversations across all projects
- **Fit for**: Capabilities that generalize across projects / personal work habits / generic document generation / default output styles
- **Typical examples**: "My fixed daily report template", "Run lint before committing code", "My translation glossary"

### Project Skill

- **Path**: `{projectRoot}/.openloaf/skills/<skill-name>/SKILL.md`
- **Visibility**: Only conversations inside the current project
- **Fit for**: Project-specific knowledge / code conventions / business processes / workflows that only make sense in this repo
- **Typical examples**: "This repo's module conventions", "This project's API auth flow", "How to run E2E tests"

### How to Choose

```
Does the capability only make sense in the current project (file paths, business terms, repo conventions)?
  └─ Yes → Project skill (default first choice)
  └─ No  → Reusable across projects (personal habits, generic templates)?
        └─ Yes → Global skill
        └─ Unsure → Start with a project skill; promote to global later if multiple projects need it
```

**Iron rule**: Project-specific business knowledge **does not** belong in global skills — it pollutes other projects. Conversely, stuffing a generic capability into a project skill misses the reuse opportunity. **When uncertain, ask the user**: "Is this capability only useful in this project, or do you want it in your other projects too?"

## Step 1: Understand the Requirements

Before touching files, nail down four things (the conversation context may already contain the answers — don't ask again):

1. **What should the AI do with this skill?** — Core capability description
2. **Under what circumstances should it trigger?** — How the user will phrase it, in what scenarios
3. **What's the expected output?** — Files, data, an operation result, or a conversation reply
4. **Is it global or project scope?** — Use the decision tree above

If the user says "turn what we just did into a skill", review the conversation history to extract the actual tool sequence used, the decision logic, and places where the user corrected you — that's the knowledge the skill truly needs to capture.

## Step 2: Write SKILL.md

Every skill is a folder, and the one essential file is `SKILL.md`.

### File Structure

```
<skill-name>/
├── SKILL.md          # Required — skill instructions (YAML frontmatter + Markdown body)
├── openloaf.json     # Optional — UI metadata (icon, color, display name)
└── scripts/          # Optional — helper scripts (python/bash, etc.)
```

### SKILL.md Format

```markdown
---
name: my-skill-name        # kebab-case, matches folder name
description: >             # Decides when the AI loads this skill — getting this line right is critical
  Triggers when the user... Typical phrasings: "...". Not for: ...
---

# Skill Title

Body content...
```

### Key Points for Writing `description`

`description` is the **only gate** for skill triggering; triggering accuracy almost entirely rides on it:

- **Explain both "what it does" and "when to use it"** — neither can be missing
- **List typical phrasings**, quoting what the user might actually say — the AI directly compares against these examples when deciding whether to trigger
- **Lean aggressive, err wide rather than narrow** — a missed trigger hurts far more than an occasional extra trigger. Instead of "how to generate daily reports", write "triggers when the user mentions daily reports, weekly reports, work summaries, time logs, or wants to turn today's work into any form of report"
- **Use 'not for' to draw boundaries** — avoid mis-triggering. Example: "Not for: Office documents (→ docx/xlsx/pptx-skill)"
- **Include synonyms and colloquial expressions** — users don't always use standard terms; cover "gimme one", "whip up a", "cook up a" and similar casual phrasings

### Key Points for the Body

- **Tell the AI why**, don't pile up MUST/NEVER — use causal explanations instead of mandatory commands, so the model can reason about edge cases
- **Use decision trees** instead of long prose — the `├─ Yes → ...` format expresses branching logic clearly
- **Give concrete examples** — JSON parameters, command invocations, conversation snippets are ten times more useful than abstract descriptions
- **Keep it lean** — ideal length < 500 lines; split into `scripts/` or use layered references when it grows too long
- **Use imperative voice** — write "use Write to create the file" rather than "you should use Write"

### Recommended Body Structure

```markdown
# Skill Title

One paragraph overview of what this skill covers.

## Triggering Conditions
List which user phrasings / scenarios should trigger this skill.

## Workflow
Describe step by step what the AI should do. Use numbered steps + decision trees.

## Tool Usage
List the tools this skill depends on and the key usage points.

## Examples
1–2 end-to-end complete examples.

## Common Pitfalls
Easy mistakes and things to watch out for.

## Iron Rules
3–5 inviolable core rules.
```

## Step 3: Create openloaf.json (Optional but Recommended)

`openloaf.json` provides UI display info and sits alongside `SKILL.md`:

```json
{
  "name": "Display Name",
  "description": "One-line description",
  "icon": "🔧",
  "version": "0.1.0",
  "sourceLanguage": "zh-CN",
  "targetLanguage": "zh-CN",
  "colorIndex": 0
}
```

**colorIndex palette**: 0=cyan 1=purple 2=amber 3=sky 4=rose 5=emerald 6=indigo 7=lime

**icon**: Pick the emoji that best represents the skill's function.

## Step 4: Save to Disk

Use the `Write` tool to write the file. Paths strictly differ by scope:

| Scope | Write path |
|-------|-----------|
| Global skill | `~/.openloaf/skills/<skill-name>/SKILL.md` |
| Project skill | `{projectRoot}/.openloaf/skills/<skill-name>/SKILL.md` |

**Check for name conflicts before creating** to avoid accidental overwrites:

```
Glob: ~/.openloaf/skills/<skill-name>/SKILL.md               # Check global
Glob: {projectRoot}/.openloaf/skills/<skill-name>/SKILL.md   # Check project
```

On conflict, ask the user: overwrite / rename / cancel.

**Always tell the user after creation**: the skill list is loaded at conversation init, so the new skill is **not visible** in the current conversation — they need to open a new conversation for it to take effect.

## Step 5: Verify and Iterate

Once the skill is created, suggest the user test it:

1. Open a new conversation
2. Use a triggering phrasing to get the AI to load the skill (watch for the skill-loaded notice)
3. Check whether the AI follows the skill's instructions
4. If something's off, come back and edit SKILL.md, then open a new conversation and retry

### Common Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Skill doesn't trigger | `description` too narrow | Add more typical phrasings, cover colloquial and synonym forms |
| Skill mis-triggers | `description` too broad | Add "not for" qualifiers, draw boundaries with other skills |
| AI doesn't follow instructions | Body too long or too vague | Shorten, add decision trees, add concrete examples |
| Tool calls error out | Tool usage not explained | Add parameter examples and call ordering |
| Picked up by other projects | Mistakenly placed in global | Move to project scope (`{projectRoot}/.openloaf/skills/`) |

## Improving an Existing Skill

When the user asks to improve an existing skill:

1. `Read` the current SKILL.md to understand what's there
2. Confirm the direction with the user (triggering accuracy / output quality / coverage)
3. **Only change the problem areas** — don't rewrite the whole file — keep the parts the user has already validated stable
4. After saving, have the user open a new conversation to verify

**`description` optimization specialty**: If the user reports "it didn't trigger when it should have", focus on refining the `description`:

- Ask the user "what exactly did you say at the time?" and add that wording to the typical phrasings
- Supplement synonyms, colloquial expressions, Chinese/English variants
- Check whether the "not for" clause was written too aggressively and excluded legitimate cases

## Iron Rules

1. **Ask first, act second** — what to do / when to trigger / what to output / global or project: four questions answered before any file is written
2. **Don't pick the wrong scope** — project-specific business knowledge doesn't go global; generic capabilities shouldn't be buried in a single project
3. **`description` errs wide, not narrow** — a missed trigger hurts far more than an occasional extra trigger
4. **Body explains why, not piles up commands** — causal explanation beats MUST/NEVER
5. **`Glob` for conflicts before creating, prompt the user to test in a new conversation after** — the skill list is loaded at conversation init
