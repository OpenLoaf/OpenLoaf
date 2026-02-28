<div align="center">
  <img src="../apps/web/public/logo.png" alt="OpenLoaf Logo" width="120" />
  <h1>OpenLoaf</h1>
  <p><strong>开源 AI 知识库 & 智能工作台</strong></p>
  <p>结构化文档管理 + 多模型 AI 对话 + 跨平台桌面体验，打造你的第二大脑。</p>

  <a href="https://github.com/OpenLoaf/OpenLoaf/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPLv3-blue.svg" alt="License" /></a>
  <a href="https://github.com/OpenLoaf/OpenLoaf/releases"><img src="https://img.shields.io/github/v/release/OpenLoaf/OpenLoaf?label=latest" alt="Release" /></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-brightgreen" alt="Platform" />

  <br />
  <a href="../README.md">English</a> | <strong>简体中文</strong>
</div>

---

## 关于

OpenLoaf 是一款现代化的全栈 AI 知识库与智能工作台应用。它将类似 **Notion** 的层级文档管理能力，与类似 **ChatGPT/Claude** 的深度 AI 对话体验融合在一起，致力于打造一个"不仅能聊天，更能沉淀知识"的第二大脑。

> **为什么叫 OpenLoaf？** Logo 是一个面包形状的沙发 —— Loaf 既有"面包"的意思，也有"懒散地躺着"的含义。我们希望你在使用 OpenLoaf 时，就像窝在沙发上一样舒适惬意。

<div align="center">
  <img src="./screenshots/overview.png" alt="OpenLoaf 总览" width="800" />
  <br />
  <sub>工作台：时钟、日历、任务看板、快捷操作一览无余</sub>
</div>

---

## 功能展示

### AI 智能代理 (Agent)

不只是聊天机器人 —— OpenLoaf 的 AI 能**真正动手做事**。内置文档助手、终端助手、浏览器助手、邮件助手、日历助手等多个系统代理，AI 可以理解你的意图后自动拆解任务、调用工具链、跨代理协作，独立完成多步骤工作流。你只需下达一个指令，剩下的交给 AI。

<div align="center">
  <img src="./screenshots/ai-agent.png" alt="AI 智能代理" width="800" />
  <br />
  <sub>AI 自动调用终端助手执行文件整理，完成后汇报结果</sub>
</div>

### AI 智能对话

内置多模型 AI 对话，支持 **OpenAI**、**Anthropic Claude**、**Google Gemini**、**DeepSeek**、**Qwen**、**xAI Grok** 以及通过 **Ollama** 接入的本地模型。AI 能感知你当前项目的完整上下文 —— 文件结构、文档内容、对话历史 —— 真正做到"懂你的项目"。支持附件上传、联网搜索、自定义系统提示词，还能一键切换不同模型对比回答质量。

### 无限画板 (Board)

基于 ReactFlow 的无限画板，不只是白板 —— 它是你的**视觉思维空间**。支持自由拖拽布局、便签、图片/视频节点、手绘画笔、AI 图片生成（文生图）、AI 视频生成、图片内容理解等。思维导图、流程图、灵感墙，都可以在一张画布上自由组合。

<div align="center">
  <img src="./screenshots/board.png" alt="无限画板" width="800" />
  <br />
  <sub>画板集成 AI 生图、视频生成、手绘、便签等创意工具</sub>
</div>

### 富文本编辑器

基于 [Plate.js](https://platejs.org/) 构建的强大块状编辑器。支持标题、列表、引用、代码块、LaTeX 公式、表格、多媒体嵌入、双向链接等丰富块类型。所见即所得的编辑体验，搭配丰富的工具栏和快捷键，让写作和文档整理如行云流水。通过无限层级的页面结构，自由组织笔记、项目文档和研究资料。

### 看板任务管理

类似 Trello 的看板视图，通过**待办 → 进行中 → 审批 → 已完成**四列管理任务生命周期。支持拖拽排序、优先级标签（紧急/高/中/低）、触发方式（手动/定时/条件触发）、到期时间提醒。AI 可自动创建任务并提交审批，你只需一键通过或返工，让 AI 替你打工。

### 内置终端

完整的终端模拟器，深度集成在应用内，无需切换窗口即可执行 shell 命令。AI 代理可以直接操作终端 —— 创建目录、移动文件、运行脚本、查看日志 —— 你下达自然语言指令，AI 自动转化为命令并执行，执行前还会征求你的确认。

### 邮件客户端

集成邮件收发与管理，支持多账户配置、IMAP 邮件同步、富文本撰写与回复。AI 可以辅助撰写邮件、总结长邮件内容、提取关键信息。收发邮件不用离开 OpenLoaf，工作流程更加连贯。

### 智能日历

日程管理与**系统原生日历同步**（macOS Calendar / Google Calendar）。支持日/周/月多种视图切换、AI 自动规划日程、智能提醒。在工作台小组件中也能直接预览近期日程，随时掌握时间安排。

### 文件管理器

内置文件浏览器，支持网格/列表/分栏三种视图、拖拽上传下载、文件预览（图片、PDF、Office 文档、代码）、目录管理。与编辑器和 AI 深度集成 —— 双击打开文稿直接编辑，AI 可以读取和操作你的项目文件。

### 桌面小组件

可定制的工作台小组件系统：实时时钟、月历、任务看板摘要、快捷操作入口（搜索、终端、AI 对话）、Agent 设置、技能配置等。一眼掌握全局状态，快速进入任何功能模块。

---

## 快速开始

### 前提条件

- **Node.js** >= 20
- **pnpm** >= 10（`corepack enable` 即可）

### 安装与运行

```bash
# 克隆仓库
git clone https://github.com/OpenLoaf/OpenLoaf.git
cd OpenLoaf

# 安装依赖
pnpm install

# 初始化数据库
pnpm run db:push

# 启动开发环境（Web + Server）
pnpm run dev
```

打开浏览器访问 [http://localhost:3001](http://localhost:3001)。启动桌面应用：`pnpm run desktop`。

## 技术栈

Next.js 16 / React 19 / Electron 40 / Hono + tRPC / Prisma + SQLite / Plate.js / Vercel AI SDK / Yjs / ReactFlow / Turborepo + pnpm

## 参与贡献

我们非常欢迎社区贡献！请阅读以下指南：

1. **Fork** 本仓库
2. 创建你的特性分支：`git checkout -b feature/my-feature`
3. 提交更改：`git commit -m 'feat: add my feature'`
4. 推送到远程：`git push origin feature/my-feature`
5. 发起 **Pull Request**

> 提交 PR 前请务必阅读 [贡献指南](./.github/CONTRIBUTING.md) 并签署 [CLA（贡献者许可协议）](./.github/CLA.md)。

## 许可证

OpenLoaf 采用双重许可模式：

- **开源版** — [GNU AGPLv3](./LICENSE)：自由使用、修改、分发，但需保持同一许可证开源。
- **商业版** — 如需闭源商用或免除 AGPL 限制，请联系我们获取商业许可。

---

<div align="center">
  <a href="https://github.com/OpenLoaf/OpenLoaf/issues">Bug 反馈 & 功能建议</a>
  <br /><br />
  <sub>OpenLoaf — 重新定义你的 AI 协作空间。</sub>
</div>
