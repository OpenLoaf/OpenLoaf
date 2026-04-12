---
name: browser-ops
description: 浏览器操作指南：页面交互（表单、点击、登录）、截图、翻页抓取、下载图片。**两种触发场景**：1) 需要页面交互时（fill form、click、login、screenshot、scrape、download image）；2) WebFetch 失败时（验证码、反爬、SPA 空壳）降级到浏览器自动化。**反例**（不要触发）：事实性问题 → WebSearch。
---

# 浏览器操作指南

## 核心心智模型

浏览器操作 = **观察-行动-验证** 循环。每次操作后必须 snapshot 确认状态，因为网页是有状态的——点击可能触发导航、弹窗、AJAX 加载，你无法预测结果。盲目连续操作是最常见的失败原因。

```
OpenUrl → BrowserSnapshot → 分析 → BrowserAct → BrowserWait → BrowserSnapshot → ...
```

## 可用工具一览

| 工具 | 用途 | 需要审批 |
|------|------|---------|
| `OpenUrl` | 打开页面（headless/tab/window） | 是 |
| `BrowserSnapshot` | 获取页面全貌（文本+元素+截图+rawHtml） | 否 |
| `BrowserAct` | 页面交互（点击/输入/滚动/按键） | 是 |
| `BrowserWait` | 等待条件（load/networkidle/url/text/timeout） | 否 |
| `BrowserDownloadImage` | 下载页面中的图片 | 是 |

## OpenUrl 打开模式

- **`headless`** — 纯自动化首选。无 UI，适合抓取、后台 Agent、批量操作。
- **`tab`（默认）** — 用户需要看到/操作页面时用。内嵌面板。
- **`window`** — 用户需要独立窗口深度交互时用。

**速记**：用户不需要看 → `headless`；用户要看 → `tab`；用户要独立窗口 → `window`。

## BrowserSnapshot 说明

BrowserSnapshot 一次调用返回：
- **页面信息**：URL、标题、readyState
- **全量文本**：body.innerText（截断 32KB）
- **交互元素列表**：最多 120 个可点击/可输入元素及其 selector
- **iframe 内容**：同源 iframe 的文本和元素
- **截图**：默认截取完整页面（fullPage），保存到会话资源目录
- **rawHtmlPath**：完整 outerHTML 存盘路径

**文本超 32KB 怎么办？** 用 `Read`/`Grep` 读 `rawHtmlPath` 获取完整 DOM，不要反复调 BrowserSnapshot 重抓。

**截图控制**：`fullPage: false` 仅截取当前可视区域。

## 三大核心工作流

### 工作流 1：信息提取

`OpenUrl` → `BrowserWait { type: "load" }` → `BrowserSnapshot`

直接从返回的文本中提取所需信息。

翻页抓取：`BrowserSnapshot` → `BrowserAct { action: "click-text", text: "下一页" }` → `BrowserWait { type: "networkidle" }` → 循环。每页都要 snapshot。

### 工作流 2：表单填写与登录

1. `OpenUrl` → `BrowserSnapshot` 看表单结构和 selector
2. 对每个字段 `BrowserAct { action: "fill", selector: "...", text: "..." }`
3. 提交：`BrowserAct { action: "click-css", selector: "button[type=submit]" }`
4. `BrowserWait { type: "urlIncludes", url: "/success" }` 确认成功
5. `BrowserSnapshot` 最终确认

**fill vs type**：`fill` 原子性地清空+输入，适合表单；`type` 在当前焦点追加字符，适合搜索框。

**登录注意**：Cookie 在会话期间持久，登录一次后续自动带认证。**不要** snapshot 密码字段。

### 工作流 3：截图与图片下载

- `BrowserSnapshot` — 快照 + 完整页面截图（默认 fullPage）
- `BrowserSnapshot { fullPage: false }` — 仅可视区域
- `BrowserDownloadImage { selector: ".product-image" }` — 下载页面中的图片

截图是调试利器：文本看不出问题时，看截图一目了然。

## Selector 选择策略

从 BrowserSnapshot 返回的元素列表中选择 selector，**不要自己猜**。

优先级：`#id` > `[data-testid]` > `input[name]` > `.class` > `click-text`

## 等待策略

- **`load`**：传统页面导航后用
- **`networkidle`**：SPA/AJAX 页面首选，最安全但最慢
- **`urlIncludes`**：表单提交后等待跳转
- **`textIncludes`**：等待异步加载的内容
- **`timeout`**：最后手段

## 错误诊断

**元素未找到？** → BrowserSnapshot 确认页面状态 → 可能已导航到别处 → 可能在视口下方（scroll 后再试）→ 可能在 iframe 中（不支持跨 iframe）

**页面加载超时？** → BrowserSnapshot 看加载到哪了，可能内容已够用

**操作没反应？** → 页面没加载完（加 BrowserWait）→ selector 匹配了错误元素（snapshot 检查）→ 弹窗遮挡（先关闭）

**SPA 内容为空？** → `BrowserWait { type: "networkidle" }` 后再 snapshot → 还是空则 `textIncludes` 等具体内容

## CAPTCHA 与反爬

遇到验证码、403/429、反机器人页面时**立即停止并告知用户**，不要盲目重试。

## 铁律

1. **每次操作后 BrowserSnapshot 验证状态**
2. **先 snapshot 再行动**，不要猜 selector
3. **等待页面就绪后再操作**
4. **文本不够看截图**
5. **不要暴露敏感信息**（密码填写后不要 snapshot）
6. **遇到反爬立即停止**
