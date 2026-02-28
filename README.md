<div align="center">
  <img src="apps/web/public/logo.png" alt="OpenLoaf Logo" width="120" />
  <h1>OpenLoaf</h1>
  <p><strong>开源 AI 知识库 & 智能工作台</strong></p>
  <p>本地优先、隐私至上的 AI 工作台 —— 结构化文档 + 多模型对话 + 跨平台桌面，数据永远留在你的设备上。</p>

  <a href="https://github.com/OpenLoaf/OpenLoaf/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPLv3-blue.svg" alt="License" /></a>
  <a href="https://github.com/OpenLoaf/OpenLoaf/releases"><img src="https://img.shields.io/github/v/release/OpenLoaf/OpenLoaf?label=latest" alt="Release" /></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-brightgreen" alt="Platform" />

  <br /><br />
  <a href="https://github.com/OpenLoaf/OpenLoaf/releases/latest">下载 macOS / Windows / Linux 安装包</a>
  <br /><br />
  <a href="docs/README_en.md">English</a> | <strong>简体中文</strong>
</div>

---

> **⚠️ 注意：本项目仍处于早期研发阶段，功能和 API 可能随时发生变化，请谨慎用于生产环境。** 如果你在使用过程中遇到 Bug 或有任何建议，欢迎点击应用左下角的「反馈与建议」提交，我们会认真处理每一条反馈。

---

## 关于

OpenLoaf 是一款现代化的全栈 AI 知识库与智能工作台应用。它将类似 **Notion** 的层级文档管理能力，与类似 **ChatGPT/Claude** 的深度 AI 对话体验融合在一起，致力于打造一个"不仅能聊天，更能沉淀知识"的第二大脑。

OpenLoaf 以**项目**为核心组织一切。每个项目就是一个独立的文件夹 —— 文档、对话、文件、任务、AI 上下文全部集中在一处。在不同项目间自由切换，AI 始终清楚你当前在做什么。

> **为什么叫 OpenLoaf？** Logo 是一个面包形状的沙发 —— Loaf 既有"面包"的意思，也有"懒散地躺着"的含义。我们希望你在使用 OpenLoaf 时，就像窝在沙发上一样舒适惬意。

<div align="center">
  <img src="docs/screenshots/overview.png" alt="OpenLoaf 总览" width="800" />
  <br />
  <sub>工作台：时钟、日历、任务看板、快捷操作一览无余</sub>
</div>

---

## 功能展示

### AI 智能代理 (Agent)

不只是聊天机器人 —— OpenLoaf 的 AI 能**真正动手做事**。内置文档助手、终端助手、浏览器助手、邮件助手、日历助手等多个系统代理，AI 可以理解你的意图后自动拆解任务、调用工具链、跨代理协作，独立完成多步骤工作流。你只需下达一个指令，剩下的交给 AI。

<div align="center">
  <img src="docs/screenshots/ai-agent.png" alt="AI 智能代理" width="800" />
  <br />
  <sub>AI 自动调用终端助手执行文件整理，完成后汇报结果</sub>
</div>

### AI 智能对话

内置多模型 AI 对话，支持 **OpenAI**、**Anthropic Claude**、**Google Gemini**、**DeepSeek**、**Qwen**、**xAI Grok** 以及通过 **Ollama** 接入的本地模型。AI 能感知你当前项目的完整上下文 —— 文件结构、文档内容、对话历史 —— 真正做到"懂你的项目"。支持附件上传、联网搜索、自定义系统提示词，还能一键切换不同模型对比回答质量。

### 无限画板 (Board)

基于 ReactFlow 的无限画板，不只是白板 —— 它是你的**视觉思维空间**。支持自由拖拽布局、便签、图片/视频节点、手绘画笔、AI 图片生成（文生图）、AI 视频生成、图片内容理解等。思维导图、流程图、灵感墙，都可以在一张画布上自由组合。

<div align="center">
  <img src="docs/screenshots/board.png" alt="无限画板" width="800" />
  <br />
  <sub>画板集成 AI 生图、视频生成、手绘、便签等创意工具</sub>
</div>

### AI 图片与视频生成

将灵感即时转化为视觉作品。OpenLoaf 在画板和对话中集成了 **AI 文生图**和 **AI 视频生成**能力。通过文字描述即可生成插画、概念图或营销素材，生成后直接拖入画布进一步编辑。AI 还能**理解图片内容** —— 描述照片中的场景、提取文字、回答关于视觉素材的问题。所有生成过程通过你自己的 API Key 完成，没有任何第三方服务存储你的创作成果。

### 富文本编辑器

基于 [Plate.js](https://platejs.org/) 构建的强大块状编辑器。支持标题、列表、引用、代码块、LaTeX 公式、表格、多媒体嵌入、双向链接等丰富块类型。所见即所得的编辑体验，搭配丰富的工具栏和快捷键，让写作和文档整理如行云流水。通过无限层级的页面结构，自由组织笔记、项目文档和研究资料。

### 看板任务管理

类似 Trello 的看板视图，通过**待办 → 进行中 → 审批 → 已完成**四列管理任务生命周期。支持拖拽排序、优先级标签（紧急/高/中/低）、触发方式（手动/定时/条件触发）、到期时间提醒。AI 可自动创建任务并提交审批，你只需一键通过或返工，让 AI 替你打工。

### 一站式效率工具集

无需在不同应用间来回切换 —— 你需要的一切都内置了：

- **终端** —— 完整的终端模拟器直接嵌入应用内。AI 代理可以直接操作终端 —— 创建目录、移动文件、运行脚本 —— 用自然语言下达指令，执行前始终会征求你的确认。
- **邮件** —— 多账户邮件管理，IMAP 同步，富文本撰写与回复。AI 辅助起草邮件、总结长邮件、提取关键信息。
- **日历** —— 日程管理，支持**系统原生日历同步**（macOS Calendar / Google Calendar）。日/周/月多种视图、AI 自动规划日程、智能提醒。
- **文件管理** —— 网格/列表/分栏三种视图，拖拽上传下载，文件预览（图片、PDF、Office 文档、代码）。AI 可以直接读取和操作你的项目文件。
- **工作台小组件** —— 可定制的仪表盘：实时时钟、日历、任务摘要、快捷操作、Agent 设置 —— 你的任务控制中心，一眼掌握全局。

---

## 适用场景

- **研究与写作** —— 收集参考资料、撰写结构化笔记、与 AI 讨论你的素材、生成精美文档 —— 全部在一个项目文件夹内完成。
- **软件开发** —— 管理需求文档和设计稿、用 AI 生成代码片段、在终端中执行命令、用看板追踪任务进度。
- **创意设计** —— 在无限画板上头脑风暴、用 AI 生成图片和视频、在文件管理器中组织视觉素材、借助 AI 反馈迭代优化。
- **项目管理** —— 为每个客户或项目创建独立项目空间，通过看板管理任务流转，在日历上安排会议，用邮件协调沟通 —— 一切无需离开 OpenLoaf。
- **个人知识库** —— 打造你的第二大脑：收藏网页内容、写日记、用双向链接关联想法，让 AI 帮你发现知识之间的关联。

---

## 隐私与安全

OpenLoaf 遵循**本地优先、隐私至上**的设计理念。你的数据始终留在你的设备上。

- **100% 本地存储** —— 所有文档、对话、文件和数据库都保存在本地文件系统（`~/.openloaf/`）。没有任何内容会上传到云端服务器。
- **自带密钥 (BYOK)** —— 由你自行配置 AI 模型的 API Key（OpenAI、Claude、Gemini 等）。OpenLoaf 不会通过任何中间服务器代理你的请求 —— API 调用直接从你的设备发往模型提供商。
- **离线可用** —— 核心功能（编辑器、文件管理、任务看板）完全离线可用。通过 Ollama 接入本地模型，实现完全断网的 AI 体验。
- **无遥测、无追踪** —— OpenLoaf 不收集任何分析数据、使用行为或遥测信息。发生在你设备上的一切，都只属于你。
- **开源可审计** —— 完整代码基于 AGPLv3 开源。你可以审查和验证每一行接触你数据的代码。

> **一句话总结** —— 不同于云端 AI 工具，OpenLoaf 确保你的知识资产、API 密钥和个人数据始终在你的掌控之中。

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

## 开发计划

- [ ] **完整的 Web 浏览器访问** —— 无需安装桌面应用，直接通过浏览器使用 OpenLoaf（部分功能已可用，正在积极开发中）
- [ ] 更多功能规划中……

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
