<div align="center">
  <img src="../apps/web/public/logo.png" alt="OpenLoaf Logo" width="120" />
  <h1>OpenLoaf</h1>
  <p><strong>Open-Source AI Productivity Desktop - Project-Centric, Multi-Agent, Local-First</strong></p>
  <p>Each project gets its own AI agent team, memory, and skills. Projects link to share knowledge. A Secretary Agent orchestrates everything. Your data never leaves your device.</p>

  <p>AI Secretary &nbsp;|&nbsp; Independent Projects &nbsp;|&nbsp; Project Linking &nbsp;|&nbsp; Multi-Agent &nbsp;|&nbsp; Canvas &nbsp;|&nbsp; Email &nbsp;|&nbsp; Calendar &nbsp;|&nbsp; Tasks</p>

  <blockquote><strong>One app, multiple project windows. Each project has its own AI team. Link projects to share knowledge. A Secretary Agent ties it all together - 100% local.</strong></blockquote>

  <a href="https://github.com/OpenLoaf/OpenLoaf/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPLv3-blue.svg" alt="License" /></a>
  <a href="https://github.com/OpenLoaf/OpenLoaf/releases"><img src="https://img.shields.io/github/v/release/OpenLoaf/OpenLoaf?label=latest" alt="Release" /></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-brightgreen" alt="Platform" />

  <br /><br />
  <a href="https://github.com/OpenLoaf/OpenLoaf/releases/latest">Download for macOS / Windows / Linux</a>
  <br /><br />
  <strong>English</strong> | <a href="./README.md">简体中文</a> | <a href="./README_ja.md">日本語</a>
</div>

---

> **⚠️ This project is in active development. Features and APIs may change - use in production with caution.** Encountered a bug or have an idea? Submit feedback via the app's built-in feedback button.

---

## About

OpenLoaf is a local-first AI productivity desktop app built around **projects as independent workspaces**. Each project opens in its own dedicated window with a full-featured environment: AI assistant, file tree, terminal, task board, and canvas.

A **Secretary Agent** lives in the main window as your personal assistant - it can answer questions, manage your calendar and email, and route complex tasks to the right project's AI agent. For cross-project work, projects **link** to each other to share memory and skills.

### How It Works

```text
You (the Boss)
  |
  v
Secretary Agent (Main Window - your personal assistant)
  |
  |-- Simple tasks -> handles directly
  |-- Single-project tasks -> spawns a Project Agent
  `-- Cross-project tasks -> spawns multiple Project Agents in parallel
        |
        `-- Project Agent (Project Window)
              |
              `-- Worker Agents (explore, plan, code...)
```

**Main Window** - your command center:
- AI Secretary for global tasks (calendar, email, cross-project queries)
- Activity timeline showing recent projects, conversations, and canvases
- Project grid to browse and open projects

**Project Window** - each project gets its own:
- Dedicated AI assistant with project-specific memory and skills
- File explorer, terminal, task board, canvas
- Links to other projects (their memory and skills are auto-injected)

<div align="center">
  <img src="./screenshots/overview.png" alt="OpenLoaf Overview" width="800" />
</div>

---

## Features

### Multi-Agent Architecture

OpenLoaf's AI isn't a single chatbot - it's a **layered agent system** modeled after how companies work:

| Agent | Role | Scope |
|-------|------|-------|
| **Secretary** | Your personal assistant in the main window | Global: calendar, email, project routing, cross-project queries |
| **Project Agent** | Dedicated assistant per project | Project: files, code, docs, terminal, tasks |
| **Worker Agents** | Specialized sub-agents spawned on demand | Focused: explore, plan, code, review |

The Secretary decides the most efficient path - simple questions get answered immediately, project-specific tasks get routed to the right Project Agent, and complex multi-project tasks spawn parallel agents.

### Independent Project Windows

Each project opens in its own window (Electron) or browser tab (web). No context switching - work on multiple projects simultaneously with full isolation.

Projects are organized by **user-defined type labels** (for example, "code", "docs", "knowledge base"), which serve as visual groupings in the project grid. Types are just labels - the system treats all projects equally.

### Project Linking

Any project can link to any other project. When linked:
- The linked project's **memory** is injected into the current project's AI context
- The linked project's **skills** become available to the current project's agent
- Perfect for sharing a knowledge base, design system docs, or coding standards across multiple projects

### Memory & Skills System

Three-level memory hierarchy:

| Level | Path | Purpose |
|-------|------|---------|
| **User** | `~/.openloaf/memory/` | Personal preferences, habits, global context |
| **Project** | `<projectPath>/.openloaf/memory/` | Project-specific architecture decisions, conventions |
| **Linked Projects** | Auto-loaded from linked projects | Shared knowledge (for example, coding standards, API docs) |

Skills follow the same pattern - global skills plus project-specific skills, all discoverable by AI agents at runtime.

Skills are reusable Markdown workflows defined by a `SKILL.md` file. Put them in `~/.agents/skills/` for global reuse or in `<projectPath>/.agents/skills/` for project-specific behavior, and agents can load the instructions plus related tool dependencies on demand.

OpenLoaf also supports **MCP (Model Context Protocol)** servers. You can connect external tools over `stdio`, `http`, or `sse`, configure them globally in `~/.openloaf/mcp-servers.json` or per project in `<projectPath>/.openloaf/mcp-servers.json`, and import JSON configs from clients like Claude Desktop, Cursor, VS Code, Cline, or Windsurf to expose GitHub, databases, filesystems, Slack, and more to your agents.

### AI Chat

Multi-model AI chat supporting **OpenAI**, **Anthropic Claude**, **Google Gemini**, **DeepSeek**, **Qwen**, **xAI Grok**, and local models via **Ollama**. AI is aware of your project's full context - file structure, document content, conversation history. Built-in memory lets AI retain knowledge across conversations.

<div align="center">
  <img src="./screenshots/ai-agent.png" alt="AI Agents" width="800" />
</div>

### Infinite Canvas

A ReactFlow-based infinite canvas for visual thinking. Supports sticky notes, images, videos, freehand drawing, AI image generation, AI video generation, and image content understanding. Mind maps, flowcharts, and inspiration boards on a single canvas.

<div align="center">
  <img src="./screenshots/board.png" alt="Infinite Canvas" width="800" />
</div>

### Built-in Productivity Tools

Everything in one app - no more window-switching:

- **Terminal** - Full terminal emulator. AI agents can run commands with your approval.
- **Email** - Multi-account IMAP email with AI-powered drafting and summarization.
- **Calendar** - Native system calendar sync (macOS / Google Calendar). AI-powered scheduling.
- **File Manager** - Grid/list/column views, drag-and-drop, file preview (images, PDFs, Office, code).
- **Task Board** - Kanban board (To Do -> In Progress -> Review -> Done) with priority labels and AI-powered task creation.
- **Rich Text Editor** - Block editor built on [Plate.js](https://platejs.org/) with LaTeX, tables, code blocks, and bi-directional links.

---

## Use Cases

- **Software Development** - Each repo is a project. Link a shared "coding standards" project for consistent AI behavior across all repos.
- **Research & Writing** - Create a "references" project as a knowledge base, link it to your paper projects. AI draws from your curated sources.
- **Content Creation** - Brainstorm on the canvas, generate images with AI, write in the editor, track deliverables on the task board.
- **Project Management** - One project per client. Secretary Agent gives you a cross-project overview. Calendar and email keep everything coordinated.
- **Personal Knowledge Base** - Accumulate notes, web clippings, and journal entries. Link to work projects so AI connects the dots.

---

## Why OpenLoaf

### The Problem

- **Fragmented AI workflows** - One thing done requires jumping between five windows.
- **No project context** - AI forgets everything between conversations. You re-explain your project every time.
- **Single-project silos** - Projects can't share knowledge. Your coding standards project can't help your code repos.
- **Cloud lock-in** - Your data lives on someone else's servers. You can't choose your own AI models.

### OpenLoaf's Approach

- **Project-centric** - Each project is a self-contained environment with its own AI agent, memory, and skills.
- **Linked knowledge** - Projects share context through explicit links. A knowledge base enriches every project it's linked to.
- **Multi-agent routing** - The Secretary Agent handles the orchestration. Simple tasks are fast; complex tasks get the right specialist.
- **Local-first** - All data stored locally (`~/.openloaf/`). Bring your own API keys. No telemetry, no tracking.
- **Ready out of the box** - Download, install, go. No servers, databases, or Docker.

### Loaf = Bread + Lounging

OpenLoaf's logo is a bread-shaped sofa. **Loaf** means both "bread" and "to lounge around" - hand off tedious work to AI while you make the important decisions.

---

## Privacy & Security

- **100% Local Storage** - All data stored on your filesystem (`~/.openloaf/`). Nothing uploaded to cloud servers.
- **Bring Your Own Key (BYOK)** - Configure your own AI API keys. API calls go directly from your device to the model provider.
- **Works Offline** - Core features work fully offline. Use Ollama for a completely air-gapped AI experience.
- **No Telemetry** - No analytics, no usage data, no tracking. What happens on your device stays on your device.
- **Open-Source & Auditable** - Full codebase under AGPLv3. Inspect every line that touches your data.

---

## Quick Start

### Prerequisites

- **Node.js** >= 20
- **pnpm** >= 10 (`corepack enable`)

### Installation

```bash
# Clone the repository
git clone https://github.com/OpenLoaf/OpenLoaf.git
cd OpenLoaf

# Install dependencies
pnpm install

# Initialize the database
pnpm run db:migrate

# Start the development environment (Web + Server)
pnpm run dev
```

Open [http://localhost:3001](http://localhost:3001). For the desktop app: `pnpm run desktop`.

---

## Architecture

```text
+----------------------------------------------------+
|                    OpenLoaf                        |
|                                                    |
|  Main Window                                       |
|  |-- Secretary Agent (global AI assistant)         |
|  |-- Activity Timeline (recent history)            |
|  |-- Project Grid (all projects by type)           |
|  |-- Calendar, Email, Canvas (global features)     |
|  `-- Settings                                      |
|                                                    |
|  Project Window (one per project)                  |
|  |-- Project Agent (project-scoped AI)             |
|  |-- File Tree, Terminal, Search                   |
|  |-- Task Board, Canvas                            |
|  |-- Linked Projects (shared memory/skills)        |
|  `-- Project Settings & Skills                     |
|                                                    |
|  Data Layer                                        |
|  |-- ~/.openloaf/memory/          (user memory)    |
|  |-- ~/.openloaf/config.json      (project registry)|
|  |-- ~/.openloaf/openloaf.db      (SQLite database)|
|  |-- <project>/.openloaf/memory/  (project memory) |
|  `-- <project>/.agents/skills/    (project skills) |
+----------------------------------------------------+
```

### Project Structure

```text
apps/
  web/          - Next.js 16 frontend (static export, React 19)
  server/       - Hono backend, tRPC API
  desktop/      - Electron 40 desktop shell
packages/
  api/          - tRPC router types & shared API logic
  db/           - Prisma 7 database schema (SQLite)
  ui/           - shadcn/ui component library
  config/       - Shared env utilities & path resolution
```

### Tech Stack

| Area | Technology |
|------|------------|
| Frontend | Next.js 16 / React 19 / Tailwind CSS 4 |
| Backend | Hono + tRPC / Prisma + SQLite |
| Desktop | Electron 40 |
| Editor | Plate.js |
| AI | Vercel AI SDK (OpenAI / Claude / Gemini / DeepSeek / Qwen / Grok / Ollama) |
| Collaboration | Yjs |
| Canvas | ReactFlow |
| Tooling | Turborepo + pnpm monorepo |

---

## Roadmap

- [x] Multi-agent architecture (Secretary -> Project Agent -> Workers)
- [x] Independent project windows
- [x] Project linking with shared memory/skills
- [x] User-defined project types with visual grouping
- [x] Activity timeline in main window
- [ ] Full web browser access (without desktop app)
- [ ] Internationalization (i18n) - in progress
- [ ] Project template marketplace
- [ ] WPS / Microsoft Office integration
- [ ] More features coming...

---

## Contributing

1. **Fork** this repository
2. Create your feature branch: `git checkout -b feature/my-feature`
3. Commit your changes ([Conventional Commits](https://www.conventionalcommits.org/)):
   ```bash
   git commit -m "feat(web): add dark mode toggle"
   ```
4. Push: `git push origin feature/my-feature`
5. Open a **Pull Request**

> Before submitting a PR, please read the [Contributing Guide](../.github/CONTRIBUTING.md) and [Development Guide](./DEVELOPMENT_en.md), and sign the [CLA](../.github/CLA.md).

---

## License

OpenLoaf uses dual licensing:

- **Open Source** - [GNU AGPLv3](../LICENSE): Free to use, modify, and distribute. Derivative works must remain open-source.
- **Commercial** - For closed-source commercial use, contact us for a commercial license.

---

<div align="center">
  <a href="https://github.com/OpenLoaf/OpenLoaf/issues">Bug Reports & Feature Requests</a>
  <br /><br />
  <sub>OpenLoaf - Your AI, your projects, your data, your device.</sub>
</div>
