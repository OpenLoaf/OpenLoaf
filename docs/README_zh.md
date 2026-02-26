# OpenLoaf

> **OpenLoaf** 是一款现代化的、全栈式的 AI 知识库与智能对话应用。它将类似 **Notion** 的层级文档管理、多维视图能力，与类似 **ChatGPT/Claude** 的深度 AI 对话体验完美融合，致力于打造一个“不仅能聊天，更能沉淀知识”的第二大脑。

---

## 🌟 核心愿景

目前市面上的 AI 工具往往在“即时聊天”和“长效记录”之间存在断层。OpenLoaf 的出现正是为了填补这一空白：
- **像 Notion 一样组织**：通过无限层级的页面、块状编辑器（Block-based）来结构化你的思维。
- **像 OpenClaw 一样对话**：内置强大的多模型支持与智能代理（Agent）系统，能够理解你的整个项目上下文。
- **原生桌面体验**：基于 Tauri 打造，提供毫秒级的响应速度、全局快捷键、系统级集成（日历/提醒/搜索）以及离线数据安全性。

---

## ✨ 核心特性

### 1. 结构化知识管理 (Notion-like)
- **块状编辑器**：基于 Plate.js 构建，支持文本、表格、代码块、数学公式（LaTeX）、多媒体等多种块类型。
- **无限层级页面**：自由组织你的笔记、项目文档和研究资料，支持页面间的双向链接。
- **多维视图**：支持看板、日历等视图管理任务与日程，让知识流动起来。

### 2. 深度 AI 智能助手 (Agentic Chat)
- **多模型驱动**：支持接入 OpenAI, Anthropic, Google Gemini 以及本地大模型（通过 Ollama 等）。
- **项目级上下文**：AI 不再只盯着当前的一行字，它能感知你整个项目、文件夹乃至整个知识库的内容。
- **智能代理 (Sub-Agents)**：内置 8 大系统代理（文档、终端、浏览器、邮件、日历等），具备自动拆解任务并调用工具的能力。

### 3. 全能桌面工作台 (Powerful Desktop GUI)
- **跨平台支持**：支持 macOS、Windows 和 Linux，原生系统集成。
- **智能日历与提醒**：深度集成的日历系统，支持日程同步与 AI 自动规划。
- **动态小组件 (Widgets)**：支持在桌面或应用内添加动态小组件，实时监控任务状态。
- **离线优先**：本地 SQLite 数据库存储，确保数据隐私与离线可用性。

---

## 🛠️ 技术架构

OpenLoaf 采用了最前沿的 **Better-T-Stack** 单体仓库（Monorepo）架构：

- **前端 (`apps/web`)**: Next.js 15, React 19, Tailwind CSS v4, shadcn/ui。
- **桌面端**: Tauri v2 (Rust 驱动)。
- **后端 (`apps/server`)**: Hono (轻量级、高性能), tRPC (端到端类型安全 API)。
- **数据库 (`packages/db`)**: Prisma ORM, SQLite (本地存储)。
- **编辑器核心**: Plate.js (丰富的扩展性)。

---

## 🚀 快速开始

### 前提条件
- **Node.js**: v20+
- **pnpm**: 最新版本
- **Rust**: (仅当你需要从源码构建桌面端时需要)

### 安装与运行
1. **克隆仓库**
   ```bash
   git clone https://github.com/OpenLoaf/OpenLoaf.git
   cd OpenLoaf
   ```

2. **安装依赖**
   ```bash
   pnpm install
   ```

3. **初始化数据库**
   ```bash
   pnpm --filter apps/server db:push
   ```

4. **启动开发环境**
   - **Web 版**: `pnpm dev:web` (访问 http://localhost:3001)
   - **桌面版 (开发模式)**: `cd apps/web && pnpm desktop:dev`

---

## 📜 许可证与贡献

### 双重授权模式 (Dual-License)
- **开源版**: 本项目遵循 **GNU AGPLv3** 协议开源。
- **商业版**: 如需闭源商用或免除 AGPL 限制，请联系我们获取商业许可证。

### 参与贡献
我们非常欢迎社区的贡献！在提交 Pull Request 之前，请务必阅读我们的 [贡献指南](./.github/CONTRIBUTING.md) 并签署 [CLA (贡献者许可协议)](./.github/CLA.md)。

---

## 📬 联系与支持
- **GitHub Issues**: 提交 Bug 或功能建议。
- **官方网站**: [coming soon]
- **联系邮箱**: [your-email@example.com]

---
*OpenLoaf - 重新定义你的 AI 协作空间。*
