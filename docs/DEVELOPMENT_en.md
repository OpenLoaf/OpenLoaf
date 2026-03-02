# Development Guide

OpenLoaf development conventions. For core developers and external contributors.

<a href="./DEVELOPMENT.md">简体中文</a> | <strong>English</strong>

## Commit Conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/), enforced automatically by [commitlint](https://commitlint.js.org/).

### Format

```
<type>(<scope>): <subject>
```

### Type

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Refactoring (no behavior change) |
| `perf` | Performance improvement |
| `chore` | Build, tooling, dependency changes |
| `docs` | Documentation only |
| `style` | Formatting (no logic change) |
| `test` | Adding or updating tests |
| `ci` | CI/CD configuration changes |
| `revert` | Revert a commit |

### Scope

| Scope | Description |
|-------|-------------|
| `server` | Hono backend |
| `web` | Next.js frontend |
| `desktop` | Electron desktop app |
| `db` | Database schema / Prisma |
| `api` | tRPC router types shared package |
| `ui` | Component library |
| `config` | Shared config package |
| `i18n` | Internationalization |
| `ai` | AI chat / Agent |
| `email` | Email features |
| `calendar` | Calendar features |
| `board` | Board / canvas features |
| `tasks` | Task management |
| `auth` | Authentication |
| `editor` | Editor |
| `terminal` | Terminal emulator |
| `deps` | Dependency updates |
| `ci` | CI/CD |
| `release` | Release process |

### Subject

- Start with lowercase, no period at the end
- Imperative mood ("add feature" not "added feature")
- Keep it concise, under 100 characters

### Examples

```bash
feat(ai): add streaming response for chat
fix(web): resolve sidebar scroll issue on mobile
refactor(server): extract email service into module
chore(deps): upgrade prisma to v7.4
docs(api): update tRPC router documentation
ci(desktop): add macOS ARM64 build target
```

### Special Tags

- `[skip ci]` — Only for version bump commits, skips CI builds

### Auto Validation

commitlint runs automatically via the husky `commit-msg` hook. Non-compliant commit messages will be rejected.

Scope rules are warning-level (recommended but not blocking), subject length is error-level (over 100 characters will be rejected).

## Branch Strategy

### Main Branch

- `main` — Stable main branch, all releases are based on this branch

### Workflow Modes

**Core Developer (Owner)**: May commit directly to `main`. Small changes across different areas are distinguished by scope.

**Contributor**: Fork → Feature branch → PR to `main`.

### Branch Naming

Use separate branches for large features:

```
feature/<scope>-<description>    # New feature
fix/<scope>-<description>        # Bug fix
refactor/<scope>-<description>   # Refactoring
chore/<description>              # Miscellaneous
```

Examples:
```
feature/ai-streaming-response
fix/web-sidebar-scroll
refactor/server-email-module
chore/upgrade-prisma
```

## Pull Request Workflow

> Enabled for multi-person collaboration. During solo development, committing directly to main is fine.

### Requirements

1. PR title follows commit convention format (`<type>(<scope>): <subject>`)
2. Use the [PR Template](../.github/PULL_REQUEST_TEMPLATE.md) for the description
3. At least 1 approval
4. CI passes (type checking + lint)
5. Use **Squash Merge** to keep history clean

### Code Review Focus

- Code style compliance with Biome config
- Type safety (TypeScript strict mode)
- UI components follow the design system
- Database changes include migration scripts
- Impact on Electron desktop packaging

## Changelog Conventions

For each version release, create `zh.md` (Chinese) and `en.md` (English) files under `apps/{app}/changelogs/{version}/`.

### File Format

```markdown
---
version: x.y.z
date: YYYY-MM-DD
---

## ✨ New Features

- Description

## 🐛 Bug Fixes

- Description
```

### Categories & Emojis

Organize entries by the following categories. **Only include categories that have content** — omit empty ones.

| Emoji | Title | Usage |
|-------|-------|-------|
| ✨ | `## ✨ New Features` | Brand new features and capabilities |
| 🚀 | `## 🚀 Improvements` | Enhancements to existing features |
| 🐛 | `## 🐛 Bug Fixes` | Bug fixes |
| ⚡ | `## ⚡ Performance` | Speed, memory, bundle size improvements |
| 💄 | `## 💄 UI/UX` | Style changes, interaction improvements, animations |
| 🌐 | `## 🌐 Internationalization` | Translations, multi-language support |
| 🔒 | `## 🔒 Security` | Security vulnerability fixes, access control |
| 🔧 | `## 🔧 Refactoring` | Code refactoring (no behavior change) |
| 📦 | `## 📦 Dependencies` | Third-party library upgrades |
| 💥 | `## 💥 Breaking Changes` | Incompatible changes (migration required) |
| 🗑️ | `## 🗑️ Deprecated` | Features to be removed |

### Recommended Category Order

```
💥 Breaking Changes (top priority)
✨ New Features
🚀 Improvements
💄 UI/UX
⚡ Performance
🌐 Internationalization
🐛 Bug Fixes
🔒 Security
🔧 Refactoring
📦 Dependencies
🗑️ Deprecated
```

### Writing Rules

- Start each entry with a verb (Add / Improve / Fix / Refactor)
- Specify the affected module or component
- Keep entries concise — one change per line
- Related minor changes can be grouped under one entry with indented sub-items

### Example

```markdown
---
version: 0.3.0
date: 2026-03-15
---

## ✨ New Features

- Add Claude Code CLI provider support
- Add tool approval mode for per-tool Agent call confirmation
- Add AI Agent behavior testing framework (based on Promptfoo)

## 🚀 Improvements

- Enhance AI Agent capabilities with new icon assets
- Rename task creation tool to task-manage

## 💄 UI/UX

- Refine button color semantics (blue=primary, amber=in-progress, purple=approval)
- Update Chinese placeholder text in ChatInputBox

## 🐛 Bug Fixes

- Fix PDF viewer react-pdf import paths
- Fix type errors in test files, UI file picker callbacks, and model source types
```

## Release Process

See the version management Skill documentation:
- [Publish Release](../.agents/skills/update-version-management/publish-release.md)
- [Update System](../.agents/skills/update-version-management/update-system.md)

## Development Environment Setup

```bash
# 1. Clone the repository
git clone https://github.com/aspect-apps/OpenLoaf.git
cd OpenLoaf

# 2. Install dependencies
pnpm install

# 3. Initialize the database
pnpm run db:generate
pnpm run db:push
pnpm run db:seed

# 4. Start development services
pnpm run dev          # Web + Server
pnpm run desktop      # Electron desktop app
```

For more commands, see the "Common Commands" section in [CLAUDE.md](../CLAUDE.md).
