<div align="center">
  <img src="../apps/web/public/logo.png" alt="OpenLoaf Logo" width="120" />
  <h1>OpenLoaf</h1>
  <p><strong>开源 AI 知识库 & 智能工作台</strong></p>
  <p>结构化文档管理 + 多模型 AI 对话 + 跨平台桌面体验，打造你的第二大脑。</p>

  <a href="https://github.com/OpenLoaf/OpenLoaf/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPLv3-blue.svg" alt="License" /></a>
  <a href="https://github.com/OpenLoaf/OpenLoaf/releases"><img src="https://img.shields.io/github/v/release/OpenLoaf/OpenLoaf?label=latest" alt="Release" /></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-brightgreen" alt="Platform" />
  <img src="https://img.shields.io/badge/electron-40-blue?logo=electron" alt="Electron" />
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-19-61dafb?logo=react" alt="React" />

  <br />
  <a href="../README.md">English</a> | <strong>简体中文</strong>
</div>

---

## 关于

OpenLoaf 是一款现代化的全栈 AI 知识库与智能工作台应用。它将类似 **Notion** 的层级文档管理能力，与类似 **ChatGPT/Claude** 的深度 AI 对话体验融合在一起，致力于打造一个"不仅能聊天，更能沉淀知识"的第二大脑。

> **为什么叫 OpenLoaf？** Logo 是一个面包形状的沙发 —— Loaf 既有"面包"的意思，也有"懒散地躺着"的含义。我们希望你在使用 OpenLoaf 时，就像窝在沙发上一样舒适惬意。

## 核心特性

### 结构化知识管理

- **块状编辑器** — 基于 [Plate.js](https://platejs.org/) 构建，支持富文本、表格、代码块、LaTeX 公式、多媒体嵌入等
- **无限层级页面** — 自由组织笔记、项目文档、研究资料，支持双向链接
- **多维视图** — 看板（Board）、日历、思维导图等多种视图管理任务与日程
- **实时协作** — 基于 [Yjs](https://yjs.dev/) 的 CRDT 实时协同编辑

### AI 智能助手

- **多模型支持** — OpenAI、Anthropic Claude、Google Gemini、DeepSeek、Qwen、xAI Grok，以及 Ollama 本地模型
- **项目级上下文** — AI 能够感知整个项目、文件夹乃至整个知识库的内容
- **智能代理（Agent）** — 内置文档、终端、浏览器、邮件、日历等系统代理，自动拆解任务并调用工具
- **自主任务系统** — AI 可独立规划和执行多步骤任务

### 全能桌面工作台

- **跨平台** — 支持 macOS、Windows、Linux（基于 Electron 40）
- **内置终端** — 完整的终端模拟器，无需切换窗口
- **邮件客户端** — 集成邮件收发与管理
- **智能日历** — 日程同步与 AI 自动规划
- **文件管理** — 内置文件浏览器，支持拖拽操作
- **动态小组件** — 桌面小组件，实时监控任务状态
- **离线优先** — 本地 SQLite 存储，数据完全归你所有

## 技术栈

| 层级 | 技术 |
|------|------|
| **前端** | Next.js 16, React 19 + React Compiler, Tailwind CSS 4, shadcn/ui |
| **桌面端** | Electron 40 (Electron Forge + electron-builder) |
| **后端** | Hono + tRPC（端到端类型安全 API） |
| **数据库** | Prisma 7 + SQLite (LibSQL) |
| **编辑器** | Plate.js, Monaco Editor, Milkdown |
| **AI** | Vercel AI SDK（多模型统一接口） |
| **协作** | Yjs + Hocuspocus |
| **画板** | ReactFlow |
| **构建** | Turborepo + pnpm monorepo |

## 项目结构

```
OpenLoaf/
├── apps/
│   ├── web/          # Next.js 前端（静态导出）
│   ├── server/       # Hono 后端 + tRPC API
│   └── desktop/      # Electron 桌面外壳
├── packages/
│   ├── api/          # tRPC 路由类型 & 共享 API 逻辑
│   ├── db/           # Prisma schema（SQLite）
│   ├── ui/           # shadcn/ui 组件库（Radix + Tailwind）
│   └── config/       # 共享配置与环境变量工具
└── scripts/          # 构建 & 发布脚本
```

## 快速开始

### 前提条件

- **Node.js** >= 20
- **pnpm** >= 10（`corepack enable` 即可）

### 安装

```bash
# 1. 克隆仓库
git clone https://github.com/OpenLoaf/OpenLoaf.git
cd OpenLoaf

# 2. 安装依赖
pnpm install

# 3. 初始化数据库
pnpm run db:push

# 4. 启动开发环境
pnpm run dev
```

打开浏览器访问 [http://localhost:3001](http://localhost:3001) 即可看到 Web 应用，API 运行在 [http://localhost:3000](http://localhost:3000)。

### 桌面应用（开发模式）

```bash
pnpm run desktop
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm run dev` | 启动所有应用（web + server） |
| `pnpm run dev:web` | 仅启动 Web 前端 |
| `pnpm run dev:server` | 仅启动 Server 后端 |
| `pnpm run desktop` | 启动 Electron 桌面应用 |
| `pnpm run build` | 构建所有包 |
| `pnpm run check-types` | 全量类型检查 |
| `pnpm run db:generate` | 生成 Prisma 客户端 |
| `pnpm run db:push` | 推送 schema 变更到数据库 |
| `pnpm run db:studio` | 打开 Prisma Studio |
| `pnpm run lint` | 代码检查 |
| `pnpm run format:fix` | 自动格式化 |

## 桌面端生产配置

- 配置文件：`~/.openloaf/.env`（API 密钥等）
- 数据目录：`~/.openloaf/`（Windows: `%USERPROFILE%\.openloaf`）
- 数据库路径：`~/.openloaf/openloaf.db`（首次运行自动初始化）
- 默认工作区：
  - macOS: `~/Documents/OpenLoafWorkspace`
  - Linux: `~/OpenLoafWorkspace`
  - Windows: `D:\OpenLoafWorkspace`（无 D 盘则回退到 `%USERPROFILE%\OpenLoafWorkspace`）

## 增量更新

OpenLoaf 支持 Server 和 Web 的增量热更新，无需重新下载整个应用：

- **自动检查** — 应用启动时自动检查更新
- **手动触发** — 设置 > 关于中可手动检测
- **Beta 渠道** — 可选开启 Beta 体验，提前获取新功能
- **崩溃回滚** — 更新后若连续崩溃，自动回退到稳定版本

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

## 联系我们

- **GitHub Issues** — [提交 Bug 或功能建议](https://github.com/OpenLoaf/OpenLoaf/issues)
- **GitHub Discussions** — [社区讨论](https://github.com/OpenLoaf/OpenLoaf/discussions)

---

<div align="center">
  <sub>OpenLoaf — 重新定义你的 AI 协作空间。</sub>
</div>
