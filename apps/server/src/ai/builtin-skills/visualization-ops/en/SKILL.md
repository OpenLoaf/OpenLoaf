---
name: visualization-ops-skill
description: >
  **Required for visualized output.** When the prompt involves news/briefings/market updates/rankings/reports/summaries/analyses/comparisons/selection/recommendations/roundups/retrospectives, or is expected to return 3+ structurable items, **this skill must be loaded before (or in the same turn as) the data-fetching tool**. Once loaded, **do not finish with plain markdown text**—you must render via JsxCreate or ChartRender. Typical examples: "search the latest news about Iran", "compare Obsidian/Notion/Logseq", "recommend a few books", "how is the stock market recently". **Not for**: single-fact Q&A, pure code output, adding/removing nodes inside the canvas (handled by the canvas sub-agent).
---

# Visualization Rendering

## Tool Inventory

| Tool | Responsibility | Read-only |
|------|----------------|-----------|
| `JsxCreate` | Live JSX component rendering (cards / lists / tables / rich text and other structured output) | No |
| `ChartRender` | ECharts chart rendering (line / bar / pie / scatter / radar / heatmap / map) | Yes |

> **Loading**: both are deferred tools. Before calling, activate their schemas via `ToolSearch(names: "JsxCreate,ChartRender")`.

## Silent Rendering Channel (read before acting)

Think of your output as two parallel channels:

- **text channel**: the markdown you write, inserted inline into the conversation in order
- **render channel**: the output of `JsxCreate` / `ChartRender` appears as standalone bubbles directly shown to the user in chat

The user sees **both** channels at once. So just like a person who finishes writing a letter doesn't add "I just finished writing the letter"—do not pre-announce before calling these tools ("let me organize the data first / I'll create a line chart / now let me make another summary card"), and do not summarize afterward ("chart rendered / card generated"). The user already saw it; those words are just noise.

Correspondingly, your step-level `text` should in most cases be **empty**, until after the final tool call, when you write a **single** concluding passage of text—and only in one of the following situations:

- Genuine **data interpretation** that needs to be added: conclusions, anomalies, trend implications, next-step recommendations
- **Context** the user needs that isn't visible inside the bubble: data source, coverage, confidence level, timeliness

If none of those apply, writing no text at all is perfectly fine—the tool bubbles themselves are the answer.

**Anti-pattern** (an actual play-by-play from a real session, to be avoided):

> step 2: "The search results returned some stock market information, but mostly landing pages of market centers, missing concrete stock data. Let me search for something more specific…"
> step 3: "Good, now I have some concrete stock market data. Let me organize the past week's stock data…"
> step 4: "Now I've loaded ChartRender and JsxCreate. Let me create a line chart…"
> step 5: "Chart rendered. Now let me use JsxCreate to make a summary card…"
> step 6: "Done. I used ChartRender to render … and used JsxCreate to create …"

All 5 of those text passages should be deleted, keeping only the final genuine interpretation like "Looking at the data, the A-share market has oscillated upward over the past week…".

## Decision Tree

```
Needs visualized output
├── Data chart (line/bar/pie/scatter/radar/heatmap/map)?
│   └── ChartRender (ECharts option)
├── Custom card/panel/layout/status display/information summary?
│   └── JsxCreate (JSX component)
└── Unsure?
    ├── Has numeric trends/comparisons/distributions → ChartRender
    └── Other structured information display → JsxCreate
```

## ChartRender — ECharts Chart Rendering

Submit an ECharts option to render a chart inside the message. The frontend uses the ECharts library and supports all ECharts chart types.

**Parameters**:
- `option` (required): complete ECharts option object or a JSON string
- `title` (optional): chart title
- `height` (optional): chart height (pixels)

**Key points for writing an ECharts option**:
- Complete ECharts option structure including `xAxis`/`yAxis`/`series` etc.
- Supports all ECharts chart types: line, bar, pie, scatter, radar, heatmap, treemap, sunburst, sankey, gauge, etc.
- Setting `tooltip` and `legend` is recommended for readability
- The color scheme automatically adapts to light/dark themes

**Examples**:

Bar chart:
```json
{
  "option": {
    "xAxis": { "type": "category", "data": ["Mon", "Tue", "Wed", "Thu", "Fri"] },
    "yAxis": { "type": "value" },
    "series": [{ "type": "bar", "data": [120, 200, 150, 80, 70] }],
    "tooltip": { "trigger": "axis" }
  },
  "title": "Weekly Data"
}
```

Pie chart:
```json
{
  "option": {
    "series": [{
      "type": "pie",
      "radius": "60%",
      "data": [
        { "value": 335, "name": "Direct" },
        { "value": 234, "name": "Email" },
        { "value": 154, "name": "Search" }
      ]
    }],
    "tooltip": { "trigger": "item" },
    "legend": { "orient": "vertical", "left": "left" }
  }
}
```

## JsxCreate — JSX Component Rendering

Renders JSX components live inside the chat interface. Suitable for displaying custom cards, status panels, information summaries, and other structured content.

**Parameters**:
- `content` (required): JSX string

**Core rules**:
1. Write only a JSX fragment, **the top level must be one or more element nodes**. Do not write `import`/`export`/`const`/`let`/`function`/function definitions.
2. **No IIFE**: do not wrap everything in an immediately-invoked function like `{() => { ... return (...) }()}` or `{(function(){...})()}`—the validator will reject it. This is the single most common anti-pattern from models such as MiniMax.
3. Construct data with inline expressions: `{[{name:'A'},{name:'B'}].map(x => <div key={x.name}>{x.name}</div>)}`
4. `{}` expressions, `map`, conditional rendering, and `style={{...}}` are allowed
5. The `{...props}` spread syntax is not supported
6. Call JsxCreate only once per reply

**Wrong vs. correct example**:

```jsx
// ❌ Wrong: top level is a function, validation fails
{() => {
  const items = [{title: 'A'}, {title: 'B'}]
  return <div>{items.map(i => <p>{i.title}</p>)}</div>
}()}

// ✅ Correct: top level is an element, data expressed inline
<div className="flex flex-col gap-2 p-3">
  {[{title: 'A'}, {title: 'B'}].map((item, i) => (
    <div key={i} className="rounded-lg bg-card p-2 text-sm">{item.title}</div>
  ))}
</div>
```

**After validation fails**: the tool returns an absolute path and the error reason. **Prefer re-calling JsxCreate with a full corrected content** (a complete rewrite is less error-prone than a partial Edit). Only use Edit on that absolute path when the issue is clearly an isolated character-level problem. Do not Glob/Read to look for the file—the absolute path is already in the error message.

**Color scheme conventions**:

OpenLoaf uses an Apple-style flat palette. All colors are routed through semantic tokens that adapt to light/dark themes. Writing `bg-white` or `text-gray-800` directly will turn into a harsh white block or invisible text in dark mode—so only use semantic tokens:

Base colors: `bg-card`, `bg-muted`, `text-foreground`, `text-muted-foreground`

Semantic accent colors (low-opacity background + flat text, legible in both themes):
- Blue / Info: `bg-ol-blue/10 text-ol-blue`
- Green / Success: `bg-ol-green/10 text-ol-green`
- Amber / Warning: `bg-ol-amber/10 text-ol-amber`
- Red / Error: `bg-ol-red/10 text-ol-red`
- Purple / Special: `bg-ol-purple/10 text-ol-purple`

Tags / badges: `rounded-full px-2.5 py-0.5 text-xs` combined with the flat colors above.

Do not use gradients (`bg-gradient-*`), shadows (`shadow-*`), or outer borders (`border`/`ring`)—JSX components are embedded inside the chat message stream, and such decorations make the card look like a standalone popup rather than part of the message, breaking reading flow.

**Style conventions**:
- Rounded corners `rounded-lg`/`rounded-xl`, tight spacing (`p-3`~`p-4`, `gap-2`~`gap-3`)
- Prefer small font sizes `text-sm`/`text-xs` and wide horizontal layouts—chat window width is limited, and overly tall content forces the user to scroll for a long time.

**Allowed component whitelist** (case-sensitive):
Message, MessageContent, Panel, Snippet, SnippetAddon, SnippetText, SnippetInput, SnippetCopyButton, CodeBlock, Checkpoint, Task, TaskTrigger, TaskContent, TaskItem, TaskItemFile, Image, Attachments, Attachment, AudioPlayer, AudioPlayerElement, AudioPlayerControlBar, AudioPlayerPlayButton, AudioPlayerSeekBackwardButton, AudioPlayerSeekForwardButton, AudioPlayerTimeDisplay, AudioPlayerTimeRange, AudioPlayerDurationDisplay, AudioPlayerMuteButton, AudioPlayerVolumeRange, WebPreview, WebPreviewNavigation, WebPreviewNavigationButton, WebPreviewUrl, WebPreviewBody, WebPreviewConsole

Using bordered components such as Message/Panel/Snippet as outer containers is not recommended.

**Validation and correction**:
- The server validates JSX syntax; violations error out directly
- Even if validation fails the file is still written; the error message includes the path. Fix it with `Edit` and the preview will refresh
- After a failure, fix via `Edit`—do not call JsxCreate again

**Write location**: `[<sessionId>]/asset/jsx/<messageId>.jsx` (inside the session's asset directory; `Edit` can patch it in place).

**Interactive forms**: when you need to collect user input, ask the user directly in plain text and wait for a reply. JsxCreate is for display only.

## When to use ChartRender vs JsxCreate

| Scenario | Recommended tool |
|----------|-----------------|
| Numeric trends / comparisons / distributions | ChartRender |
| Custom cards / panels | JsxCreate |
| Mixed statistics + charts | First ChartRender for the chart, then JsxCreate for the summary card |
| Simple data (2–3 metrics) | JsxCreate alone, no chart needed |
| Complex interactive charts | ChartRender (ECharts has built-in interactions) |
