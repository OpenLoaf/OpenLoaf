# React Hook 检查清单

本文档是“命令分析规则库”的 Hook 专题参考，专门记录在 OpenLoaf 中如何用命令行分析 React Hook 正确性、状态建模问题与运行时重渲染热点。目标是沉淀**规则**，不是记录某一次修了哪些组件。

## 适用场景

- 分析 `react-hooks` / React Compiler / `react-scan` 输出
- 建立或调整 Hook 分析入口脚本
- 判断某条 Hook 告警是行为错误、建模问题还是依赖噪音
- 规划“先修什么、后修什么”的治理顺序

## 推荐命令

### 默认静态分析入口

```bash
pnpm run analyze:hooks
```

适合先收敛默认规则下最值得优先治理的 Hook 问题。

### React Compiler 深度分析

```bash
pnpm run analyze:hooks:compiler
```

适合在默认告警收敛后继续看 React Compiler 相关限制，尤其是 `immutability`、组件创建时机、难以优化的闭包模式。

### 运行时重渲染扫描

```bash
pnpm run analyze:hooks:runtime
```

适合在静态问题已有明显收敛后，再观察真实交互下的重渲染热点。

### 局部文件验证

```bash
pnpm exec eslint --no-inline-config --config eslint-hooks.config.mjs <path...>
```

适合在改动少量文件后快速验证，不必每次都跑全量。

## 扫描边界规则

### 默认按 `apps/web/src` 与 `packages/ui/src` 联合分析

对 OpenLoaf 的 Hook 任务，默认边界应同时覆盖：

- `apps/web/src`
- `packages/ui/src`

原因是 Web 层会直接消费 UI 源码，很多 Hook 问题不会停留在单一 workspace 内。

### 运行时扫描与静态扫描分开解释

- 静态扫描回答“这个写法是否安全、是否利于优化”
- 运行时扫描回答“这个组件在真实交互下是否重渲染过多”

不要用运行时热点去否定静态规则，也不要因为静态通过就假设运行时没有问题。

## 结果分类顺序

优先按以下顺序处理：

1. `rules-of-hooks`、`immutability`
2. `set-state-in-effect`
3. `exhaustive-deps`
4. `static-components`
5. 运行时重渲染热点

如果第一层还没收敛，不要先大规模修第三层。

## 各类告警的判断规则

### A. `rules-of-hooks` / `immutability`

这类问题优先视为“行为正确性”问题，而不是风格问题。常见模式：

- 条件调用 Hook
- 提前 return 导致 Hook 次序不稳定
- 普通函数中调用 Hook
- 回调闭包提前引用同一行解构出的 `ref`
- 为了消依赖告警，把关键状态写进可变 `ref`

处理规则：

- 先保证 Hook 调用次序稳定
- 先把自引用回调改成预声明稳定引用
- 先避免在 effect 中回写已经被别的 effect /闭包读取的 ref

### B. `set-state-in-effect`

这类问题通常不是“少一个依赖”，而是状态建模不对。优先按以下方式判断：

- 这个 state 能否直接从 props、缓存、查询结果或主题状态派生
- 这个重置动作能否在事件处理函数里完成
- 这个默认值能否通过“开关 + key”或受控属性表达
- 这个同步动作是否真的是在订阅外部系统

优先修的高收益模式：

- 弹窗/菜单打开后用 effect 同步重置本地选择状态
- 查询结果返回后用 effect 回填本地镜像 state
- 主题、DOM class、输入模式等可直接派生的状态被复制进本地 state

### C. `exhaustive-deps`

这类问题要分“真实依赖遗漏”和“依赖噪音”两类：

- 真实遗漏：闭包里用到的函数、状态、参数确实会变
- 依赖噪音：`query.data ?? []`、`skills || []`、内联对象、内联函数让依赖每次都变化

优先修法：

- 把稳定空数组/空对象提到模块级常量
- 把逻辑表达式移进 `useMemo` / `useCallback` 内部
- 只在确实形成边界时再补 `useCallback`

避免的修法：

- 为了过规则机械包裹所有函数
- 把真实依赖藏进 `ref`
- 直接禁用规则

### D. `static-components`

这类问题要判断“是不是在 render 期间创建了组件类型”。常见于：

- `motion.create(...)`
- 动态图标组件选择
- 在组件体内声明子组件后立刻渲染

处理原则：

- 优先 hoist 到组件外
- 如果必须动态分派，优先返回数据或元素，而不是在 render 期间创建新组件类型

## 优先级规则

### 错误先于 warning

如果默认入口已经把 `error` 与 `warning` 分层，优先先把 `error` 收敛到 0，再开始系统性清理 warning。

### 小文件先于大文件

优先处理：

- 单个 effect 就能说明问题的小组件
- 单个 hook 工具文件
- 局部可验证的小范围 UI 组件

延后处理：

- Provider
- Layout
- 输入容器
- 同时承担多路副作用的大组件

### 规则治理先于个例整理

如果同一类告警在多个文件重复出现，优先总结成规则：

- “查询结果不要 effect 回填成镜像 state”
- “稳定空数组提到模块级”
- “弹窗关闭时重置状态放到开关事件里”

不要把技能写成某个组件的修复复盘。

## 验证规则

### 先做局部验证，再做全量验证

推荐顺序：

1. 对本次改动文件跑局部 eslint
2. 对受影响测试跑最小集验证
3. 再跑全量 `pnpm run analyze:hooks`

### Web 测试优先直接调用 `vitest`

如果只验证少量前端文件，优先使用：

```bash
pnpm --filter web exec vitest run --config vitest.config.ts <file...>
```

不要默认使用可能拉起大量仓库既有失败的聚合脚本。

### 输出中要说明“规则变化”而不只是“告警数字变化”

完成任务后，至少说明：

- 新增或确认了哪些 Hook 治理规则
- 本轮优先清掉了哪一层问题
- 哪些高风险文件被刻意延后
- 当前剩余告警主要集中在哪几类

## 何时更新技能

出现以下情况时，应把经验回写到本技能，而不是只留在本次任务里：

- 某类 Hook 告警连续多次重复出现
- 仓库已经形成新的统一脚本入口
- 某类误修路径被证明风险高，值得作为反例规则长期保留
- 某种验证方式被证明更稳定，适合成为默认流程
