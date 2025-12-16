# Tabs（Session-first + Keep-Alive）需求与实现方案

> 目标：实现“像浏览器 Tab 一样”的体验：切换 Tab 不销毁 DOM/组件树；切回时 UI 状态完全一致；后台 Tab 的对话流（SSE）不中断并持续推进；同时为性能在 Tab 非激活时冻结不必要的副作用。

本方案与现有文档关系：
- 参考 `docs/tabs-v2-session-based.md`：tabId 独立于 chatSessionId、资源抽象与执行端常驻（未来 Electron/browser resource）。
- 参考 `docs/chat-refactor-design.md` / `docs/ai-sdk-ui-mdx-research.md`：基于 AI SDK v6 的 `useChat/messages/parts` 做工具渲染与自动触发。
- 参考 `docs/embedded-browser-ai-automation.md`：未来 LeftDock 中的 `browser` stack 可接入 Electron WebContentsView + CDP。

---

## 1. 背景与核心诉求

你最关心的点是：**Tab 切换回来时内容要完全一致**，包括但不限于：
- 左面板（LeftDock）中每个 stack 的滚动位置、光标位置、展开/折叠状态、未保存文本等。
- 右侧 AI Chat 的滚动位置、输入框内容、展开状态等。
- 切换到别的 tab 后，当前 tab 的 SSE 继续跑；工具结果继续触发自动打开 stack；用户切回来时应已处于最新状态。

如果把上述“细碎 UI 状态”都做成临时保存（store 序列化）会非常痛苦且脆弱（每个组件都要接入保存/恢复协议）。因此本方案选择浏览器式做法：

**切换 Tab 不卸载 UI 树（Keep-Alive），只切换可见性。**

这样 DOM 与组件内部 state 自然保留，达到“切回去完全一致”的效果。

---

## 2. 需求清单（最终行为）

### 2.1 Tab 与会话
- `tabId` 必须随机生成，与 `chatSessionId` 无关（不复用、不推导）。
- 每个 tab 绑定一个 `chatSessionId`（用于右侧 Chat 的 `useChat({ id })`）。
- tab 内若发生“切换会话”（new session / select session）：**清空 stack、保留 project base**。

### 2.2 右侧 AI 面板（永远是 Chat）
- 复用现有 `apps/web/src/components/chat/Chat.tsx`（不新建 ChatV2）。
- 只有当左侧存在 `base`（项目面板）时，才允许“临时折叠/隐藏右侧 AI Chat”。
- 希望保留现有左右面板宽度动画逻辑（非强制：tab 切换也可加淡入淡出/滑动）。

### 2.3 左侧面板 LeftDock（base + stack）
- LeftDock 的 `stack` 支持持续叠加（类似现有 `PanelRenderer` overlay）。
- 只允许“stack 清空后自动隐藏”（宽度变 0）；不允许在 stack 非空时把左侧折到 0。
- 左侧有最小宽度（以 px 为准更稳定），小于最小宽度不能再缩小。
- 绑定项目后：LeftDock 固定显示项目面板（base），且 **不允许折到 0**；之后所有查看内容作为 stack 叠加在项目面板上。
- 刷新页面后：恢复“打开了哪些 stack”（恢复基本组件实例即可，不要求恢复每个组件的细粒度临时状态）。

### 2.4 自动触发打开 stack（默认策略）
- 由 ai-sdk v6 的 `messages[].parts` 驱动：工具返回结果 / 特殊 part type 触发自动打开对应 stack。
- 切到别的 tab 时，如果该 tab 后台继续产生 tool parts，也要继续触发“自动打开 stack”（用户切回时能看到已打开的 stack）。

---

## 3. 关键设计：Keep-Alive TabScene（浏览器式）

### 3.1 为什么不做“保存/恢复全部 UI 状态”
- “光标位置/代码块折叠/滚动/未保存文本”等状态天然属于 DOM 与组件内部 state。
- 让每个组件都实现“序列化/反序列化协议”成本巨大，且未来组件变化会频繁破坏兼容。

因此采用：
- **切换 tab 不卸载**（不 unmount）
- DOM 与 React state 原样保留
- 达到“像浏览器 tab 一样”的一致性

### 3.2 组件树结构（概念）

在 `MainContextV2` 内渲染 tab 的 scene。为避免“刷新后一次性挂载十几个 tab 导致卡顿”，采用 **惰性挂载（lazy-mount）**：
- **刷新/首次进入**：只渲染当前 `activeTabId` 对应的 scene
- **用户点击某个 tab**：该 tab 的 scene 才会首次挂载
- **一旦挂载过**：后续切换只切换可见性（keep-alive），不再卸载

```tsx
<div className="relative h-full w-full">
  {tabs
    .filter((tab) => mounted[tab.tabId]) // 仅渲染已挂载的 tab（默认只有 active）
    .map((tab) => (
      <TabScene
        key={tab.tabId}
        active={tab.tabId === activeTabId}
        tab={tab}
      />
    ))}
</div>
```

其中 `mounted` 是一个仅运行期（不持久化）的“已挂载 tab 集合”，切换到某个 tab 时把它标记为已挂载：

```ts
const [mounted, setMounted] = useState<Record<string, boolean>>(() =>
  activeTabId ? { [activeTabId]: true } : {}
);

useEffect(() => {
  if (!activeTabId) return;
  setMounted((prev) => (prev[activeTabId] ? prev : { ...prev, [activeTabId]: true }));
}, [activeTabId]);
```

`TabScene` 内部结构（概念）：
- 左侧：`LeftDock`（base + stack）
- 右侧：`Chat`（现有组件，sessionId=tab.chatSessionId）

切换 tab 时：
- 只改变 `active`，通过样式控制“可见/可交互”
- 不卸载、不重建 DOM

推荐隐藏策略（不影响状态保留）：
- `opacity: 0` + `pointer-events: none` + `position: absolute; inset: 0;`
- 可选：`content-visibility: hidden` / `contain` 做渲染优化（注意评估对滚动与测量的影响）

### 3.3 惰性挂载与“后台持续”的边界
惰性挂载的含义是：**未被点击过的 tab 在本次页面生命周期内不会创建其 DOM/组件树**，因此也不会产生任何副作用（包括 Chat 的连接）。

这满足“刷新后不卡”的目标，但也意味着：
- 刷新后，未被用户重新点击的 tab 不会自动建立 SSE/stream 连接；
- 用户点击该 tab 时才开始渲染，并由 `useChat({ resume: true })` 尝试恢复/续传（如果服务端支持）。

一旦某个 tab 的 scene 已挂载过，后续 tab 切换仍保持 keep-alive，因此“切换 tab 不断 SSE”的目标仍成立。

---

## 4. SSE / Stream 不断的保证

现有 `Chat.tsx` 通过 `ChatProvider` 使用 `useChat` 建立流式请求：
- 只要 `ChatProvider` 不卸载，底层 `fetch`/stream reader 就不会因 React unmount 被 `abort`。

Keep-Alive 结构天然满足：
- 切换 tab 不卸载 `ChatProvider`
- SSE/流继续跑
- 后台消息继续 append（即便用户暂时看不到）

因此“切回时应处于最新状态”天然成立。

> 注意：tab 内发生 `chatSessionId` 变化时（new/select session），`Chat.tsx` 当前实现会对 `ChatProvider` 设置 `key={sessionId}`，这会主动 remount 并切换到新流；该行为符合“切会话就换上下文”的预期。

---

## 5. LeftDock：base + stack 规则（可实现且可扩展）

### 5.1 状态模型（建议）
- `base?: DockItem`：项目面板等固定底座（绑定项目后存在）
- `stack: DockItem[]`：叠加层（文件/网页/工具结果/browser 等）
- `leftWidthPx`：左侧宽度（像素更适合做最小宽度约束）
- `rightChatCollapsed`：右侧是否折叠（仅当 base 存在时允许）

### 5.2 关键规则映射
- 新建 tab：`base=null, stack=[], leftWidthPx=0`（左侧隐藏）
- 自动打开 stack：`stack.push(item)`；若 `leftWidthPx==0` 则设为默认宽度（>=min）
- 关闭 stack：从 `stack` 移除
- 自动隐藏：仅当 `base==null && stack.length==0` 时，`leftWidthPx=0`
- 最小宽度：当 `leftWidthPx>0` 时，`leftWidthPx>=LEFT_MIN_PX`
- 绑定项目：`base=project(pageId)`，且强制 `leftWidthPx>=LEFT_MIN_PX`，禁止折到 0
- tab 内切会话：**清空 stack，保留 base**

### 5.3 Overlay UI
LeftDock 的 stack 展示可以复用现有 overlay 思路（参考 `apps/web/src/components/layout/PanelRenderer.tsx`）：
- base 渲染在底
- stack 逐层覆盖，仅顶层可交互；底层 blur/opacity

---

## 6. 刷新后的恢复：只恢复“结构态”，不恢复“细粒度临时态”

Keep-Alive 解决的是“单次运行期”内的 tab 切换一致性；刷新后 DOM 会丢失，因此只要求恢复：
- 打开了哪些 stack（以及顺序）
- base 是什么（绑定项目）
- 宽度与折叠状态
- activeTabId

不强求恢复（除非未来明确需要）：
- 光标位置、未保存文本、scrollTop（这些属于临时态，跨刷新通常不保证）

为此要求 `DockItem` 必须是“可重建描述符”，而不是存 JSX/组件树。

---

## 7. 自动触发打开 stack（ai-sdk v6 parts）

触发源来自 `useChat().messages[].parts`：
- `part.type` 可能是 `tool-*` / `dynamic-tool` 或未来自定义类型（如 write 的特殊 part）。
- `toolCallId` 可作为稳定去重 key（如果存在）。

建议实现为一个“解析器 + 去重策略”：
- `DockItem.id/sourceKey = toolCallId ?? fallback(messageId+index)`
- 同一个 sourceKey 再次出现时不重复插入，而是“置顶/聚焦”。

触发位置建议：
- 放在消息渲染层（例如工具 part 的渲染组件里），当 `part.state` 从生成中进入 `output-available/done` 时触发。
- 由于 tab keep-alive，即使 tab 不可见，这些 effect 仍会运行，从而保证“后台继续打开 stack”。

---

## 8. 性能：Tab 切换后冻结副作用（Foreground-only effects）

Keep-Alive 的代价是：所有 tab 的组件都 mounted，副作用也可能继续运行。为避免后台 tab 造成 CPU/IO 压力，要求：

- **只冻结“不影响后台正确性”的副作用**（例如轮询、动画 tick、重计算、事件监听等）。
- **不要冻结必须后台持续的逻辑**（例如 Chat stream、tool 触发 stack 的状态更新）。

补充：采用第 3.2 的惰性挂载后，“刷新/首次进入”阶段只有 active tab 会 mounted，可显著降低初始渲染与副作用数量；后续仍需对“已挂载但非激活”的 tab 做副作用冻结。

### 8.1 推荐模式：TabActive 上下文 + effect gating

给每个 `TabScene` 提供 `active`（是否前台），并在组件中用 gating hook：

```ts
function useTabActive(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const id = setInterval(work, 1000);
    return () => clearInterval(id);
  }, [active]);
}
```

扩展建议（按需）：
- `useTabEffect(active, effect, deps)`：统一封装 `if (!active) return` 逻辑
- `useTabInterval(active, fn, delay)` / `useTabEventListener(active, target, ...)`
- React Query：`enabled: active`
- ResizeObserver/MutationObserver：inactive 时 disconnect

### 8.2 应冻结的典型副作用
- setInterval / setTimeout 轮询
- requestAnimationFrame 循环动画
- window/document 事件监听（scroll、mousemove、resize）
- ResizeObserver / IntersectionObserver / MutationObserver
- 频繁 reflow 的测量（getBoundingClientRect）循环

### 8.3 不应冻结的逻辑（必须后台持续）
- Chat SSE/stream（否则违背“后台继续生成”）
- tool parts 解析与“自动打开 stack”的状态更新
- tab 内关键数据持久化写入（轻量）

---

## 9. 文件命名约定（按当前要求）

原则：**只有“替换现有模块”才使用 V2 后缀；新增模块不带 V2。**

示例：
- 现有有 `use_tabs.ts` ⇒ 新实现：`use_tabsV2.ts`
- 现有有 `MainContext.tsx` ⇒ 新实现：`MainContextV2.tsx`
- 当前没有 `LeftDock` ⇒ 新实现：`LeftDock.tsx`（不叫 LeftDockV2）
- 当前没有 `TabScene` ⇒ 新实现：`TabScene.tsx`

---

## 10. 实施步骤（MVP → 可用）

1) 新 store：`use_tabsV2.ts`（持久化结构态：tabs/active/base/stack/宽度/折叠）
2) 新布局：`MainContextV2.tsx`（惰性挂载：刷新后只渲染 active；点击后再挂载；已挂载的切换只改 active，不卸载）
3) 新 LeftDock：`LeftDock.tsx`（base+stack overlay；最小宽度约束；stack 清空才隐藏）
4) 接入现有 Chat：每个 TabScene 渲染 `Chat` 并绑定 `sessionId=tab.chatSessionId`
5) 自动打开 stack：基于 `messages.parts` 的解析器 + 去重 + push stack
6) 前台/后台副作用 gating：提供 `TabActive`，在需要的组件里按需接入

---

## 11. 验收清单（必须通过）

- 切换 tab 后再切回：LeftDock/stack 的滚动位置、输入框、折叠状态保持一致（同一次运行期）。
- 后台 tab 的 SSE 不断，生成继续；tool 触发继续打开 stack；切回时能看到最新状态。
- 左侧 stack 非空时不能折到 0；stack 清空后自动隐藏；左侧宽度有最小值。
- 绑定项目后 base 固定显示且不能折到 0；仅此时允许折叠右侧 AI Chat。
- 刷新页面后：能恢复“打开了哪些 stack/哪个项目 base/宽度与折叠/activeTab”。
- 刷新页面后：初次只渲染当前 active tab 的 scene；其他 tab 不会批量渲染，需用户点击后才首次挂载。
