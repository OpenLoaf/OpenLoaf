---
name: teenage-engineering-brand-design
description: This skill should be used when the user asks to "做成 teenage engineering 风格", "分析 teenage engineering 设计", "参考 teenage engineering 做页面", "做工业玩具极简风格", "做北欧电子产品品牌风格", "做像 teenage engineering 一样的产品页", "做像 teenage engineering 一样的商店页", or wants a design system inspired by teenage engineering's industrial, editorial, hardware-first visual language.
version: 0.1.0
---

# Teenage Engineering Brand Design

## Purpose

提炼并复用 `teenage.engineering` 的品牌视觉 DNA，用于：

- 风格分析与总结
- 新页面、新组件、新品牌物料的视觉提案
- 产品页、品牌页、商店页、活动页的界面设计
- 现有 UI 向“工业玩具极简主义”方向的改造

默认目标是“抓住气质，不复制资产”。避免直接复刻 logo、专有字体、产品命名、宣传文案、图标和整页构图。

## Source of Truth

执行任务前，先读取：

- `references/style-dna.md`

当任务需要落到 OpenLoaf Web 端实现时，再补充参考：

- `../web-style-system/SKILL.md`

如两者冲突，优先级如下：

1. 用户本次明确要求
2. `references/style-dna.md`
3. `../web-style-system/SKILL.md`

## Mode Selection

### Analysis Mode

在以下请求中使用：

- “分析 teenage engineering 风格”
- “总结这个品牌的设计语言”
- “拆一下它的排版/配色/字体/交互”

执行流程：

1. 先定义一句话风格结论。
2. 再拆 `版式 / 色彩 / 字体 / 图像 / 组件 / 动效 / 文案语气`。
3. 最后给出一句可复用的风格公式。

输出要求：

- 先给结论，再给分解。
- 明确“像什么”，也明确“不是什么”。
- 如用户要复用，补一版可执行设计规则。

### Build Mode

在以下请求中使用：

- “帮我做一个 teenage engineering 风格页面”
- “把这个产品页改成 teenage engineering 那种感觉”
- “做一个工业电子产品品牌官网”

执行流程：

1. 判断产物类型：品牌首页、产品详情、商店页、活动页、组件局部。
2. 选择参考强度：
   `轻参考`：只借骨架和气质。
   `中参考`：默认，能明显看出风格来源，但保留项目自身识别度。
   `强参考`：只用于风格研究稿或内部概念稿，不直接复刻品牌资产。
3. 先建立硬网格和留白秩序，再放产品图与技术标签。
4. 最后才补强调色、状态和轻交互。

输出要求：

- 先给整体视觉方向，再给组件规则。
- 交代默认态、hover、active、focus、disabled。
- 如需要代码，实现时优先输出 token、版式规则和关键组件语法。

### Review Mode

在以下请求中使用：

- “看下这个页面像不像 teenage engineering”
- “审一下这套 UI 是否符合这个品牌语言”
- “给我列出改造清单”

执行流程：

1. 读取目标页面或文件。
2. 用 `references/style-dna.md` 中的核心规则逐项比对。
3. 先报破坏品牌气质的高风险项，再报中低风险项。
4. 每条问题都给替代方向。

输出要求：

- 先列关键偏差，再给整改策略。
- 如果是代码评审，使用 `file:line` 定位。

## Default Workflow

1. 确认目标对象是 `品牌表达` 还是 `功能 UI`。
2. 判断页面主角是否是“产品/对象”而不是“运营文案/营销按钮”。
3. 使用 `references/style-dna.md` 设定：
   `硬网格 + 大留白 + 冷中性色 + 极少量高纯度点色 + 说明书式微文案 + 克制交互`。
4. 把重点资源优先投给：
   `产品摄影 / 英文字重与字号 / 边距 / 标签密度 / 信息层级`。
5. 最后检查是否掉进泛科技/SaaS 模板：
   渐变背景、发光边框、重阴影、过度圆润、组件堆砌、无差别按钮强调。

## Hard Rules

### 1. Product First

让产品、设备、包装、结构件或核心对象成为视觉主角。不要让 UI 装饰抢走主体。

### 2. Grid Before Decoration

先把栅格、对齐和留白做硬，再决定装饰。这个风格不是靠特效撑起来的。

### 3. Neutral Field + Sparse Accent

大面积使用冷白、浅灰、炭黑。高纯度强调色只做点状提气，不做大面积情绪渲染。

### 4. Technical but Playful

整体语气要像工业说明书、器材目录、展览铭牌，但需要保留一点年轻、俏皮、反常规的幽默。

### 5. Restraint in Motion

动效用于状态提示，不用于炫技。避免互联网产品常见的悬浮弹跳、胶质回弹和泛滥的滚动动画。

## Anti-Patterns

以下特征会明显破坏目标风格：

- SaaS 式紫蓝渐变、发光玻璃、霓虹边框
- 过多 box-shadow 和悬浮卡片
- 太软、太可爱、太圆润的消费级组件语法
- 依赖大段营销文案驱动首屏，而不是对象驱动首屏
- 使用 `Inter`、`Poppins`、`Space Grotesk` 一类常见默认方案后不做个性化处理
- 页面信息层级全靠颜色，不靠字号、位置、间距和密度

## Output Template

### Analysis Template

1. 一句话风格定义
2. 风格公式
3. 版式
4. 色彩
5. 字体
6. 图像与组件
7. 动效与文案语气
8. 可直接复用的设计规则

### Build Template

1. 设计目标
2. 参考强度
3. 页面骨架
4. 视觉系统
5. 关键组件规则
6. 风险与避坑

### Review Template

1. 总体符合度
2. 高风险偏差
3. 中低风险偏差
4. 最小整改批次

## Additional Resources

- `references/style-dna.md`：品牌风格 DNA、组件语法、配色与 Do/Don't
