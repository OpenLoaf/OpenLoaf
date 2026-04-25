---
name: macos-control-skill
description: >
  当用户要求 AI 直接操作他的 macOS 桌面时触发：打开某个 App、点击某个按钮、填写窗口里的表单、读取当前屏幕内容、自动化本地 GUI 流程。典型说法"帮我在访达里…"、"帮我在某 App 里点一下…"、"看看我屏幕上显示的是什么"。**仅在 OpenLoaf Desktop（macOS）中可用**；非桌面端会返回 desktop-only 错误，应改用 `BrowserAct` 或让用户自己操作。**不用于**：网页内交互（→ `browser-ops-skill`）、本地文件读写（→ `Read`/`Edit`/`Write`）。
tools: [MacosSurvey, MacosObserve, MacosAct, MacosListWindows, MacosCaptureWindow]
---

# macOS 桌面控制指南

## 核心思维：先理解，再动手

**不要看到 app 就直接 click/type**。人类操作一个陌生 app，会先"逛一圈"——看它长什么样、有哪些入口、哪里是关闭按钮、哪里是业务区。你也必须这样。

三阶段框架：

```
1. Survey（理解）  → MacosSurvey(app) 拿 app 心智模型
2. Plan（选路径）  → 按 Survey 给的"Recommended path order"挑一条路
3. Act + Verify   → MacosAct 执行；MacosObserve 确认结果
```

**跳过 Survey 直接 Act 是最常见的失败**。微信 / QQ / 飞书 / 钉钉这类自绘 UI 的 AX tree 只有 3 个窗口按钮（close / min / zoom），模型凭猜点 `path=["0","0"]` 就会命中红色关闭按钮，整个 app 被关掉。Survey 会把这类陷阱提前告诉你。

## 工具全景

| 工具 | 什么时候用 |
|---|---|
| **`MacosSurvey(app)`** | **每次接触某个 app 的第一步**。返回 app 心智模型：已知 intent、AX 丰富度、菜单栏地图、窗口清单、推荐执行顺序。会话内缓存 5 分钟。 |
| `MacosObserve(appFilter?)` | 看**当前**具体 UI 状态——截图 + AX 树 + 窗口清单。Survey 之后用，以及每次 `MacosAct` 后用来验证结果。 |
| `MacosAct` | 执行动作。支持 `intent / launch_app / menu_click / applescript / key / click / type / scroll / drag / wait / ax_action`。 |
| `MacosListWindows(appFilter?)` | 仅枚举窗口（比 Observe 轻量）。多窗口场景里挑特定 window 用。 |
| `MacosCaptureWindow(windowID)` | 按 windowID 截**特定窗口**，可以截到被遮挡或最小化的窗口（Window Server 保留合成 buffer）。 |

全部仅在 **OpenLoaf Desktop（macOS）** 可用。非桌面端工具不注册；会话里不要尝试调它们。

## 执行路径的优先级（由 Survey 告诉你）

MacosSurvey 返回里有一段 `Recommended path order`，顺序从高确定性到低：

```
1. Known intents       MacosAct type="intent"          确定性 100%
2. Menu navigation     MacosAct type="menu_click"      自绘 UI 也能用
3. Keyboard shortcut   MacosAct type="key"             读菜单栏的 shortcut 字段
4. AX path click       MacosAct type="click" ref=...   仅当 Survey 判定 ax-rich 时安全
5. Coord click         MacosAct type="click" point=... 最后手段，从截图读像素
```

**严格按顺序下探**。能用前面的就不走后面。Survey 判 `self-drawn` 的 app 上，第 4 步直接跳过——对窗口 chrome 按钮的 AX path click 会被拦下（返回 `WINDOW_CHROME_BLOCKED` 错误）。

## Survey 返回长什么样

```
App: 微信 (WeChat.app) (com.tencent.xinWeChat, pid=86795)

AX profile: self-drawn — AXWindow children are only chrome buttons
  richness: 0.995 (203 nodes)
  windowChildRoles: [AXCloseButton, AXFullScreenButton, AXMinimizeButton]

Known intents (from registry):
  - id: open_moments    — 打开朋友圈 / Open Moments feed
  - id: open_chats      — 切换到聊天列表
  - id: open_discover   — 打开"发现"页
  ...

Menu bar (34 entries with shortcuts, sample):
  - 文件 > 锁定微信  (⌘L)
  - 视图 > 聊天  (⌘1)
  - 视图 > 朋友圈  (⌘⇧4)
  ...

Windows (2):
  - windowID=227474 visible 1060×859 "Weixin"  (main)
  - windowID=260481 hidden 710×831

Recommended path order:
  1. Known intents (highest confidence): MacosAct type="intent" — 5 registered
  2. Menu navigation: MacosAct type="menu_click" — 34 reachable entries
  3. Keyboard shortcut: MacosAct type="key"
  4. AX path click: **DO NOT USE** on this app.
  5. Coordinate click: last resort.
```

"Known intents" 就是别人已经替你踩过坑的路径。优先用。

## 典型场景

### 场景 A：打开微信朋友圈

```
1. MacosAct { type: "launch_app", app: "WeChat" }
2. MacosSurvey { app: "WeChat" }
   → 看到 Known intents 里有 open_moments
3. MacosAct { type: "intent", app: "WeChat", intent: "open_moments" }
4. MacosObserve { appFilter: "WeChat" } — 验证朋友圈已打开
```

**不要**调完 launch_app 就直接 observe + click AX tree。那是老路径，会命中关闭按钮。

### 场景 B：在 Safari 打开 github.com

```
1. MacosSurvey { app: "Safari" }
   → Known intents 里有 open_url（args: url required）
2. MacosAct { type: "intent", app: "Safari", intent: "open_url", args: { url: "https://github.com" } }
3. MacosObserve { appFilter: "Safari" } — 验证页面加载
```

### 场景 C：读屏幕

用户问「我屏幕上显示什么」、「当前 App 里 xx 是什么」：直接一次 `MacosObserve`，从截图 + AX 树提炼答案。不需要 Survey，不需要 Act。

### 场景 D：未注册的 intent / ax-rich app

Survey 返回 `ax-rich` 且没有对应 intent 时，优先 menu_click / key，其次 AX path click：

```
1. MacosSurvey { app: "Finder" } → ax-rich, 推荐 menu_click / AX path click
2. 要新建窗口 → 看菜单栏 "文件 > 新建 Finder 窗口 (⌘N)"
3. MacosAct { type: "key", keys: ["cmd", "n"] } — 用快捷键比 click 稳
4. MacosObserve 验证
```

### 场景 E：多窗口（微信主窗口 + 图片预览）

```
1. MacosSurvey { app: "WeChat" } → Windows: 2 个，windowID 分别 227474/260481
2. MacosCaptureWindow { windowID: 227474 } — 专截主窗口（即便被预览挡住）
3. 后续 MacosAct click 的坐标基准已更新为这个窗口的图
```

### 场景 F：填原生窗口表单（AppKit app）

Survey 看到 `ax-rich`，目标元素有 AX role=AXTextField：

```
1. MacosObserve { appFilter: "..." } 拿输入框 ref
2. MacosAct { type: "click", ref: { app, path: [...] } } 聚焦
3. MacosAct { type: "type", text: "..." }
4. MacosAct { type: "ax_action", ref: { app, path: [submit button] }, action: "AXPress" }
5. MacosObserve 验证
```

## 当 Survey 没有你要的 intent 怎么办

1. 看 Survey 的 `Menu bar` 段 —— 几乎所有 app 的菜单栏都可以 menu_click
2. 菜单项如果带 `(⌘⇧X)` 这种 shortcut，用 `MacosAct type="key"` 更稳
3. 走不通再 observe 截图，按像素 coord click
4. 完全走不通时**停下来告诉用户**"这条路径我没找到安全做法"，别猜

## 铁律

1. **第一次接触某 app，先 Survey**。不 Survey 就 Act 是最常见的失败，特别是对自绘 UI。
2. **优先走 Survey 推荐的第一条路**（Known intents）。自己另辟蹊径多半翻车。
3. **每次 `MacosAct` 后 `MacosObserve`**。UI 是有状态的，你无法预测结果。**例外**：`intent` / `menu_click` 成功后如果不需要二次动作，可以跳过 verify。
4. **AX path click 只在 Survey 判 `ax-rich` 的 app 上用**。`mixed` 谨慎，`self-drawn` 禁止——chrome 按钮会被硬拦（WINDOW_CHROME_BLOCKED）。
5. **坐标点击是最后手段**。必须先 observe 看到截图像素位置；连续 2 次 coord click 后 UI 没变化，立即停止并告知用户定位失败。
6. **敏感 app 前台（密码管理器 / 银行 / Keychain）立即停止**，让用户自己操作。
7. **缺权限时**：系统设置面板已自动弹出，用自然语言告诉用户去启用 OpenLoaf，等用户确认再继续。**不要重试**。
8. **非 macOS 桌面端**：立即返回 desktop-only，改用 `BrowserAct` 或交回用户。

## 权限

首次调用会提示缺权限。server 已自动打开对应系统设置面板。需要：

- `screen`：屏幕录制（Survey / Observe / CaptureWindow 都要）
- `accessibility`：辅助功能（AX 树读取 + 合成输入）

某些系统级 app 授权后仍需重启 OpenLoaf Desktop。

## 坐标空间（退化到 point 时）

`point.{x,y}` 就是最近一次 MacosObserve 或 MacosCaptureWindow 截图上的像素坐标——图上目标在哪个像素，就把那个像素塞给 `click/scroll/drag`。工具内部自动换算到屏幕坐标，你不用关心 retina 缩放、窗口偏移或多显示器。

- observe/capture_window 返回里 `Screenshot: window 2120×1718 px` 的那个数字就是坐标范围
- 必须先调用过一次 observe 或 capture_window 才能用坐标动作；否则工具拒绝

## 安全与隐私

- **密码、银行、密钥链类 App 不要 Survey / Observe / Act**。遇到 1Password / Keychain / 银行 app 前台，立即停止并让用户自己操作。
- 截图存会话附件目录，随会话清理；不上传云端、不训练。
- 不确定屏幕状态时先 observe 一次再判断；不要臆测。

## 错误诊断

- `permissionsMissing` → 已自动开设置面板，提示用户授权 → 等确认
- `desktop-only` → 当前非桌面端；告诉用户切到 OpenLoaf Desktop
- `WINDOW_CHROME_BLOCKED` → 你点了窗口 chrome 按钮。按返回里的 4 个候选路径重新规划（menu_click / key / coord / URL）。**不要**傻乎乎加 `confirm_window_chrome:true` 强推，除非真的要关窗
- `intent 未找到` → 用 `MacosSurvey` 看一下可用 intent 列表；或降级到 menu_click
- 点击无反应 → 重新 observe，看目标节点是否真可点、是否被遮挡
- 中途前台切换 → observe 的 app 和 act 的 app 不一致，先 `key cmd+tab` 切回再 act
