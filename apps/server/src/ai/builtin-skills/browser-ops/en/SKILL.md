---
name: browser-ops-skill
description: >
  Triggered when the user asks for page-level interaction with a specific webpage: login, form filling, button clicks, pagination scraping, screenshots, downloading page images, handling CAPTCHAs or anti-bot measures, accessing SPA dynamic content; also used as a fallback when WebFetch returns an empty shell or gets blocked. Typical phrasing: "log me into X then scrape Y", "take a screenshot". **Not for**: factual questions or "what is xx" (→ `WebSearch`), or simply reading static webpage text (try `WebFetch` first).
---

# Browser Operations Guide

## Tool Inventory

| Tool | Purpose | Read-only |
|------|---------|-----------|
| `OpenUrl` | Open a webpage (headless / tab / window — three modes) | Yes |
| `BrowserSnapshot` | Get page text + interactive element list + screenshot + rawHtml in one call | Yes |
| `BrowserAct` | Page interaction (click / input / scroll / keypress) | No |
| `BrowserWait` | Wait for page state (load / networkidle / url / text / timeout) | Yes |
| `BrowserDownloadImage` | Download an image from the page to local disk | No |

> **Loading**: All are deferred tools — call `ToolSearch(names: "OpenUrl,BrowserSnapshot,BrowserAct,BrowserWait,BrowserDownloadImage")` to activate their schemas before invoking.

## Core Mental Model

Browser operations = **observe-act-verify** loop. After every action you must snapshot to confirm state, because webpages are stateful — a click may trigger navigation, a popup, or an AJAX load, and you cannot predict the outcome. Blindly chaining actions is the single most common failure mode.

```
OpenUrl → BrowserSnapshot → analyze → BrowserAct → BrowserWait → BrowserSnapshot → ...
```

## OpenUrl Opening Modes

- **`headless`** — First choice for pure automation. No UI; suited for scraping, background agents, and batch operations.
- **`tab` (default)** — Use when the user needs to see/operate the page. Embedded panel.
- **`window`** — Use when the user needs a standalone window for deep interaction.

**Rule of thumb**: user doesn't need to see it → `headless`; user needs to see it → `tab`; user wants a standalone window → `window`.

## BrowserSnapshot Details

A single BrowserSnapshot call returns:
- **Page info**: URL, title, readyState
- **Full text**: body.innerText (truncated at 32KB)
- **Interactive element list**: up to 120 clickable/inputtable elements with their selectors
- **iframe contents**: text and elements from same-origin iframes
- **Screenshot**: captures the full page by default (fullPage), saved to the session asset directory
- **rawHtmlPath**: disk path to the complete outerHTML

**What if text exceeds 32KB?** Use `Read`/`Grep` on `rawHtmlPath` to fetch the full DOM — don't re-snapshot repeatedly.

**Screenshot control**: `fullPage: false` captures only the current viewport.

## Three Core Workflows

### Workflow 1: Information Extraction

`OpenUrl` → `BrowserWait { type: "load" }` → `BrowserSnapshot`

Extract the required information directly from the returned text.

Pagination scraping: `BrowserSnapshot` → `BrowserAct { action: "click-text", text: "Next" }` → `BrowserWait { type: "networkidle" }` → loop. Snapshot on every page.

### Workflow 2: Form Filling and Login

1. `OpenUrl` → `BrowserSnapshot` to inspect form structure and selectors
2. For each field: `BrowserAct { action: "fill", selector: "...", text: "..." }`
3. Submit: `BrowserAct { action: "click-css", selector: "button[type=submit]" }`
4. `BrowserWait { type: "urlIncludes", url: "/success" }` to confirm success
5. `BrowserSnapshot` for final confirmation

**fill vs type**: `fill` atomically clears and inputs — best for forms; `type` appends characters at the current focus — best for search boxes.

**Login caveats**: Cookies persist for the session, so after a single login subsequent requests carry auth automatically. **Do not** snapshot password fields.

### Workflow 3: Screenshots and Image Downloads

- `BrowserSnapshot` — snapshot + full-page screenshot (fullPage by default)
- `BrowserSnapshot { fullPage: false }` — viewport only
- `BrowserDownloadImage { selector: ".product-image" }` — download an image from the page

Screenshots are a debugging superpower: when text doesn't reveal the issue, the screenshot often does at a glance.

## Selector Selection Strategy

Pick selectors from the element list returned by BrowserSnapshot — **don't guess on your own**.

Priority: `#id` > `[data-testid]` > `input[name]` > `.class` > `click-text`

## Wait Strategies

- **`load`**: Use after traditional page navigation.
- **`networkidle`**: First choice for SPA/AJAX pages — safest but slowest.
- **`urlIncludes`**: Wait for redirect after form submission.
- **`textIncludes`**: Wait for asynchronously loaded content.
- **`timeout`**: Last resort.

## Error Diagnosis

**Element not found?** → BrowserSnapshot to confirm page state → may have navigated elsewhere → may be below the viewport (scroll and retry) → may be inside an iframe (cross-iframe not supported)

**Page load timeout?** → BrowserSnapshot to see how far loading got; the content may already be sufficient.

**Action has no effect?** → Page not fully loaded (add BrowserWait) → selector matched the wrong element (check via snapshot) → a popup is blocking (close it first)

**SPA content empty?** → Snapshot again after `BrowserWait { type: "networkidle" }` → if still empty, wait on specific content with `textIncludes`

## CAPTCHAs and Anti-Bot

When you encounter a CAPTCHA, 403/429, or an anti-bot page, **stop immediately and notify the user** — do not retry blindly.

## Iron Rules

1. **BrowserSnapshot after every action to verify state**
2. **Snapshot before acting** — don't guess selectors
3. **Wait for the page to be ready before acting**
4. **When text isn't enough, look at the screenshot**
5. **Don't expose sensitive info** (don't snapshot after filling a password)
6. **Stop immediately on anti-bot encounters**
