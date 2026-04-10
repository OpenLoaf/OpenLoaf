---
name: browser-automation-guide
description: 浏览器自动化交互指南：表单填写、点击、登录、截图、翻页、下载图片。**仅在需要页面交互时触发**，不要仅因出现 URL/网址就触发。触发关键词：fill form、click button、login、截图、screenshot、翻页、scrape（多页抓取）、download image、automate、"登录这个网站"、"点一下"、"填表单"、"截个图"。**反例**（不要触发）：单次读取静态网页内容 → 用 WebFetch；事实性问题 → 用 WebSearch。
---

# 浏览器自动化指南

## 核心心智模型

浏览器自动化 = **观察-行动-验证** 循环。每次操作后必须 snapshot 确认状态，因为网页是有状态的——点击可能触发导航、弹窗、AJAX 加载，你无法预测结果。盲目连续操作是最常见的失败原因。

```
OpenUrl → snapshot → 分析 → act → wait → snapshot → 分析 → ...
```

## 第一个决策：用哪组工具？

这是最关键的选择。选错工具 = 白费力气。

**用 `WebSearch`** 当：
- 用户问的是事实性问题（"XXX 是什么"、"最新的 YYY"）
- 不需要访问特定页面，而是需要综合多来源信息

**用 `WebFetch`** 当：
- 有明确 URL，只需读取静态内容
- 页面不需要 JS 渲染（博客、文档、新闻文章）
- 不需要交互（不点击、不登录、不翻页）
- 比 browser 快 10 倍，优先尝试

**用 `browser-*`** 当：
- 需要登录或维持会话状态
- 页面是 SPA / JS 动态渲染（WebFetch 拿到空壳）
- 需要点击、填表单、翻页等交互
- 需要截图查看视觉布局
- 需要下载页面中的图片

**不确定？** 先试 `WebFetch`。如果返回内容为空或不完整，切换到 `browser-*`。

**需要原始结构？** `WebFetch` 和 `BrowserExtract/Snapshot/Observe` 都把**原始 body/outerHTML 存盘**，在返回的 `Raw saved → ...` / `rawHtmlPath` 字段给出路径。Summary 是有损的（丢 `<script>/<link>/<meta>`、属性、DOM 层级），需要分析依赖、selector、attr 时用 `Read`/`Grep` 读这个路径，**不要**反复调工具重抓。

## 三大核心工作流

### 工作流 1：信息提取

场景：用户给了一个 URL，要从中提取数据。

`BrowserExtract` 是信息提取的最高效工具——告诉它要什么，它直接返回结构化结果，无需手动解析 DOM。一次调用胜过 snapshot + 逐个解析。

流程：`OpenUrl` → `BrowserWait { type: "load" }` → `BrowserExtract { query: "提取所有产品名称和价格" }`

需要翻页抓取时，循环：`BrowserExtract` → `BrowserAct { action: "click-text", text: "下一页" }` → `BrowserWait { type: "networkidle" }` → 重复。每页都要 extract，别等到最后。

### 工作流 2：表单填写与登录

场景：用户需要在网页上填写并提交表单——包括登录、注册、搜索、数据录入。

关键洞察：**必须先 snapshot 看到表单结构**才能填写。不要猜 selector。

流程：
1. `OpenUrl` → `BrowserSnapshot` 查看表单字段和 selector
2. 对每个字段 `BrowserAct { action: "fill", selector: "...", text: "..." }`
3. 提交：`BrowserAct { action: "click-css", selector: "button[type=submit]" }`
4. `BrowserWait { type: "urlIncludes", url: "/success" }` 或 `textIncludes` 确认成功
5. `BrowserSnapshot` 最终确认

为什么用 `fill` 而不是 `click-css` + `type`？`fill` 原子性地聚焦+清空+输入，避免残留旧值。`type` 只在当前焦点追加字符，适合搜索框等简单场景。

**登录场景的独特点**：登录是特殊的表单填写。Cookie 在浏览器会话期间持久——登录一次后续操作都自动带认证，这是浏览器自动化相对 WebFetch 的核心优势。登录后用 `urlIncludes` 等待跳转到登录后的页面，然后就可以继续访问需要认证的内容。**安全注意**：填写密码后立即操作下一步，**不要** snapshot 或 extract 密码字段——这些结果可能被日志或屏幕共享暴露。

### 工作流 3：截图与视觉分析

场景：用户想看到页面的视觉呈现，或 snapshot 的文本不足以判断状态。

- `BrowserScreenshot {}` — 当前可视区域
- `BrowserScreenshot { fullPage: true }` — 完整页面长截图
- `BrowserDownloadImage { selector: ".product-image" }` — 下载页面中的图片元素

截图也是调试利器：当 snapshot 文本看不出问题时，截图看一眼。

### 图片下载生命周期

`BrowserDownloadImage` 下载的图片保存到当前项目的文件目录中，下载完成后返回文件路径。该路径可直接在后续操作中引用——如嵌入文档、作为 AI 输入、或通过 `Read` 查看。如需指定保存位置，在调用时提供目标路径参数。

## Selector 选择策略

snapshot 和 observe 会返回可交互元素列表，**从中选择 selector，不要自己猜**。

优先级（从高到低）和原因：
1. **`#unique-id`** — 全页唯一，最可靠
2. **`[data-testid="submit"]`** — 开发者故意留的锚点，不随 UI 重构变化
3. **`input[name="email"]`** — 表单字段的语义标识，很稳定
4. **`.btn-primary`** — CSS 类可能有多个匹配，小心
5. **`click-text`** — 最直观但最脆弱，多语言页面尤其危险

## 等待策略

操作后页面需要时间响应。选错等待方式 = 在未就绪的页面上操作 = 失败。

- **`load`**：传统页面导航后用。等待 DOMContentLoaded。
- **`networkidle`**：SPA/AJAX 页面首选。等待所有网络请求完成。最安全但最慢。
- **`urlIncludes`**：表单提交后用。等待 URL 变化到预期路径。
- **`textIncludes`**：等待特定内容出现。适合异步加载的结果。
- **`timeout`**：最后手段。只在上面都不适用时用固定等待。

## CAPTCHA 与反爬机制

遇到以下情况时**立即停止并告知用户**，不要盲目重试：
- CAPTCHA / 验证码（图形、滑块、reCAPTCHA）
- 403/429 等频率限制响应
- "请证明你是人类" 等反机器人页面
- Cloudflare 挑战页

告知用户具体遇到了什么障碍，建议用户手动完成验证后再继续自动化操作。

## 错误诊断决策树

**元素未找到？**
→ 先 `BrowserSnapshot` 确认当前页面状态
→ 页面对吗？可能已经导航到别处了
→ 内容在视口下方？`BrowserAct { action: "scroll", y: 500 }` 后再 snapshot
→ 还是找不到？`BrowserObserve { task: "找到提交按钮" }` 让 AI 辅助定位
→ 可能在 iframe 中——当前不支持跨 iframe 操作，考虑换方案

**页面加载超时？**
→ `OpenUrl` 的 `timeoutSec` 默认合理，但重型页面可能需要增加
→ 超时后 `BrowserSnapshot` 看看加载到哪了——可能内容已经够用

**操作没反应？**
→ 最常见原因：页面还没加载完就操作了。加 `BrowserWait` 再重试
→ 第二常见：selector 匹配了错误元素（比如隐藏的同名按钮）。snapshot 检查
→ 第三常见：弹窗/遮罩层挡住了目标元素。先关闭弹窗

**SPA 页面 snapshot 内容为空？**
→ JS 还没渲染完。`BrowserWait { type: "networkidle" }` 后再 snapshot
→ 还是空？尝试 `BrowserWait { type: "textIncludes", text: "预期内容关键词" }`

## 审批机制

以下工具需要用户审批才能执行：`OpenUrl`、`BrowserAct`、`BrowserDownloadImage`。这意味着每次调用都会暂停等待用户确认。

设计操作序列时考虑这点：尽量减少审批次数。比如填表单时，如果能一次性收集所有字段信息再连续 fill，比交替 snapshot-fill-snapshot-fill 更流畅。

## 铁律

1. **每次操作后验证状态**。不验证 = 在黑暗中操作。
2. **先观察再行动**。snapshot/observe 是免费的，错误操作代价很大。
3. **等待页面就绪**。SPA 页面尤其需要 `networkidle` 或 `textIncludes`。
4. **当文本不够时用截图**。`BrowserScreenshot` 是你的眼睛。
5. **选对工具层级**。`WebSearch` 用于事实性问题，`WebFetch` 用于已知 URL 的静态内容（快且轻量），`browser-*` 用于需要交互或 JS 渲染的场景。
6. **不要暴露敏感信息**。密码、token 等填写后不要 snapshot 确认内容。
7. **遇到反爬立即停止**。CAPTCHA、频率限制不要盲目重试，告知用户。
