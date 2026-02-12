---
name: web-style-system
description: This skill should be used when the user asks to "设计页面风格", "统一 layout 风格", "重做 tabs 样式", "对齐 ExpandableDockTabs 风格", "create a web style guide", "align layout and tabs style", "review UI consistency", or "audit web UI design".
version: 0.1.0
---

# Web Style System

## Purpose

建立并执行 Tenas Web 端统一设计语言。优先把 `layout + tabs + dock` 作为风格母版，再向全站组件扩展。

把本技能用于两类任务：

1. 生成模式：为新页面、新组件或重构场景产出可直接实现的设计方案。
2. 评审模式：审查现有 UI 与目标风格的一致性，并输出可执行整改项。

## Scope and Baseline

- 覆盖范围：`apps/web` 全站组件与布局。
- 基线样本：优先参考 `layout/tabs` 与 `ExpandableDockTabs`。
- 特殊约定：在“提取风格样本”阶段，不把邮箱页与技能页作为基线样本。
- 目标约束：全站强一致，但规则表达采用“设计原则优先 + 少量护栏指标”。

## Source of Truth

在执行任务前，按顺序读取：

1. `references/project-map.md`
2. `references/style-dna-layout-tabs.md`
3. `references/component-guidelines.md`
4. `references/review-checklist.md`
5. `references/external-skill-extensions.md`（仅当需要扩展）

如遇冲突，优先级如下：

1. 用户本次明确要求
2. `style-dna-layout-tabs.md`
3. `component-guidelines.md`
4. `review-checklist.md`

## Mode Selection

### Build Mode

在以下请求中使用：

- “帮我做一个新页面/组件风格”
- “把某模块改成和 tabs 一样的视觉语言”
- “统一布局样式”

执行流程：

1. 识别页面目标、交互密度、信息层级。
2. 从母版 DNA 选择对应风格语法（材质、圆角、色彩、动效）。
3. 按组件规范生成方案，先给整体，再给关键节点。
4. 标注不可破坏项（例如 tabs 交互节奏、层级关系、主题 token 兼容）。
5. 给出分阶段落地路径（先 layout/tabs，后页面域）。

输出要求：

- 先给设计方向，再给结构分解。
- 明确状态：默认、hover、active、focus、disabled、loading。
- 明确暗色主题表现，不允许只写亮色。

### Review Mode

在以下请求中使用：

- “审查 UI 一致性”
- “看下这个页面是否符合当前风格”
- “给我改造清单”

执行流程：

1. 读取目标文件与上下文容器（header/sidebar/main/tabs/dock）。
2. 用 `references/review-checklist.md` 逐类核对。
3. 先报高风险项，再报中低风险项。
4. 每条问题给出修复方向与影响范围。

输出要求：

- 使用 `file:line` 形式给定位点。
- 按严重度排序：`P0 > P1 > P2 > P3`。
- 结尾给最小可执行整改批次（建议 1~3 批）。

## Core Style Principles

### 1. Capsule-First Geometry

优先使用胶囊和圆角块建立 UI 节奏。交互主按钮、tab、dock item 使用连续圆角语法，避免同一区域混入生硬方角。

### 2. Soft Glass Layering

优先采用轻玻璃材质：低透明背景 + 细边框 + 背景模糊 + 柔和阴影。避免重金属拟态、强噪声材质和高饱和霓虹块。

### 3. Neutral Base, Local Accent

以中性底色承载信息密度，色彩强调只用于局部状态与语义高亮。强调“少而准”的彩色使用，而不是全局彩虹化。

### 4. Dense but Breathable

在紧凑信息密度下保留呼吸感：通过间隙、分隔线、透明层次和宽度动画建立节奏。禁止把所有控件压到同等权重。

### 5. Motion as State Communication

动效用于表达状态变化，不用于炫技。优先短时长、低位移、可回退的过渡。动画曲线与速度在同一模块内保持一致。

### 6. Adaptive Collapse

窄空间时优先折叠信息表达，不直接丢信息：例如从 icon+label 退化到 icon，再退化到 count badge 或 tooltip。

### 7. Token-First Implementation

优先复用现有 token（`--color-*`, `--sidebar-*`, `--radius-*`）。禁止在全站组件里散落难以维护的硬编码色值。

## Guardrail Metrics

仅保留必要护栏，避免把设计变成僵硬 lint：

- 关键交互动效时长优先落在 `0.16s ~ 0.24s` 区间。
- tabs/dock 微动效优先使用 spring，并保持模块内 stiffness/damping 统一。
- 主交互区域对比度满足可读性要求，焦点态必须可见。

## Output Templates

### Build Template

1. 设计目标与约束
2. 结构分层（Layout / Navigation / Content / Overlay）
3. 组件语法（几何 / 材质 / 状态 / 动效）
4. 主题策略（Light/Dark）
5. 实施顺序（批次化）

### Review Template

1. 结论摘要（整体符合度）
2. `P0/P1` 问题列表（含 `file:line`）
3. `P2/P3` 问题列表（含 `file:line`）
4. 最小整改批次与回归检查点

## Collaboration Notes

- 当请求仅要“规范/方案”时，只输出规范与决策，不直接改代码。
- 当请求要“实施改造”时，先给改造批次再进入代码修改。
- 当用户指定“对齐 ExpandableDockTabs 风格”时，默认提升该风格优先级。

## Additional Resources

- `references/project-map.md`：项目外到内地图与关键入口
- `references/style-dna-layout-tabs.md`：母版风格 DNA
- `references/component-guidelines.md`：组件级落地规范
- `references/review-checklist.md`：评审清单与报告格式
- `references/external-skill-extensions.md`：可选外部技能扩展
