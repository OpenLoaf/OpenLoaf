<div align="center">
  <img src="apps/web/public/logo.png" alt="OpenLoaf Logo" width="120" />
  <h1>OpenLoaf</h1>
  <p><strong>Open-Source AI Knowledge Base & Smart Workspace</strong></p>
  <p>Structured document management + multi-model AI chat + cross-platform desktop experience — build your second brain.</p>

  <a href="https://github.com/OpenLoaf/OpenLoaf/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPLv3-blue.svg" alt="License" /></a>
  <a href="https://github.com/OpenLoaf/OpenLoaf/releases"><img src="https://img.shields.io/github/v/release/OpenLoaf/OpenLoaf?label=latest" alt="Release" /></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-brightgreen" alt="Platform" />

  <br />
  <strong>English</strong> | <a href="docs/README_zh.md">简体中文</a>
</div>

---

## About

OpenLoaf is a modern, full-stack AI knowledge base and smart workspace application. It combines **Notion**-style hierarchical document management with **ChatGPT/Claude**-level AI conversation, creating a second brain that doesn't just chat — it retains knowledge.

> **Why "OpenLoaf"?** The logo is a bread-shaped sofa — "Loaf" means both a loaf of bread and lounging around. We want using OpenLoaf to feel as cozy as sinking into a sofa.

<div align="center">
  <img src="docs/screenshots/overview.png" alt="OpenLoaf Overview" width="800" />
  <br />
  <sub>Workspace: clock, calendar, task board, and quick actions at a glance</sub>
</div>

---

## Features

### AI Agents

More than a chatbot — OpenLoaf's AI can **actually get things done**. Built-in system agents include a Document Assistant, Terminal Assistant, Browser Assistant, Email Assistant, Calendar Assistant, and more. The AI understands your intent, breaks down tasks, chains tools together, and collaborates across agents to complete multi-step workflows autonomously. Just give the command — AI handles the rest.

<div align="center">
  <img src="docs/screenshots/ai-agent.png" alt="AI Agent" width="800" />
  <br />
  <sub>AI automatically invokes the Terminal Assistant to organize files, then reports back</sub>
</div>

### AI Chat

Built-in multi-model AI chat supporting **OpenAI**, **Anthropic Claude**, **Google Gemini**, **DeepSeek**, **Qwen**, **xAI Grok**, and local models via **Ollama**. The AI is aware of your full project context — file structure, document content, conversation history — truly understanding your project. Supports file attachments, web search, custom system prompts, and one-click model switching to compare answer quality.

### Infinite Canvas (Board)

A ReactFlow-powered infinite canvas — not just a whiteboard, but your **visual thinking space**. Supports free-form drag-and-drop layouts, sticky notes, image/video nodes, freehand drawing, AI image generation (text-to-image), AI video generation, and image content understanding. Mind maps, flowcharts, and inspiration walls can all coexist on a single canvas.

<div align="center">
  <img src="docs/screenshots/board.png" alt="Infinite Canvas" width="800" />
  <br />
  <sub>Canvas with AI image generation, video creation, freehand drawing, and sticky notes</sub>
</div>

### Rich Text Editor

A powerful block-based editor built on [Plate.js](https://platejs.org/). Supports headings, lists, blockquotes, code blocks, LaTeX formulas, tables, media embeds, bi-directional links, and more. A WYSIWYG editing experience with a rich toolbar and keyboard shortcuts makes writing and organizing documents effortless. Freely structure your notes, project docs, and research materials through infinitely nested pages.

### Kanban Task Management

A Trello-style board view managing the full task lifecycle through **To Do → In Progress → Review → Done** columns. Supports drag-and-drop sorting, priority labels (Urgent / High / Medium / Low), trigger modes (manual / scheduled / conditional), and due date reminders. AI can automatically create tasks and submit them for review — just approve or send back with one click, and let AI do the work for you.

### Built-in Terminal

A full terminal emulator deeply integrated into the app — run shell commands without switching windows. AI agents can operate the terminal directly — creating directories, moving files, running scripts, checking logs — you give natural language instructions, and AI translates them into commands and executes them, always asking for your confirmation first.

### Email Client

Integrated email management with multi-account support, IMAP sync, and rich-text composing and replying. AI can help draft emails, summarize long threads, and extract key information. Send and receive emails without leaving OpenLoaf for a seamless workflow.

### Smart Calendar

Schedule management with **native system calendar sync** (macOS Calendar / Google Calendar). Supports day / week / month view switching, AI-powered schedule planning, and smart reminders. Preview upcoming events directly from the workspace widget to stay on top of your schedule.

### File Manager

A built-in file browser with grid / list / column views, drag-and-drop upload and download, file preview (images, PDFs, Office documents, code), and directory management. Deeply integrated with the editor and AI — double-click to open and edit documents directly, and AI can read and operate on your project files.

### Workspace Widgets

A customizable widget system for your workspace: real-time clock, monthly calendar, task board summary, quick action shortcuts (search, terminal, AI chat), agent settings, skill configuration, and more. See your global status at a glance and jump into any module instantly.

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
pnpm run db:push

# Start the development environment (Web + Server)
pnpm run dev
```

Open your browser at [http://localhost:3001](http://localhost:3001). To launch the desktop app: `pnpm run desktop`.

## Tech Stack

Next.js 16 / React 19 / Electron 40 / Hono + tRPC / Prisma + SQLite / Plate.js / Vercel AI SDK / Yjs / ReactFlow / Turborepo + pnpm

## Contributing

We warmly welcome community contributions! Here's how:

1. **Fork** this repository
2. Create your feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'feat: add my feature'`
4. Push to remote: `git push origin feature/my-feature`
5. Open a **Pull Request**

> Before submitting a PR, please read the [Contributing Guide](./.github/CONTRIBUTING.md) and sign the [CLA (Contributor License Agreement)](./.github/CLA.md).

## License

OpenLoaf is dual-licensed:

- **Open Source** — [GNU AGPLv3](./LICENSE): Free to use, modify, and distribute, provided you keep the same license for derivative works.
- **Commercial** — For closed-source commercial use or to waive AGPL requirements, contact us for a commercial license.

---

<div align="center">
  <a href="https://github.com/OpenLoaf/OpenLoaf/issues">Bug Reports & Feature Requests</a>
  <br /><br />
  <sub>OpenLoaf — Redefine your AI collaboration space.</sub>
</div>
