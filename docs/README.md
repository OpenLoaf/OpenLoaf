<div align="center">
  <img src="../apps/web/public/logo.png" alt="OpenLoaf Logo" width="120" />
  <h1>OpenLoaf</h1>
  <p><strong>开源 AI 生产力桌面应用 - 以项目为中心、多智能体、本地优先</strong></p>
  <p>每个项目都有自己的 AI 代理团队、记忆和技能。项目之间可以建立关联共享知识，由 Secretary Agent 统一编排。你的数据始终留在自己的设备上。</p>

  <p>AI 秘书 &nbsp;|&nbsp; 独立项目 &nbsp;|&nbsp; 项目关联 &nbsp;|&nbsp; 多智能体 &nbsp;|&nbsp; 画布 &nbsp;|&nbsp; 邮件 &nbsp;|&nbsp; 日历 &nbsp;|&nbsp; 任务</p>

  <blockquote><strong>一个应用，多个项目窗口。每个项目都有自己的 AI 团队，项目之间可以共享知识，由 Secretary Agent 统一串联，一切 100% 本地运行。</strong></blockquote>

  <a href="https://github.com/OpenLoaf/OpenLoaf/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPLv3-blue.svg" alt="License" /></a>
  <a href="https://github.com/OpenLoaf/OpenLoaf/releases"><img src="https://img.shields.io/github/v/release/OpenLoaf/OpenLoaf?label=latest" alt="Release" /></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-brightgreen" alt="Platform" />

  <br /><br />
  <a href="https://github.com/OpenLoaf/OpenLoaf/releases/latest">下载 macOS / Windows / Linux 安装包</a>
  <br /><br />
  <a href="./README_en.md">English</a> | <strong>简体中文</strong>
</div>

---

> **⚠️ 项目仍在持续开发中，功能和 API 可能继续变化，生产环境使用请谨慎。** 如果你遇到 Bug 或有新想法，可以通过应用内置的反馈入口提交。

---

## 关于

OpenLoaf 是一款本地优先的 AI 生产力桌面应用，围绕 **项目作为独立工作单元** 来组织工作。每个项目都会在独立窗口中打开，并自带完整环境：AI 助手、文件树、终端、任务板和画布。

主窗口中有一个 **Secretary Agent** 作为你的个人助理，它可以回答问题、管理日历和邮件，并把复杂任务路由到正确的项目 AI 代理。跨项目协作时，项目之间可以通过 **关联** 来共享记忆和技能。

### 工作方式

```text
你（Boss）
  |
  v
Secretary Agent（主窗口中的个人助理）
  |
  |-- 简单任务 -> 直接处理
  |-- 单项目任务 -> 派生 Project Agent
  `-- 跨项目任务 -> 并行派生多个 Project Agent
        |
        `-- Project Agent（项目窗口）
              |
              `-- Worker Agents（探索、规划、编码等）
```

**主窗口** - 你的总控台：
- AI 秘书负责全局任务，例如日历、邮件、跨项目查询
- 活动时间线展示最近项目、对话和画布
- 项目网格用于浏览和打开项目

**项目窗口** - 每个项目都拥有：
- 具备项目专属记忆和技能的 AI 助手
- 文件浏览器、终端、任务板、画布
- 指向其他项目的关联，相关记忆和技能会自动注入

<div align="center">
  <img src="./screenshots/overview.png" alt="OpenLoaf 总览" width="800" />
</div>

---

## 功能特性

### 多智能体架构

OpenLoaf 的 AI 不是单一聊天机器人，而是一个参考公司协作方式构建的 **分层智能体系统**：

| 智能体 | 角色 | 作用范围 |
|--------|------|----------|
| **Secretary** | 主窗口中的个人助理 | 全局：日历、邮件、项目路由、跨项目查询 |
| **Project Agent** | 每个项目的专属助理 | 项目内：文件、代码、文档、终端、任务 |
| **Worker Agents** | 按需派生的专项子代理 | 聚焦：探索、规划、编码、评审 |

Secretary 会选择最合适的执行路径：简单问题直接回答，项目内任务派发给对应 Project Agent，复杂的跨项目任务则并行调度多个代理协作完成。

### 独立项目窗口

每个项目都在自己的窗口（Electron）或标签页（Web）中运行，互不干扰。你可以同时处理多个项目，而不用来回切换上下文。

项目可以通过 **用户自定义类型标签** 进行视觉分组，例如“代码”“文档”“知识库”。这些类型只是展示标签，系统内部仍然平等对待所有项目。

### 项目关联

任意项目都可以关联到其他项目。建立关联后：
- 被关联项目的 **记忆** 会注入当前项目的 AI 上下文
- 被关联项目的 **技能** 会对当前项目代理开放
- 很适合把知识库、设计系统文档、编码规范等共享给多个项目

### 记忆与技能系统

OpenLoaf 采用三级记忆结构：

| 层级 | 路径 | 用途 |
|------|------|------|
| **用户级** | `~/.openloaf/memory/` | 个人偏好、习惯、全局上下文 |
| **项目级** | `<projectPath>/.openloaf/memory/` | 项目特定的架构决策与约定 |
| **关联项目级** | 自动从关联项目加载 | 共享知识，例如编码规范、API 文档 |

技能遵循同样的组织方式：全局技能 + 项目专属技能，运行时由 AI 代理自动发现并加载。

`SKILL` 本质上是一个以 `SKILL.md` 为入口的可复用 Markdown 工作流。你可以把它放在 `~/.agents/skills/` 里作为全局技能，也可以放在 `<projectPath>/.agents/skills/` 里作为项目专属技能，让代理按需加载说明和相关工具依赖。

OpenLoaf 也支持 **MCP（Model Context Protocol）** 服务。你可以通过 `stdio`、`http`、`sse` 接入外部工具，按全局写入 `~/.openloaf/mcp-servers.json` 或按项目写入 `<projectPath>/.openloaf/mcp-servers.json`，也可以直接导入 Claude Desktop、Cursor、VS Code、Cline、Windsurf 等客户端的 JSON 配置，把 GitHub、数据库、文件系统、Slack 等能力暴露给 AI 代理。

### AI 对话

内置多模型 AI 对话，支持 **OpenAI**、**Anthropic Claude**、**Google Gemini**、**DeepSeek**、**Qwen**、**xAI Grok** 以及通过 **Ollama** 接入的本地模型。AI 能感知项目的完整上下文，包括文件结构、文档内容和对话历史，并通过内置记忆机制跨会话保留知识。

<div align="center">
  <img src="./screenshots/ai-agent.png" alt="AI 代理" width="800" />
</div>

### 无限画布

基于 ReactFlow 的无限画布，适合进行视觉化思考。支持便签、图片、视频、手绘、AI 生图、AI 生成视频以及图片内容理解。思维导图、流程图、灵感墙都可以放在同一张画布里。

<div align="center">
  <img src="./screenshots/board.png" alt="无限画布" width="800" />
</div>

### 内置效率工具

所有工具都在一个应用里，不再需要频繁切换窗口：

- **终端** - 完整终端模拟器，AI 代理可在你确认后执行命令
- **邮件** - 多账户 IMAP 邮件，支持 AI 起草与摘要
- **日历** - 原生日历同步（macOS / Google Calendar），支持 AI 排程
- **文件管理器** - 网格 / 列表 / 分栏视图，支持拖拽和多种文件预览
- **任务板** - 看板式任务流（待办 -> 进行中 -> 评审 -> 完成），支持优先级和 AI 创建任务
- **富文本编辑器** - 基于 [Plate.js](https://platejs.org/) 的块编辑器，支持 LaTeX、表格、代码块和双向链接

---

## 使用场景

- **软件开发** - 每个仓库都可以作为一个项目，再关联一个共享的“编码规范”项目，让多个仓库中的 AI 行为保持一致
- **研究与写作** - 建立“参考资料”项目作为知识库，再把它关联到论文或报告项目中，让 AI 从你的资料集中取材
- **内容创作** - 在画布中头脑风暴，用 AI 生成图片，在编辑器中写作，并在任务板中跟踪交付物
- **项目管理** - 每个客户或事项对应一个项目，Secretary Agent 提供跨项目视角，日历和邮件帮助你维持协同
- **个人知识库** - 累积笔记、网页摘录和日志，再关联到工作项目，让 AI 自动串联上下文

---

## 为什么是 OpenLoaf

### 现有问题

- **AI 工作流碎片化** - 做一件事往往要在多个窗口之间反复切换
- **缺少项目上下文** - AI 在不同对话之间遗忘一切，你每次都要重新解释项目背景
- **项目之间彼此孤立** - 项目无法共享知识，编码规范项目帮不到代码仓库
- **云端锁定** - 数据存放在别人的服务器上，你也无法自由选择 AI 模型

### OpenLoaf 的方案

- **以项目为中心** - 每个项目都是自包含环境，拥有自己的 AI 代理、记忆和技能
- **显式共享知识** - 项目通过关联共享上下文，一个知识库项目可以同时增强多个业务项目
- **多智能体路由** - Secretary Agent 负责编排，简单任务快速处理，复杂任务交给最合适的专家代理
- **本地优先** - 所有数据都保存在本地（`~/.openloaf/`），自带 API Key，无遥测、无追踪
- **开箱即用** - 下载、安装、启动，不需要额外搭建服务器、数据库或 Docker

### Loaf = 面包 + 躺平

OpenLoaf 的 Logo 是一个面包形状的沙发。**Loaf** 既有“面包”的意思，也有“懒洋洋地躺着”的含义。把重复、琐碎的工作交给 AI，你来保留真正重要的判断。

---

## 隐私与安全

- **100% 本地存储** - 所有数据都保存在你的文件系统中（`~/.openloaf/`），不会上传到云端服务器
- **自带密钥（BYOK）** - 由你自行配置 AI API Key，请求直接从设备发送到模型提供商
- **支持离线使用** - 核心功能可离线运行，配合 Ollama 可以获得完全隔离的 AI 体验
- **无遥测** - 不采集分析数据、使用数据或追踪信息，设备上发生的事情只留在设备上
- **开源可审计** - 全量代码基于 AGPLv3 开源，你可以审查每一行接触数据的实现

---

## 快速开始

### 前置条件

- **Node.js** >= 20
- **pnpm** >= 10（执行 `corepack enable`）

### 安装

```bash
# 克隆仓库
git clone https://github.com/OpenLoaf/OpenLoaf.git
cd OpenLoaf

# 安装依赖
pnpm install

# 初始化数据库
pnpm run db:migrate

# 启动开发环境（Web + Server）
pnpm run dev
```

打开 [http://localhost:3001](http://localhost:3001)。若要启动桌面端，执行 `pnpm run desktop`。

---

## 架构

```text
+----------------------------------------------------+
|                    OpenLoaf                        |
|                                                    |
|  主窗口                                            |
|  |-- Secretary Agent（全局 AI 助理）               |
|  |-- 活动时间线（最近历史）                        |
|  |-- 项目网格（按类型展示全部项目）                |
|  |-- 日历、邮件、画布（全局能力）                  |
|  `-- 设置                                          |
|                                                    |
|  项目窗口（每个项目一个）                          |
|  |-- Project Agent（项目级 AI）                    |
|  |-- 文件树、终端、搜索                            |
|  |-- 任务板、画布                                  |
|  |-- 关联项目（共享记忆 / 技能）                   |
|  `-- 项目设置与技能                                |
|                                                    |
|  数据层                                            |
|  |-- ~/.openloaf/memory/          （用户记忆）     |
|  |-- ~/.openloaf/config.json      （项目注册表）   |
|  |-- ~/.openloaf/openloaf.db      （SQLite 数据库）|
|  |-- <project>/.openloaf/memory/  （项目记忆）     |
|  `-- <project>/.agents/skills/    （项目技能）     |
+----------------------------------------------------+
```

### 项目结构

```text
apps/
  web/          - Next.js 16 前端（静态导出，React 19）
  server/       - Hono 后端，tRPC API
  desktop/      - Electron 40 桌面壳
packages/
  api/          - tRPC 路由类型与共享 API 逻辑
  db/           - Prisma 7 数据库 Schema（SQLite）
  ui/           - shadcn/ui 组件库
  config/       - 共享环境变量与路径解析
```

### 技术栈

| 领域 | 技术 |
|------|------|
| 前端 | Next.js 16 / React 19 / Tailwind CSS 4 |
| 后端 | Hono + tRPC / Prisma + SQLite |
| 桌面端 | Electron 40 |
| 编辑器 | Plate.js |
| AI | Vercel AI SDK（OpenAI / Claude / Gemini / DeepSeek / Qwen / Grok / Ollama） |
| 协作 | Yjs |
| 画布 | ReactFlow |
| 工具链 | Turborepo + pnpm monorepo |

---

## Roadmap

- [x] 多智能体架构（Secretary -> Project Agent -> Workers）
- [x] 独立项目窗口
- [x] 通过共享记忆与技能实现项目关联
- [x] 通过用户自定义类型进行项目分组
- [x] 主窗口活动时间线
- [ ] 完整 Web 访问能力（无需桌面端）
- [ ] 国际化（i18n） - 进行中
- [ ] 项目模板市场
- [ ] WPS / Microsoft Office 集成
- [ ] 更多能力持续加入中

---

## 贡献

1. **Fork** 本仓库
2. 创建功能分支：`git checkout -b feature/my-feature`
3. 提交代码（遵循 [Conventional Commits](https://www.conventionalcommits.org/)）：
   ```bash
   git commit -m "feat(web): add dark mode toggle"
   ```
4. 推送到远端：`git push origin feature/my-feature`
5. 发起 **Pull Request**

> 提交 PR 前，请先阅读[贡献指南](../.github/CONTRIBUTING.md)、[开发指南](./DEVELOPMENT.md)，并签署 [CLA](../.github/CLA.md)。

---

## 许可证

OpenLoaf 采用双许可证模式：

- **开源版本** - [GNU AGPLv3](../LICENSE)：可自由使用、修改和分发，派生作品需继续保持开源
- **商业版本** - 如需闭源商用，可联系我们获取商业授权

---

<div align="center">
  <a href="https://github.com/OpenLoaf/OpenLoaf/issues">Bug 反馈与功能建议</a>
  <br /><br />
  <sub>OpenLoaf - 你的 AI、你的项目、你的数据、你的设备。</sub>
</div>
