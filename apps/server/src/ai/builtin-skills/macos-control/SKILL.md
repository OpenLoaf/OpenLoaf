---
name: macos-control-skill
description: >
  当用户要求 AI 直接操作他的 macOS 桌面时触发：打开某个 App、点击某个按钮、填写窗口里的表单、读取当前屏幕内容、自动化本地 GUI 流程。典型说法"帮我在访达里…"、"帮我在某 App 里点一下…"、"看看我屏幕上显示的是什么"。**仅在 OpenLoaf Desktop（macOS）中可用**；非桌面端会返回 desktop-only 错误，应改用 `BrowserAct` 或让用户自己操作。**不用于**：网页内交互（→ `browser-ops-skill`）、本地文件读写（→ `Read`/`Edit`/`Write`）。
tools: [MacosObserve, MacosAct]
---

# macOS 桌面控制指南

## 工具清单

| 工具 | 职责 | 只读 |
|------|------|------|
| `MacosObserve` | 截屏 + dump 当前前台 App 的 Accessibility 树（含控件 role / title / frame / path） | 是 |
| `MacosAct` | 单步动作：click / type / key / scroll / drag / wait / ax_action | 否 |

> **加载**：两个工具都是 deferred，调用前先 `ToolSearch(names: "MacosObserve,MacosAct")` 激活 schema。
> **平台**：仅 macOS 桌面端；其他平台工具不注册，返回 desktop-only 错误即终止。

## 核心心智模型

- 桌面控制 = **observe-act-verify** 循环，每次 `MacosAct` 后必须再 `MacosObserve` 一次，因为 UI 是有状态的：点击可能触发弹窗、页面切换、焦点变化，你无法预测结果。盲目连续 act 是最常见的失败原因。

```
MacosObserve → 分析 AX 树 → MacosAct → MacosObserve → ...
```

**铁律**：这个循环是强制性的，必须严格遵守，没有任何例外：
- 每次 `MacosAct`（包括 `wait`、`scroll` 等非点击动作）后，必须立即调用 `MacosObserve` 验证结果
- 不论你是否认为任务已完成、不需要再观察、或者 wait 后可以结束 —— **都不行**，必须调用 `MacosObserve`
- 只有在用户明确确认任务完成，或者你确定最后一个动作后无需验证的情况下，才可以跳过最后的 `MacosObserve`
- 不要因为想节省步数或时间而违反此规则

MacosObserve → 分析 AX 树 → MacosAct → MacosObserve → ...
```

## 权限

首次调用会提示缺权限。**当 tool 返回 `macOS permission missing: ...` 时，server 已自动为用户打开了系统设置对应面板**。你要做的：

1. 用自然语言告诉用户：「已为你打开"系统设置 → 隐私与安全性 → {面板}"，请启用 OpenLoaf，然后告诉我继续」
2. **不要**自己反复重试 observe/act；等用户确认授权后再继续
3. 需要的权限：
   - `screen`：屏幕录制（截图）
   - `accessibility`：辅助功能（读 UI 树 + 发合成输入）
4. 某些 App（例如需授予 App-specific 权限的系统 App）授权后仍需重启 OpenLoaf Desktop

## MacosObserve 详解

单次 `MacosObserve` 返回：

- **截图 attachment**：`appFilter` 未传 → 整屏截图；`appFilter` 已传 → 只截该 App 的 frontmost window（更小、更聚焦、没有别的窗口干扰）
- **前台 App 信息**：`name`、`bundleId`
- **AX 树（JSON）**：每个节点含 `role` / `title` / `value` / `identifier` / `frame: {x,y,w,h}` / 可选 `path: [...]` / `children`
- **预算**：默认 `maxNodes: 500`、`maxDepth: 6`；超出截断，响应里带 `truncated: true`

**参数**：
- `appFilter`（可选）：按 App 名字或 bundle id 过滤。同时影响 AX 树和截图——指定后两者都只看这个 App。未指定则读前台 App + 整屏
- `maxNodes` / `maxDepth`：收缩预算以压缩 token
- `includeScreenshot: false`：只要 AX 树不要图（极少用）

> 想聚焦某个 App 时直接传 `appFilter: "WeChat"`，比整屏截图更省 token 也更清晰。窗口隐藏/最小化/离屏时自动回退到整屏。

## MacosAct 动作集

| type | 用法 | 何时用 |
|------|------|--------|
| `launch_app` | 通过 `open -a` 启动 App（名字或 bundle id） | **启动 App 首选** — 一步到位，比 Spotlight 稳 |
| `menu_click` | 走 App 菜单栏点菜单项（`{app, menuPath:["视图","朋友圈"]}`） | **App 内跳页首选** — 鼠标不动、成功率接近 100%，且对自绘 UI（微信/QQ/飞书）照样有效 |
| `applescript` | 跑一段 AppleScript（`osascript -e`） | Finder、Mail、Calendar、Safari、Chrome、Notes、Reminders、Messages、Music、Terminal、iTerm、Keynote 等 scriptable App 的**真后台**通道；不抢焦点、不动鼠标、能拿返回值 |
| `key` | 发组合键（`return`、`cmd+2`、`cmd+w`...） | 快捷键优先于点击 — 不动鼠标、不依赖坐标（**启动 App 用 `launch_app`，不要 cmd+space**） |
| `click` | 点击。优先 `ref`（AX 引用），退化到 `point: {x,y}` | **最后手段**：menu_click / key / ax_action 都不适用时才用 |
| `type` | 在当前焦点输入文本 | 已 focus 输入框后 |
| `scroll` | 在 `point` 处滚动 `dx/dy` | 内容在视口外 |
| `drag` | 从 `from` 拖到 `to` | 拖拽、选区 |
| `wait` | 等待 `ms` 毫秒（≤10000） | 极少用，通常下一个 observe 就够 |
| `ax_action` | 对 AX 节点执行命名动作（`AXPress`、`AXShowMenu` 等） | AX 节点明确支持时；标准 AXPress 优先用 `menu_click` |

## 优先级铁律（跳页/触发动作）

**扁平化的决策顺序：`menu_click` → `applescript` → `key` → `ax_action` → `click`**。一路往下退，能用前面的就不走后面的。

- 跳到 App 内某个页面（朋友圈、收藏、日历今天视图、Finder 新窗口……）→ 先试 `menu_click`
- Finder/Mail/Calendar/Safari/Chrome/Notes/Reminders/Messages/Music/Terminal 等 → 直接上 `applescript`，真后台
- 有公开快捷键 → `key`
- AX 树里有 `actions: ["AXPress"]` 的节点 → `ax_action`
- 都不行才 `click` 坐标

## AX ref 优先于坐标

**铁律**：能用 `ref` 就不用 `point`。窗口移动后 `ref` 会根据 AX path / identifier 重新解析；坐标则需要重新 observe。

```json
// 好
{ "type": "click", "ref": { "app": "Finder", "path": ["AXWindow[0]", "AXSplitGroup", "AXList", "AXRow[2]"] } }

// 退化（AX 树里没有目标时，例如微信左栏头像是自绘 Canvas，AX 看不到）
{ "type": "click", "point": { "x": 120, "y": 340 } }
```

`ref` 两种形式：
- `{ app, path: [...] }`：从根到目标的路径，`role` 或 `role[index]`
- `{ identifier: "..." }`：当节点有 AX identifier 时最稳

### 坐标空间（退化到 point 时）

**`point.{x,y}` 就是 MacosObserve 截图上的像素坐标**——你在图上看到目标大概在哪个像素，就把那个像素塞给 `click/scroll/drag`。工具内部会自动换算成屏幕坐标，你不用关心 retina 缩放、窗口偏移或多显示器。

- observe 返回里 `Screenshot: window 2120×1718 px` 的那个数字，就是坐标范围
- 必须先至少调用过一次 `MacosObserve` 才能用坐标动作；否则工具会拒绝并提示先 observe

## 核心工作流

### 工作流 1：打开 App 并操作

1. `MacosAct { launch_app: "Finder" }` — 一步起 App（也可用 bundle id，如 `com.tencent.xinWeChat`）
2. `MacosObserve` 确认 App 已起 + 拿到 AX 树
3. 定位目标节点 → `MacosAct { ax_action: "AXPress", ref: ... }`
4. `MacosObserve` 验证

> 不要用 `cmd+space → type → return` 的 Spotlight 路径来启动 App——需要 3-4 个 tool 调用，还可能被中文输入法、焦点丢失、Spotlight 弹出状态打断。`launch_app` 是唯一正确入口。

### 工作流 2：读当前屏幕内容

用户问「我屏幕上显示什么」、「当前 App 里的 xx 是什么」：直接一次 `MacosObserve`，从截图 + AX 树提炼答案。**不要**为此多点多截。

### 工作流 3：填写原生窗口表单

1. `MacosObserve` 拿输入框节点
2. `MacosAct { click, ref }` 聚焦
3. `MacosAct { type: "..." }` 输入
4. 重复
5. `MacosAct { ax_action: "AXPress", ref: <submit button> }`
6. `MacosObserve` 确认结果

## 安全与隐私

- **密码、银行、密钥链类 App 不要截图也不要 act**。遇到密码管理器（1Password / Keychain）、银行 App 前台，立即停止并让用户自己操作
- 截图存会话附件目录，随会话清理；**不上传云端、不训练**
- 用户提问后你若不确定屏幕当前状态，先 observe 一次再判断，**不要臆测**

## 错误诊断

- **`permissionsMissing`** → 已自动打开设置面板，提示用户授权 → 等确认
- **`desktop-only`** → 当前非桌面端，告诉用户切到 OpenLoaf Desktop 或换方案（如浏览器自动化）
- **AX ref 解析失败** → 重新 observe 拿最新 path，旧 path 可能已过期
- **点击无反应** → 目标节点是否真可点？看 AX `role` 是否为 `AXButton`/`AXMenuItem`；是否被遮挡 → 重新 observe
- **中途 App 前台切换** → observe 的 App 和 act 的 App 不一致，先 `key cmd+tab` 切回再 act

## 铁律

1. **每次 act 后 observe 验证**
2. **优先 AX ref，退化到坐标**
3. **缺权限立即停止 + 提示用户，不要重试**
4. **敏感 App（密码管理器 / 银行）前台时停止**
5. **读屏一次够用就别多截**
6. **非桌面端立即返回 desktop-only，改用浏览器工具或交回用户**
7. **连续 2 次坐标点击后 AX 树 / 截图没有可观察到的变化 → 停止点击**，如实告诉用户"定位失败，可能是自绘 UI（微信、QQ、飞书等）AX 不暴露控件"，并：① 优先改走菜单栏（`cmd+?` 或 App 顶部菜单里找同名项）或快捷键；② 请用户指认图标位置。**禁止**继续按 +30/+50 像素的步长盲试，**禁止**在没有可观察证据的情况下宣告任务成功
8. **自绘 UI 识别**：微信/QQ/飞书/钉钉/企业微信等 App 的主窗口 AX 树通常只有 AXWindow 加几个按钮，没有内容区控件。这类情况下坐标点击成功率极低，应当直接走菜单栏 / 快捷键 / 交回用户，而不是猜坐标
